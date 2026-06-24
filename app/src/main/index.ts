import { spawn } from "node:child_process";
import { createReadStream, readFileSync, statSync } from "node:fs";
import { join, normalize } from "node:path";
import { Readable } from "node:stream";
import { app, BrowserWindow, ipcMain, type IpcMainInvokeEvent, protocol, shell } from "electron";
import { parseEdl } from "@reel/edl";

// In dev (electron-vite) __dirname is <repo>/app/out/main, so the repo root is
// three levels up. Allow an override for packaged/other layouts.
const REPO_ROOT = process.env["REEL_ROOT"] ?? join(__dirname, "..", "..", "..");
const PROJECTS_DIR = process.env["REEL_PROJECTS_DIR"] ?? join(REPO_ROOT, "projects");
const RENDER_SCRIPT = join(REPO_ROOT, "app", "scripts", "render.mjs");
const ANALYZE_SCRIPT = join(REPO_ROOT, "app", "scripts", "analyze.mjs");
const TRANSCRIBE_SCRIPT = join(REPO_ROOT, "app", "scripts", "transcribe.mjs");

// Serve project media to the sandboxed renderer (the Remotion Player can't read
// file:// from an http origin). reel-asset://<slug>/<relPath> -> projects/<slug>/<relPath>
protocol.registerSchemesAsPrivileged([
  {
    scheme: "reel-asset",
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true },
  },
]);

function mimeFor(file: string): string {
  const ext = file.slice(file.lastIndexOf(".")).toLowerCase();
  switch (ext) {
    case ".mp4":
    case ".m4v":
      return "video/mp4";
    case ".mov":
      return "video/quicktime";
    case ".webm":
      return "video/webm";
    case ".mp3":
      return "audio/mpeg";
    case ".wav":
      return "audio/wav";
    case ".m4a":
      return "audio/mp4";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    default:
      return "application/octet-stream";
  }
}

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#16140f",
    title: "Reel Studio",
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
      sandbox: false,
    },
  });

  win.on("ready-to-show", () => win.show());
  win.webContents.setWindowOpenHandler((details) => {
    void shell.openExternal(details.url);
    return { action: "deny" };
  });

  if (process.env["ELECTRON_RENDERER_URL"]) {
    void win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

function loadProject(slug: string) {
  try {
    const dir = join(PROJECTS_DIR, slug);
    const raw = JSON.parse(readFileSync(join(dir, "edl.json"), "utf8"));
    const result = parseEdl(raw);
    let promptText = "";
    try {
      promptText = readFileSync(join(dir, "prompt.md"), "utf8");
    } catch {
      // prompt.md is optional
    }
    return { ...result, slug, dir, promptText };
  } catch (err) {
    return { ok: false, errors: [String(err)], slug };
  }
}

function runScript(
  scriptPath: string,
  slug: string,
  event: IpcMainInvokeEvent,
  channelPrefix: string,
): Promise<{ ok: boolean; output?: string; error?: string }> {
  return new Promise((resolve) => {
    const child = spawn("node", [scriptPath, "--slug", slug], { cwd: REPO_ROOT, env: process.env });
    let output = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      for (const line of chunk.toString().split("\n")) {
        const progress = line.match(/PROGRESS (\d+)/);
        if (progress) event.sender.send(`${channelPrefix}:progress`, Number(progress[1]));
        const phase = line.match(/PHASE (.+)/);
        if (phase) event.sender.send(`${channelPrefix}:phase`, phase[1].trim());
        const done = line.match(/DONE (.+)/);
        if (done) output = done[1].trim();
      }
    });
    child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
    child.on("close", (code) => {
      if (code === 0) resolve({ ok: true, output });
      else resolve({ ok: false, error: stderr.trim() || `Process exited with code ${code}` });
    });
    child.on("error", (err) => resolve({ ok: false, error: String(err) }));
  });
}

app.whenReady().then(() => {
  protocol.handle("reel-asset", (request) => {
    const url = new URL(request.url);
    const slug = url.hostname;
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    const file = normalize(join(PROJECTS_DIR, slug, rel));
    if (!file.startsWith(normalize(PROJECTS_DIR))) {
      return new Response("Forbidden", { status: 403 });
    }

    let size: number;
    try {
      size = statSync(file).size;
    } catch {
      return new Response("Not found", { status: 404 });
    }

    const mime = mimeFor(file);
    const range = request.headers.get("Range");

    // Stream from disk with byte-range support so <video>/<audio> can seek
    // without the main process ever buffering whole files (the OOM cause).
    if (range) {
      const match = /bytes=(\d*)-(\d*)/.exec(range);
      const start = match?.[1] ? Number.parseInt(match[1], 10) : 0;
      const end = match?.[2] ? Number.parseInt(match[2], 10) : size - 1;
      const body = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream<Uint8Array>;
      return new Response(body, {
        status: 206,
        headers: {
          "Content-Type": mime,
          "Content-Range": `bytes ${start}-${end}/${size}`,
          "Accept-Ranges": "bytes",
          "Content-Length": String(end - start + 1),
        },
      });
    }

    const body = Readable.toWeb(createReadStream(file)) as ReadableStream<Uint8Array>;
    return new Response(body, {
      status: 200,
      headers: { "Content-Type": mime, "Accept-Ranges": "bytes", "Content-Length": String(size) },
    });
  });

  ipcMain.handle("ping", () => "pong");
  ipcMain.handle("project:load", (_event, slug: string) => loadProject(slug));
  ipcMain.handle("export:start", (event, slug: string) =>
    runScript(RENDER_SCRIPT, slug, event, "export"),
  );
  ipcMain.handle("generate:start", (event, slug: string) =>
    runScript(ANALYZE_SCRIPT, slug, event, "generate"),
  );
  ipcMain.handle("transcribe:start", (event, slug: string) =>
    runScript(TRANSCRIBE_SCRIPT, slug, event, "transcribe"),
  );
  ipcMain.handle("critique:load", (_event, slug: string) => {
    try {
      return JSON.parse(readFileSync(join(PROJECTS_DIR, slug, "critique.json"), "utf8"));
    } catch {
      return null;
    }
  });
  ipcMain.handle("shell:reveal", (_event, filePath: string) => shell.showItemInFolder(filePath));

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
