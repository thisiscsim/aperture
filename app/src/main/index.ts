import { spawn } from "node:child_process";
import { createHash } from "node:crypto";
import {
  copyFileSync,
  createReadStream,
  existsSync,
  type FSWatcher,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  watch,
  writeFileSync,
} from "node:fs";
import { mkdtempSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, dirname, extname, join, normalize, sep } from "node:path";
import { Readable } from "node:stream";
import { resolveAudioSource } from "./audio-sources";
import {
  assertSlug,
  assetKindFor,
  AUDIO_EXT,
  isSafeExternalUrl,
  mimeFor,
  safePath,
  slugify,
  writeFileAtomic,
} from "./paths";
import {
  app,
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
  nativeImage,
  protocol,
  session,
  shell,
} from "electron";
import ffmpegPath from "ffmpeg-static";
import { installCrashHandlers, logger, logsDir, openScriptLog } from "./logger";
import {
  type Benchmarks,
  durationSeconds,
  type Edl,
  parseBenchmarks,
  parseCritique,
  parseEdl,
  parseEdlOrThrow,
  parseMeta,
  parseStyleProfile,
  type StyleProfile,
} from "@reel/edl";

// In dev (electron-vite) __dirname is <repo>/app/out/main, so the repo root is
// three levels up. Allow an override for packaged/other layouts.
const REPO_ROOT = process.env["REEL_ROOT"] ?? join(__dirname, "..", "..", "..");
const ICON_PATH = join(REPO_ROOT, "app", "resources", "icon.png");
const SCRIPTS_DIR = join(REPO_ROOT, "app", "scripts");
const RENDER_SCRIPT = join(SCRIPTS_DIR, "render.mjs");
const ANALYZE_SCRIPT = join(SCRIPTS_DIR, "analyze.mjs");
const GENERATE_LLM_SCRIPT = join(SCRIPTS_DIR, "generate-llm.mjs");
const CRITIQUE_LLM_SCRIPT = join(SCRIPTS_DIR, "critique-llm.mjs");
const AUTOTUNE_LLM_SCRIPT = join(SCRIPTS_DIR, "autotune-llm.mjs");
const TRANSCRIBE_SCRIPT = join(SCRIPTS_DIR, "transcribe.mjs");

// Provider-agnostic LLM config (mirrors app/scripts/llm.mjs) so the UI can show
// the active model and Generate can route to the LLM path vs the offline baseline.
function llmInfo(): { provider: string; model: string; configured: boolean } {
  const provider = (process.env["APERTURE_LLM_PROVIDER"] || "openai").toLowerCase();
  const model = process.env["APERTURE_LLM_MODEL"] || "gpt-5.5";
  const baseURL = process.env["APERTURE_LLM_BASE_URL"];
  // Mirror llm.mjs exactly: only the generic key or the provider-matching one
  // (no cross-provider fallback that would misroute a key to the wrong host).
  const providerKey =
    provider === "anthropic"
      ? process.env["ANTHROPIC_API_KEY"]
      : provider === "openai"
        ? process.env["OPENAI_API_KEY"]
        : undefined;
  const apiKey = process.env["APERTURE_LLM_API_KEY"] || providerKey;
  const configured = provider === "openai-compatible" ? Boolean(baseURL || apiKey) : Boolean(apiKey);
  return { provider, model, configured };
}
const WRITE_NARRATION_SCRIPT = join(SCRIPTS_DIR, "write-narration.mjs");
const TTS_SCRIPT = join(SCRIPTS_DIR, "tts.mjs");
const ANALYZE_COLLECTION_SCRIPT = join(SCRIPTS_DIR, "analyze-collection.mjs");
const ANALYZE_BENCHMARKS_SCRIPT = join(SCRIPTS_DIR, "analyze-benchmarks.mjs");
const AUTOTUNE_SCRIPT = join(SCRIPTS_DIR, "autotune.mjs");
const BUNDLED_MUSIC_DIR = join(REPO_ROOT, "app", "resources", "music");

function safeProjectPath(slug: string, ...rel: string[]): string {
  return safePath(PROJECTS_DIR, [slug, ...rel]);
}

function safeStylePath(id: string, ...rel: string[]): string {
  return safePath(STYLES_DIR, [id, ...rel]);
}

// Captured so dialogs can parent to the window.
let mainWindow: BrowserWindow | null = null;

// The macOS menu bar / dock tooltip / About panel use app.name, which defaults
// to "Electron" in dev. Set it before the default menu is built. (Packaging
// later should also set productName in the builder config.)
app.setName("Aperture");

// Record throws/rejections to the log file before anything else runs.
installCrashHandlers();
logger.info(`Aperture ${app.getVersion()} starting (electron ${process.versions.electron})`);

// Two instances would both watch and write the same edl.json/settings.json/
// albums.json; refuse to start a second one and focus the first instead.
if (!app.requestSingleInstanceLock()) {
  app.exit(0);
}
app.on("second-instance", () => {
  if (!mainWindow) return;
  if (mainWindow.isMinimized()) mainWindow.restore();
  mainWindow.focus();
});

// Load a local, gitignored env file (KEY=VALUE) so secrets like OPENAI_API_KEY
// can live on disk instead of being exported into the launching shell. Existing
// process env always wins. Runs at startup so spawned scripts inherit it.
function loadLocalEnv(): void {
  for (const file of [join(REPO_ROOT, "app", ".env.local"), join(REPO_ROOT, ".env.local")]) {
    let text: string;
    try {
      text = readFileSync(file, "utf8");
    } catch {
      continue;
    }
    for (const line of text.split("\n")) {
      const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.*?)\s*$/);
      if (!m || line.trimStart().startsWith("#")) continue;
      let val = m[2];
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!(m[1] in process.env)) process.env[m[1]] = val;
    }
  }
}
loadLocalEnv();

// ---- Persistent app settings (hardware acceleration, storage location, etc.) ----
export type ExportFps = "project" | "24" | "30" | "60";
export type ExportResolution = "project" | "1080" | "720";
export type ExportCompression = "social" | "high" | "max";
export type ReasoningEffort = "low" | "medium" | "high";
interface AppSettings {
  hwDecode: boolean;
  hwEncode: boolean;
  /** User-chosen root folder for projects + styles (default ~/Documents/Aperture). */
  homeDir?: string;
  /** Export defaults applied by the render pipeline. */
  exportFps: ExportFps;
  exportResolution: ExportResolution;
  exportCompression: ExportCompression;
  /** Agent preferences (env vars from .env.local always win). */
  agentModel: string;
  agentApiKey?: string;
  reasoningEffort: ReasoningEffort;
  /** ElevenLabs voiceover (env var wins, same as the LLM key). */
  elevenLabsApiKey?: string;
  defaultVoiceId?: string;
}
/**
 * The renderer never needs raw key values — only whether a key is set — so we
 * strip them at the IPC boundary. Keeping the plaintext main-side means a
 * renderer compromise (or a future "attach settings to a report" feature)
 * can't read them over `settings:get`.
 */
type PublicSettings = Omit<AppSettings, "agentApiKey" | "elevenLabsApiKey"> & {
  hasAgentKey: boolean;
  hasElevenLabsKey: boolean;
};
function publicSettings(s: AppSettings): PublicSettings {
  const { agentApiKey, elevenLabsApiKey, ...rest } = s;
  return { ...rest, hasAgentKey: Boolean(agentApiKey), hasElevenLabsKey: Boolean(elevenLabsApiKey) };
}
const SETTINGS_PATH = join(app.getPath("userData"), "settings.json");
function readSettings(): AppSettings {
  let s: Record<string, unknown> = {};
  try {
    s = JSON.parse(readFileSync(SETTINGS_PATH, "utf8"));
  } catch {
    // fresh install
  }
  const oneOf = <T extends string>(v: unknown, options: readonly T[], dflt: T): T =>
    typeof v === "string" && (options as readonly string[]).includes(v) ? (v as T) : dflt;
  return {
    hwDecode: Boolean(s.hwDecode),
    hwEncode: Boolean(s.hwEncode),
    homeDir: typeof s.homeDir === "string" && s.homeDir ? s.homeDir : undefined,
    exportFps: oneOf(s.exportFps, ["project", "24", "30", "60"] as const, "project"),
    exportResolution: oneOf(s.exportResolution, ["project", "1080", "720"] as const, "project"),
    exportCompression: oneOf(s.exportCompression, ["social", "high", "max"] as const, "social"),
    agentModel: typeof s.agentModel === "string" && s.agentModel ? s.agentModel : "gpt-5.5",
    agentApiKey: typeof s.agentApiKey === "string" && s.agentApiKey ? s.agentApiKey : undefined,
    reasoningEffort: oneOf(s.reasoningEffort, ["low", "medium", "high"] as const, "low"),
    elevenLabsApiKey:
      typeof s.elevenLabsApiKey === "string" && s.elevenLabsApiKey ? s.elevenLabsApiKey : undefined,
    defaultVoiceId: typeof s.defaultVoiceId === "string" && s.defaultVoiceId ? s.defaultVoiceId : undefined,
  };
}
function writeSettings(patch: Partial<AppSettings>): AppSettings {
  const next = { ...readSettings(), ...patch };
  try {
    writeFileAtomic(SETTINGS_PATH, `${JSON.stringify(next, null, 2)}\n`);
  } catch {
    // best-effort
  }
  applyAgentEnv(next);
  return next;
}

// Agent preferences flow to the LLM layer via the same env vars .env.local uses.
// Anything explicitly set in the environment (shell or .env.local) stays
// authoritative; settings only fill the gaps. `envLocked` is captured once at
// startup, before the first injection.
const envLocked = {
  provider: "APERTURE_LLM_PROVIDER" in process.env,
  model: "APERTURE_LLM_MODEL" in process.env,
  apiKey: Boolean(
    process.env["APERTURE_LLM_API_KEY"] || process.env["OPENAI_API_KEY"] || process.env["ANTHROPIC_API_KEY"],
  ),
  effort: "APERTURE_REASONING_EFFORT" in process.env,
  elevenLabsKey: Boolean(process.env["ELEVENLABS_API_KEY"]),
};
function applyAgentEnv(s: AppSettings): void {
  if (!envLocked.model) {
    process.env["APERTURE_LLM_MODEL"] = s.agentModel;
    if (!envLocked.provider) {
      process.env["APERTURE_LLM_PROVIDER"] = s.agentModel.startsWith("claude") ? "anthropic" : "openai";
    }
  }
  if (!envLocked.apiKey) {
    if (s.agentApiKey) process.env["APERTURE_LLM_API_KEY"] = s.agentApiKey;
    else delete process.env["APERTURE_LLM_API_KEY"];
  }
  if (!envLocked.effort) process.env["APERTURE_REASONING_EFFORT"] = s.reasoningEffort;
  if (!envLocked.elevenLabsKey) {
    if (s.elevenLabsApiKey) process.env["ELEVENLABS_API_KEY"] = s.elevenLabsApiKey;
    else delete process.env["ELEVENLABS_API_KEY"];
  }
}
applyAgentEnv(readSettings());

// User-owned storage (Screen Studio style): projects + styles live under the
// user's home folder, not the repo/app bundle. Resolution: env override (dev) ->
// user-picked folder (settings) -> ~/Documents/Aperture. Resolved once at startup.
const APP_HOME =
  process.env["APERTURE_HOME"] ?? readSettings().homeDir ?? join(app.getPath("documents"), "Aperture");
const PROJECTS_DIR = process.env["REEL_PROJECTS_DIR"] ?? join(APP_HOME, "projects");
const STYLES_DIR = process.env["APERTURE_STYLES_DIR"] ?? join(APP_HOME, "styles");
try {
  mkdirSync(PROJECTS_DIR, { recursive: true });
  mkdirSync(STYLES_DIR, { recursive: true });
} catch {
  // directories are best-effort at startup
}
// Spawned scripts (render/analyze/generate/...) inherit these to find the same dirs.
process.env["APERTURE_PROJECTS_DIR"] = PROJECTS_DIR;
process.env["APERTURE_STYLES_DIR"] = STYLES_DIR;
// Keep the whisper.cpp install + model out of the (read-only, when packaged)
// app bundle; transcribe.mjs honors this override.
if (!process.env["APERTURE_WHISPER_DIR"]) {
  process.env["APERTURE_WHISPER_DIR"] = join(app.getPath("userData"), "whisper");
}

// Hardware-accelerated video decode (playback) is a Chromium switch that must be
// set before the app is ready, so toggling it needs a restart.
if (readSettings().hwDecode) {
  app.commandLine.appendSwitch("ignore-gpu-blocklist");
  app.commandLine.appendSwitch("enable-features", "PlatformHEVCDecoderSupport");
}

// Serve project media to the sandboxed renderer (the Remotion Player can't read
// file:// from an http origin). reel-asset://<slug>/<relPath> -> projects/<slug>/<relPath>
protocol.registerSchemesAsPrivileged([
  {
    scheme: "reel-asset",
    privileges: { standard: true, secure: true, supportFetchAPI: true, stream: true, bypassCSP: true },
  },
]);

function createWindow(): void {
  const win = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1100,
    minHeight: 700,
    show: false,
    autoHideMenuBar: true,
    backgroundColor: "#16140f",
    title: "Aperture",
    icon: ICON_PATH,
    webPreferences: {
      preload: join(__dirname, "../preload/index.js"),
    },
  });

  mainWindow = win;
  win.on("ready-to-show", () => win.show());
  win.webContents.on("render-process-gone", (_e, details) => {
    logger.error(`render-process-gone: ${details.reason} (exitCode ${details.exitCode})`);
  });
  win.webContents.on("unresponsive", () => logger.warn("renderer unresponsive"));
  win.on("closed", () => {
    if (mainWindow === win) mainWindow = null;
    // On macOS the process outlives the window; don't leave the last
    // project's watcher running against a windowless app.
    activeWatcher?.watcher.close();
    activeWatcher = null;
  });
  // Only ever hand real web links to the OS. Denying the window is not enough:
  // a compromised/injected renderer could otherwise ask shell.openExternal to
  // launch file://, smb://, or a custom-scheme handler (a known RCE-adjacent
  // vector).
  win.webContents.setWindowOpenHandler((details) => {
    if (isSafeExternalUrl(details.url)) void shell.openExternal(details.url);
    return { action: "deny" };
  });
  // The app is a fixed local bundle; never let content navigate the top frame
  // away from its own origin (dev server or the packaged file://).
  win.webContents.on("will-navigate", (event, url) => {
    const appOrigin = process.env["ELECTRON_RENDERER_URL"];
    const sameApp = appOrigin ? url.startsWith(appOrigin) : url.startsWith("file://");
    if (!sameApp) event.preventDefault();
  });

  if (process.env["ELECTRON_RENDERER_URL"]) {
    void win.loadURL(process.env["ELECTRON_RENDERER_URL"]);
  } else {
    void win.loadFile(join(__dirname, "../renderer/index.html"));
  }
}

function readJson(file: string): unknown {
  return JSON.parse(readFileSync(file, "utf8"));
}

function readMeta(slug: string) {
  try {
    return parseMeta(readJson(safeProjectPath(slug, "meta.json")));
  } catch {
    return parseMeta({});
  }
}

function loadProject(slug: string) {
  try {
    const dir = safeProjectPath(slug);
    const raw = JSON.parse(readFileSync(join(dir, "edl.json"), "utf8"));
    const result = parseEdl(raw);
    let promptText = "";
    try {
      promptText = readFileSync(join(dir, "prompt.md"), "utf8");
    } catch {
      // prompt.md is optional
    }
    return { ...result, slug, dir, promptText, meta: readMeta(slug) };
  } catch (err) {
    return { ok: false, errors: [String(err)], slug };
  }
}

// We write edl.json from two places: the editor (autosave) and the agent/scripts.
// Track our own writes so the file watcher doesn't echo a reload back to the UI
// that just saved (which would clobber in-flight edits / loop).
const lastSelfWrite = new Map<string, number>();
let activeWatcher: { slug: string; watcher: FSWatcher } | null = null;

function writeEdl(slug: string, edl: Edl): { ok: boolean; error?: string } {
  try {
    const validated = parseEdlOrThrow(edl);
    const file = safeProjectPath(slug, "edl.json");
    lastSelfWrite.set(slug, Date.now());
    writeFileAtomic(file, `${JSON.stringify(validated, null, 2)}\n`);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function touchMeta(slug: string, patch: Partial<ReturnType<typeof readMeta>>): void {
  try {
    // Re-validate the merged result so an arbitrary renderer patch can't write
    // unknown keys / out-of-range values into meta.json (parseMeta drops them).
    const meta = parseMeta({ ...readMeta(slug), ...patch, updatedAt: new Date().toISOString() });
    writeFileAtomic(safeProjectPath(slug, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
  } catch {
    // meta is best-effort
  }
}

function watchProject(slug: string, event: IpcMainInvokeEvent): void {
  activeWatcher?.watcher.close();
  activeWatcher = null;
  const dir = safeProjectPath(slug);
  if (!existsSync(dir)) return;
  let timer: NodeJS.Timeout | null = null;
  // Watch the directory, not the file: our atomic writes (and editors/scripts
  // doing write-then-rename) swap the inode, which silently kills a file-level
  // watch on macOS (kqueue) and Linux (inotify).
  const watcher = watch(dir, (_eventType, filename) => {
    // filename can be null on some platforms; only skip when we positively
    // know the event was for a different file.
    if (filename && filename !== "edl.json") return;
    // Ignore the echo from our own autosave.
    if (Date.now() - (lastSelfWrite.get(slug) ?? 0) < 1200) return;
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      if (!event.sender.isDestroyed()) event.sender.send("project:changed", slug);
    }, 200);
  });
  activeWatcher = { slug, watcher };
}

export interface ProjectSummary {
  slug: string;
  title: string;
  platform: string;
  status: string;
  durationSec: number;
  assetCount: number;
  updatedAt?: string;
  albumId?: string;
}

// ---- Home-page albums (registry at <PROJECTS_DIR>/albums.json; membership
// lives in each project's meta.json so projects stay self-describing) ----
export interface AlbumRecord {
  id: string;
  name: string;
  createdAt: string;
}

const ALBUMS_FILE = () => join(PROJECTS_DIR, "albums.json");

function readAlbums(): AlbumRecord[] {
  try {
    const raw = JSON.parse(readFileSync(ALBUMS_FILE(), "utf8")) as { albums?: unknown[] };
    return (raw.albums ?? []).filter(
      (a): a is AlbumRecord =>
        typeof a === "object" &&
        a !== null &&
        typeof (a as AlbumRecord).id === "string" &&
        typeof (a as AlbumRecord).name === "string",
    );
  } catch {
    return [];
  }
}

function writeAlbumsFile(albums: AlbumRecord[]): void {
  writeFileAtomic(ALBUMS_FILE(), `${JSON.stringify({ albums }, null, 2)}\n`);
}

const validAlbumId = (id: string) => /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(id);

function createAlbum(name: string): { ok: boolean; id?: string; name?: string; error?: string } {
  try {
    const albums = readAlbums();
    // Dedupe the display name ("New album", "New album 2", ...) then derive the id.
    const base = name.trim() || "New album";
    let finalName = base;
    let n = 2;
    while (albums.some((a) => a.name.toLowerCase() === finalName.toLowerCase())) finalName = `${base} ${n++}`;
    const idBase = slugify(finalName);
    let id = idBase;
    n = 2;
    while (albums.some((a) => a.id === id)) id = `${idBase}-${n++}`;
    albums.push({ id, name: finalName, createdAt: new Date().toISOString() });
    writeAlbumsFile(albums);
    return { ok: true, id, name: finalName };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function renameAlbum(id: string, name: string): { ok: boolean; error?: string } {
  try {
    if (!validAlbumId(id)) return { ok: false, error: "invalid album id" };
    const albums = readAlbums();
    const album = albums.find((a) => a.id === id);
    if (!album) return { ok: false, error: "album not found" };
    const trimmed = name.trim();
    if (!trimmed) return { ok: false, error: "name required" };
    album.name = trimmed;
    writeAlbumsFile(albums);
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function deleteAlbum(id: string): { ok: boolean; error?: string } {
  try {
    if (!validAlbumId(id)) return { ok: false, error: "invalid album id" };
    writeAlbumsFile(readAlbums().filter((a) => a.id !== id));
    // The group dissolves; member projects are kept and just ungrouped.
    for (const slug of readdirSync(PROJECTS_DIR)) {
      try {
        if (!existsSync(join(PROJECTS_DIR, slug, "meta.json"))) continue;
        if (readMeta(slug).albumId === id) touchMeta(slug, { albumId: undefined });
      } catch {
        // skip unreadable entries
      }
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function setProjectAlbum(slug: string, albumId: string | null): { ok: boolean; error?: string } {
  try {
    if (albumId !== null) {
      if (!validAlbumId(albumId)) return { ok: false, error: "invalid album id" };
      if (!readAlbums().some((a) => a.id === albumId)) return { ok: false, error: "album not found" };
    }
    touchMeta(slug, { albumId: albumId ?? undefined });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// Async + parallel: every ipcMain handler runs on the main (UI) thread, and
// this reads/parses every project's edl.json + meta.json. Doing it serially
// with sync fs blocked the event loop (janking the window) once a user had
// many projects. fs/promises + Promise.all yields between reads.
async function listProjects(): Promise<ProjectSummary[]> {
  let entries: string[];
  try {
    entries = await readdir(PROJECTS_DIR);
  } catch {
    return [];
  }
  const summaries = await Promise.all(
    entries.map(async (slug): Promise<ProjectSummary | null> => {
      const edlFile = join(PROJECTS_DIR, slug, "edl.json");
      let durationSec = 0;
      let assetCount = 0;
      try {
        const parsed = parseEdl(JSON.parse(await readFile(edlFile, "utf8")));
        if (parsed.ok && parsed.edl) {
          durationSec = durationSeconds(parsed.edl);
          assetCount = parsed.edl.assets.length;
        }
      } catch {
        // no edl.json (not a project dir) or unreadable — skip listing it
        if (!existsSync(edlFile)) return null;
      }
      let meta: ReturnType<typeof readMeta>;
      try {
        meta = parseMeta(JSON.parse(await readFile(join(PROJECTS_DIR, slug, "meta.json"), "utf8")));
      } catch {
        meta = parseMeta({});
      }
      let updatedAt = meta.updatedAt;
      if (!updatedAt) {
        try {
          updatedAt = (await stat(edlFile)).mtime.toISOString();
        } catch {
          // leave undefined
        }
      }
      return {
        slug,
        title: meta.title || slug,
        platform: meta.platform,
        status: meta.status,
        durationSec,
        assetCount,
        updatedAt,
        albumId: meta.albumId,
      };
    }),
  );
  return summaries
    .filter((s): s is ProjectSummary => s !== null)
    .sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

function createProject(input: {
  title: string;
  prompt?: string;
  platform?: string;
  styleProfileId?: string;
}): { ok: boolean; slug?: string; error?: string } {
  try {
    const base = slugify(input.title);
    let slug = base;
    let n = 2;
    while (existsSync(join(PROJECTS_DIR, slug))) slug = `${base}-${n++}`;
    const dir = join(PROJECTS_DIR, slug);
    for (const sub of ["assets", "references", "benchmarks", "transcripts", "renders"]) {
      mkdirSync(join(dir, sub), { recursive: true });
    }
    const now = new Date().toISOString();
    const meta = parseMeta({
      title: input.title.trim() || slug,
      createdAt: now,
      updatedAt: now,
      platform: input.platform ?? "reels",
      status: "draft",
      styleProfileId: input.styleProfileId,
    });
    writeFileAtomic(join(dir, "meta.json"), `${JSON.stringify(meta, null, 2)}\n`);
    writeFileAtomic(
      join(dir, "prompt.md"),
      input.prompt?.trim() ? `${input.prompt.trim()}\n` : `# ${meta.title}\n`,
    );
    const emptyEdl = parseEdlOrThrow({ tracks: [{ id: "v", type: "video", clips: [] }] });
    writeFileAtomic(join(dir, "edl.json"), `${JSON.stringify(emptyEdl, null, 2)}\n`);
    return { ok: true, slug };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function deleteProject(slug: string): { ok: boolean; error?: string } {
  try {
    if (!slug || slug.includes("/") || slug.includes("\\")) return { ok: false, error: "invalid slug" };
    const dir = safeProjectPath(slug);
    if (normalize(dir) === normalize(PROJECTS_DIR)) return { ok: false, error: "invalid slug" };
    if (activeWatcher?.slug === slug) {
      activeWatcher.watcher.close();
      activeWatcher = null;
    }
    rmSync(dir, { recursive: true, force: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

interface FirstFrameRef {
  src: string;
  /** Source-time offset of the frame the rendered video opens on. */
  seekSec: number;
}

function findFirstVideoFrame(slug: string): FirstFrameRef | null {
  // The thumbnail must match frame 0 of the rendered video: the earliest clip
  // on the video tracks, at its `in` offset — not merely the first asset
  // declared in the EDL (assets order doesn't follow timeline order).
  try {
    const parsed = parseEdl(readJson(safeProjectPath(slug, "edl.json")));
    if (parsed.ok && parsed.edl) {
      const edl = parsed.edl;
      let first: { start: number; assetId: string; in: number } | null = null;
      for (const track of edl.tracks) {
        if (track.type !== "video") continue;
        for (const clip of track.clips) {
          // <= so start-time ties resolve to later tracks/clips, which render
          // on top — i.e. the layer actually visible at frame 0.
          if (!first || clip.start <= first.start)
            first = { start: clip.start, assetId: clip.assetId, in: clip.in };
        }
      }
      if (first) {
        const opener = first;
        const asset = edl.assets.find((a) => a.id === opener.assetId);
        // Image clips are valid openers too; ffmpeg reads them fine at seek 0.
        if (asset && (asset.kind === "video" || asset.kind === "image"))
          return { src: asset.src, seekSec: asset.kind === "video" ? opener.in : 0 };
      }
      const asset = edl.assets.find((a) => a.kind === "video");
      if (asset) return { src: asset.src, seekSec: 0 };
    }
  } catch {
    // fall through
  }
  try {
    const file = readdirSync(safeProjectPath(slug, "assets")).find((f) => assetKindFor(f) === "video");
    if (file) return { src: `assets/${file}`, seekSec: 0 };
  } catch {
    // no assets dir
  }
  return null;
}

/**
 * Run ffmpeg with an argv array (never a shell string) and a hard timeout so a
 * malformed/hostile media file can't hang a spawn forever (a stuck process was
 * otherwise never reaped). Resolves true on exit code 0.
 */
function runFfmpeg(args: string[], timeoutMs = 120_000): Promise<boolean> {
  return new Promise((resolve) => {
    if (!ffmpegPath) return resolve(false);
    const child = spawn(ffmpegPath as string, args);
    const timer = setTimeout(() => {
      logger.warn(`ffmpeg timed out after ${timeoutMs}ms; killing`);
      child.kill("SIGKILL");
      resolve(false);
    }, timeoutMs);
    child.on("close", (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
    child.on("error", (err) => {
      clearTimeout(timer);
      logger.warn("ffmpeg spawn error", err);
      resolve(false);
    });
  });
}

// Bound concurrent proxy encodes: importing N videos previously fired N
// ffmpeg processes at once, saturating CPU/memory. Run at most 2 at a time.
const PROXY_CONCURRENCY = 2;
let proxyActive = 0;
const proxyQueue: (() => void)[] = [];
function enqueueProxy(task: () => Promise<void>): void {
  const run = () => {
    proxyActive++;
    void task().finally(() => {
      proxyActive--;
      const next = proxyQueue.shift();
      if (next) next();
    });
  };
  if (proxyActive < PROXY_CONCURRENCY) run();
  else proxyQueue.push(run);
}

// Versioned cache name: v2 switched the poster from a fixed 0.8s seek to the
// timeline's true first frame. The new name invalidates every stale v1 thumb
// (mtime comparison alone would keep serving them until the next edit).
const THUMB_FILE = ".thumb-v2.jpg";

// Generate (and cache) a poster frame matching the video's first frame.
async function ensureThumbnail(slug: string): Promise<string | null> {
  try {
    assertSlug(slug);
  } catch {
    return null;
  }
  const thumb = safeProjectPath(slug, THUMB_FILE);
  const edlFile = safeProjectPath(slug, "edl.json");
  try {
    if (existsSync(thumb) && statSync(thumb).mtimeMs >= statSync(edlFile).mtimeMs) {
      return `reel-asset://${slug}/${THUMB_FILE}`;
    }
  } catch {
    // regenerate
  }
  const frame = findFirstVideoFrame(slug);
  if (!frame || !ffmpegPath) return null;
  const input = safeProjectPath(slug, frame.src);
  const ok = await runFfmpeg(
    ["-y", "-ss", frame.seekSec.toFixed(3), "-i", input, "-frames:v", "1", "-vf", "scale=360:-1", thumb],
    30_000,
  );
  rmSync(safeProjectPath(slug, ".thumb.jpg"), { force: true });
  return ok ? `reel-asset://${slug}/${THUMB_FILE}` : null;
}

export interface ImportedAsset {
  id: string;
  kind: "video" | "audio" | "image";
  src: string;
  durationSec?: number;
}

// Parse a media file's duration out of ffmpeg's stderr banner. ffmpeg-static is
// already a dependency (used by transcribe.mjs); ffprobe isn't bundled.
function probeDurationSec(file: string): Promise<number | undefined> {
  return new Promise((resolve) => {
    if (!ffmpegPath) return resolve(undefined);
    const child = spawn(ffmpegPath as string, ["-i", file]);
    let err = "";
    let settled = false;
    const finish = (v: number | undefined) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(v);
    };
    const timer = setTimeout(() => {
      child.kill("SIGKILL");
      finish(undefined);
    }, 30_000);
    child.stderr.on("data", (c: Buffer) => (err += c.toString()));
    child.on("close", () => {
      const m = err.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
      finish(m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : undefined);
    });
    child.on("error", () => finish(undefined));
  });
}

function uniqueDest(dir: string, name: string): { name: string; dest: string } {
  const ext = extname(name);
  const stem = basename(name, ext);
  let candidate = name;
  let dest = join(dir, candidate);
  let i = 2;
  while (existsSync(dest)) {
    candidate = `${stem}-${i++}${ext}`;
    dest = join(dir, candidate);
  }
  return { name: candidate, dest };
}

async function describeAsset(dir: string, name: string): Promise<ImportedAsset | null> {
  const kind = assetKindFor(name);
  if (!kind) return null;
  const durationSec = kind === "image" ? undefined : await probeDurationSec(join(dir, name));
  const id = basename(name, extname(name)).replace(/[^a-zA-Z0-9_-]+/g, "-");
  return { id, kind, src: `assets/${name}`, durationSec };
}

// Background H.264 proxy so the editor scrubs smoothly even for HEVC/.MOV; when
// done, patch the project's edl.json so the preview switches to the proxy. Export
// still uses the original for full quality.
function proxyRel(id: string): string {
  return `assets/.proxies/${id}.mp4`;
}
async function generateProxy(slug: string, assetSrc: string, id: string): Promise<void> {
  if (!ffmpegPath) return;
  const input = safeProjectPath(slug, assetSrc);
  const outDir = safeProjectPath(slug, "assets", ".proxies");
  mkdirSync(outDir, { recursive: true });
  const out = join(outDir, `${id}.mp4`);
  // Proxy transcodes are the heaviest ffmpeg job here; give them a longer cap.
  const ok = await runFfmpeg(
    [
      "-y",
      "-i",
      input,
      "-an",
      "-vf",
      "scale='min(720,iw)':-2",
      "-c:v",
      "libx264",
      "-preset",
      "veryfast",
      "-pix_fmt",
      "yuv420p",
      "-movflags",
      "+faststart",
      out,
    ],
    600_000,
  );
  if (ok) patchAssetProxy(slug, id, proxyRel(id));
}
// Retry-patch: the renderer's autosave may not have written the new asset yet.
function patchAssetProxy(slug: string, id: string, proxySrc: string, attempt = 0): void {
  try {
    const file = safeProjectPath(slug, "edl.json");
    const edl = JSON.parse(readFileSync(file, "utf8"));
    const asset = (edl.assets ?? []).find((a: { id: string }) => a.id === id);
    if (asset && existsSync(safeProjectPath(slug, proxySrc))) {
      asset.proxySrc = proxySrc;
      // Intentionally do NOT mark lastSelfWrite: we want the watcher to reload
      // the editor so the preview picks up the proxy.
      writeFileAtomic(file, `${JSON.stringify(edl, null, 2)}\n`);
      return;
    }
  } catch {
    // fall through to retry
  }
  if (attempt < 12) setTimeout(() => patchAssetProxy(slug, id, proxySrc, attempt + 1), 800);
}

async function importAssets(
  slug: string,
  paths: string[],
): Promise<{ ok: boolean; assets: ImportedAsset[]; error?: string }> {
  try {
    assertSlug(slug);
    const dir = safeProjectPath(slug, "assets");
    mkdirSync(dir, { recursive: true });
    const added: ImportedAsset[] = [];
    for (const p of paths) {
      if (!assetKindFor(p)) continue;
      const { name, dest } = uniqueDest(dir, basename(p));
      copyFileSync(p, dest);
      const desc = await describeAsset(dir, name);
      if (desc) {
        added.push(desc);
        if (desc.kind === "video") enqueueProxy(() => generateProxy(slug, desc.src, desc.id));
      }
    }
    return { ok: true, assets: added };
  } catch (err) {
    return { ok: false, assets: [], error: String(err) };
  }
}

async function importAssetBuffer(
  slug: string,
  filename: string,
  data: Uint8Array,
): Promise<{ ok: boolean; assets: ImportedAsset[]; error?: string }> {
  try {
    assertSlug(slug);
    if (basename(filename) !== filename) throw new Error("invalid filename");
    const dir = safeProjectPath(slug, "assets");
    mkdirSync(dir, { recursive: true });
    const { name, dest } = uniqueDest(dir, filename);
    writeFileSync(dest, Buffer.from(data));
    const desc = await describeAsset(dir, name);
    return { ok: true, assets: desc ? [desc] : [] };
  } catch (err) {
    return { ok: false, assets: [], error: String(err) };
  }
}

function listBundledMusic(): string[] {
  try {
    return readdirSync(BUNDLED_MUSIC_DIR).filter((f) => AUDIO_EXT.has(extname(f).toLowerCase()));
  } catch {
    return [];
  }
}

async function importBundledMusic(
  slug: string,
  name: string,
): Promise<{ ok: boolean; assets: ImportedAsset[]; error?: string }> {
  const source = join(BUNDLED_MUSIC_DIR, basename(name));
  if (!source.startsWith(normalize(BUNDLED_MUSIC_DIR)) || !existsSync(source)) {
    return { ok: false, assets: [], error: "unknown track" };
  }
  return importAssets(slug, [source]);
}

// ---- ElevenLabs voices (list / clone / delete) ----
export interface VoiceSummary {
  id: string;
  name: string;
  category: string;
}

const EL_API = "https://api.elevenlabs.io/v1";

function elevenLabsKey(): string | undefined {
  return process.env["ELEVENLABS_API_KEY"] || undefined;
}

async function elError(res: Response): Promise<string> {
  try {
    const body = (await res.json()) as { detail?: { message?: string } | string };
    const detail = typeof body.detail === "string" ? body.detail : body.detail?.message;
    return detail || `ElevenLabs HTTP ${res.status}`;
  } catch {
    return `ElevenLabs HTTP ${res.status}`;
  }
}

async function listVoices(): Promise<{ ok: boolean; voices: VoiceSummary[]; error?: string }> {
  const key = elevenLabsKey();
  if (!key) return { ok: false, voices: [], error: "No ElevenLabs API key configured." };
  try {
    const res = await fetch(`${EL_API}/voices`, { headers: { "xi-api-key": key } });
    if (!res.ok) return { ok: false, voices: [], error: await elError(res) };
    const data = (await res.json()) as { voices?: { voice_id: string; name: string; category?: string }[] };
    return {
      ok: true,
      voices: (data.voices ?? []).map((v) => ({
        id: v.voice_id,
        name: v.name,
        category: v.category ?? "premade",
      })),
    };
  } catch (err) {
    return { ok: false, voices: [], error: String(err) };
  }
}

// Voice samples arrive as file paths and/or an in-memory mic recording (webm).
// ElevenLabs is picky about container formats, so everything is transcoded to
// mp3 with the bundled ffmpeg before upload.
async function transcodeSampleToMp3(input: string, outDir: string, stem: string): Promise<string | null> {
  if (!ffmpegPath) return null;
  const out = join(outDir, `${stem}.mp3`);
  const ok = await runFfmpeg(["-y", "-i", input, "-ac", "1", "-b:a", "128k", out], 120_000);
  return ok ? out : null;
}

async function cloneVoice(input: {
  name: string;
  paths: string[];
  recording?: { name: string; data: Uint8Array };
  consent: boolean;
}): Promise<{ ok: boolean; voiceId?: string; error?: string }> {
  const key = elevenLabsKey();
  if (!key) return { ok: false, error: "No ElevenLabs API key configured." };
  if (!input.consent) return { ok: false, error: "Consent is required to clone a voice." };
  const name = input.name.trim();
  if (!name) return { ok: false, error: "Give the voice a name." };

  const tmp = mkdtempSync(join(tmpdir(), "aperture-voice-"));
  try {
    const staged: string[] = [];
    for (const p of input.paths) {
      if (assetKindFor(p) === "audio" || extname(p).toLowerCase() === ".webm") staged.push(p);
    }
    if (input.recording) {
      const raw = join(tmp, input.recording.name);
      writeFileSync(raw, Buffer.from(input.recording.data));
      staged.push(raw);
    }
    if (staged.length === 0) return { ok: false, error: "Add at least one audio sample." };

    const form = new FormData();
    form.append("name", name);
    for (let i = 0; i < staged.length; i++) {
      const mp3 = await transcodeSampleToMp3(staged[i], tmp, `sample-${i + 1}`);
      if (!mp3) return { ok: false, error: `Could not read sample: ${basename(staged[i])}` };
      form.append("files", new Blob([readFileSync(mp3)], { type: "audio/mpeg" }), basename(mp3));
    }

    const res = await fetch(`${EL_API}/voices/add`, {
      method: "POST",
      headers: { "xi-api-key": key },
      body: form,
    });
    if (!res.ok) return { ok: false, error: await elError(res) };
    const data = (await res.json()) as { voice_id?: string };
    if (!data.voice_id) return { ok: false, error: "ElevenLabs did not return a voice id." };
    return { ok: true, voiceId: data.voice_id };
  } catch (err) {
    return { ok: false, error: String(err) };
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

async function deleteVoice(id: string): Promise<{ ok: boolean; error?: string }> {
  const key = elevenLabsKey();
  if (!key) return { ok: false, error: "No ElevenLabs API key configured." };
  if (!/^[a-zA-Z0-9]{8,64}$/.test(id)) return { ok: false, error: "invalid voice id" };
  try {
    const res = await fetch(`${EL_API}/voices/${id}`, { method: "DELETE", headers: { "xi-api-key": key } });
    if (!res.ok) return { ok: false, error: await elError(res) };
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

// ---- Audio from URL (SoundCloud etc.) ----
// yt-dlp does the extraction; like whisper.cpp it is fetched on first use
// (~35MB universal macOS binary) and cached in userData/bin. Pinned to a
// specific release + SHA-256 so a hijacked "latest" tag, a swapped release
// asset, or a MITM can't get arbitrary native code executed on the user's
// machine. Bump both together (SHA2-256SUMS in the release).
const YTDLP_VERSION = "2026.07.04";
const YTDLP_SHA256 = "498bd0dae17855c599d371d68ec5bafc439a9d8640e838be25c765a9792f261b";
const YTDLP_RELEASE_URL = `https://github.com/yt-dlp/yt-dlp/releases/download/${YTDLP_VERSION}/yt-dlp_macos`;
const YTDLP_BIN = join(app.getPath("userData"), "bin", "yt-dlp");

async function ensureYtDlp(): Promise<string> {
  if (existsSync(YTDLP_BIN)) return YTDLP_BIN;
  mkdirSync(dirname(YTDLP_BIN), { recursive: true });
  const res = await fetch(YTDLP_RELEASE_URL);
  if (!res.ok) throw new Error(`could not fetch the audio downloader (HTTP ${res.status})`);
  const bytes = Buffer.from(await res.arrayBuffer());
  const digest = createHash("sha256").update(bytes).digest("hex");
  if (digest !== YTDLP_SHA256) {
    throw new Error(
      `audio downloader failed integrity check (expected ${YTDLP_SHA256.slice(0, 12)}…, got ${digest.slice(0, 12)}…)`,
    );
  }
  writeFileSync(YTDLP_BIN, bytes, { mode: 0o755 });
  return YTDLP_BIN;
}

async function importAudioFromUrl(
  slug: string,
  rawUrl: string,
  event: IpcMainInvokeEvent,
): Promise<{ ok: boolean; assets: ImportedAsset[]; error?: string }> {
  const source = resolveAudioSource(rawUrl);
  if (!source.ok) return { ok: false, assets: [], error: source.error };
  const send = (channel: string, value: unknown) => {
    if (!event.sender.isDestroyed()) event.sender.send(channel, value);
  };
  let tmp: string | null = null;
  try {
    if (!existsSync(YTDLP_BIN)) send("audiourl:phase", "getting the downloader (first run)");
    const bin = await ensureYtDlp();
    tmp = mkdtempSync(join(tmpdir(), "aperture-audio-"));
    send("audiourl:phase", `fetching from ${source.label}`);

    const args = [
      "--no-playlist",
      "--no-warnings",
      "--newline",
      "--max-filesize",
      "200m",
      "-f",
      "bestaudio/best",
      "-x",
      "--audio-format",
      "m4a",
      "--ffmpeg-location",
      ffmpegPath as string,
      "-o",
      join(tmp, "%(title).120B.%(ext)s"),
      source.url,
    ];
    await new Promise<void>((resolve, reject) => {
      const child = spawn(bin, args);
      let stderr = "";
      child.stdout.on("data", (chunk: Buffer) => {
        const m = chunk.toString().match(/\[download\]\s+([\d.]+)%/);
        if (m) send("audiourl:progress", Math.round(Number(m[1])));
      });
      child.stderr.on("data", (chunk: Buffer) => (stderr += chunk.toString()));
      const timer = setTimeout(() => {
        child.kill("SIGKILL");
        reject(new Error("timed out after 5 minutes"));
      }, 300_000);
      child.on("close", (code) => {
        clearTimeout(timer);
        if (code === 0) resolve();
        else reject(new Error(stderr.trim().split("\n").pop() || `downloader exited with code ${code}`));
      });
      child.on("error", (err) => {
        clearTimeout(timer);
        reject(err);
      });
    });

    const produced = readdirSync(tmp).find((f) => assetKindFor(f) === "audio");
    if (!produced) return { ok: false, assets: [], error: "The link didn't yield an audio file." };
    send("audiourl:phase", "importing");
    return await importAssets(slug, [join(tmp, produced)]);
  } catch (err) {
    return { ok: false, assets: [], error: err instanceof Error ? err.message : String(err) };
  } finally {
    if (tmp) rmSync(tmp, { recursive: true, force: true });
  }
}

function importInto(
  slug: string,
  sub: string,
  paths: string[],
): { ok: boolean; files: string[]; error?: string } {
  try {
    assertSlug(slug);
    const dir = safeProjectPath(slug, sub);
    mkdirSync(dir, { recursive: true });
    const files: string[] = [];
    for (const p of paths) {
      if (assetKindFor(p) !== "video") continue;
      const { name, dest } = uniqueDest(dir, basename(p));
      copyFileSync(p, dest);
      files.push(name);
    }
    return { ok: true, files };
  } catch (err) {
    return { ok: false, files: [], error: String(err) };
  }
}

// Spawn a Node script with arbitrary args, streaming its PHASE/PROGRESS/DONE
// protocol back to the renderer on `${channelPrefix}:*` channels.
function runScriptArgs(
  scriptPath: string,
  args: string[],
  event: IpcMainInvokeEvent,
  channelPrefix: string,
): Promise<{ ok: boolean; output?: string; error?: string }> {
  return new Promise((resolve) => {
    const runLog = openScriptLog(channelPrefix);
    logger.info(`script ${channelPrefix} start: ${basename(scriptPath)} ${args.join(" ")} -> ${runLog.path}`);
    // Run engine scripts with Electron's bundled Node (ELECTRON_RUN_AS_NODE)
    // rather than a `node` on PATH — a packaged app has no system node, and
    // this also lets nested spawns reuse process.execPath.
    const child = spawn(process.execPath, [scriptPath, ...args], {
      cwd: REPO_ROOT,
      env: { ...process.env, ELECTRON_RUN_AS_NODE: "1" },
    });
    let output = "";
    let stderr = "";
    child.stdout.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      runLog.append(text);
      for (const line of text.split("\n")) {
        const progress = line.match(/PROGRESS (\d+)/);
        if (progress) event.sender.send(`${channelPrefix}:progress`, Number(progress[1]));
        const phase = line.match(/PHASE (.+)/);
        if (phase) event.sender.send(`${channelPrefix}:phase`, phase[1].trim());
        const done = line.match(/DONE (.+)/);
        if (done) output = done[1].trim();
      }
    });
    child.stderr.on("data", (chunk: Buffer) => {
      const text = chunk.toString();
      stderr += text;
      runLog.append(text);
    });
    child.on("close", (code) => {
      runLog.close(code);
      if (code === 0) {
        logger.info(`script ${channelPrefix} ok`);
        resolve({ ok: true, output });
      } else {
        logger.warn(
          `script ${channelPrefix} failed (exit ${code}): ${stderr.trim().split("\n").pop() ?? ""}`,
        );
        resolve({ ok: false, error: stderr.trim() || `Process exited with code ${code}` });
      }
    });
    child.on("error", (err) => {
      runLog.close(null);
      logger.error(`script ${channelPrefix} spawn error`, err);
      resolve({ ok: false, error: String(err) });
    });
  });
}

function runScript(
  scriptPath: string,
  slug: string,
  event: IpcMainInvokeEvent,
  channelPrefix: string,
  extraArgs: string[] = [],
): Promise<{ ok: boolean; output?: string; error?: string }> {
  // Engine scripts join the slug onto the projects dir themselves, so enforce
  // slug shape at this IPC boundary (same rule slugify produces).
  if (!/^[a-z0-9][a-z0-9_-]{0,63}$/i.test(slug)) {
    return Promise.resolve({ ok: false, error: "invalid project id" });
  }
  return runScriptArgs(scriptPath, ["--slug", slug, ...extraArgs], event, channelPrefix);
}

// ---- Global style library (styles/<id>/ : sources/, .frames/, profile.json) ----
export interface StyleSummary {
  id: string;
  name: string;
  clips: number;
  analyzed: boolean;
  updatedAt?: string;
}

function listStyles(): StyleSummary[] {
  let ids: string[];
  try {
    ids = readdirSync(STYLES_DIR);
  } catch {
    return [];
  }
  const out: StyleSummary[] = [];
  for (const id of ids) {
    const dir = join(STYLES_DIR, id);
    try {
      if (!statSync(dir).isDirectory()) continue;
    } catch {
      continue;
    }
    let name = id;
    let analyzed = false;
    let updatedAt: string | undefined;
    try {
      const p = JSON.parse(readFileSync(join(dir, "profile.json"), "utf8"));
      name = p.name || id;
      analyzed = Boolean(p.styleGuide || (p.exemplars?.length ?? 0) > 0 || p.palette?.length);
      updatedAt = p.source?.generatedAt;
    } catch {
      // no profile yet
    }
    let clips = 0;
    try {
      clips = readdirSync(join(dir, "sources")).filter((f) => assetKindFor(f) === "video").length;
    } catch {
      // no sources yet
    }
    out.push({ id, name, clips, analyzed, updatedAt });
  }
  return out.sort((a, b) => (b.updatedAt ?? "").localeCompare(a.updatedAt ?? ""));
}

function createStyle(name: string): { ok: boolean; id?: string; error?: string } {
  try {
    const base = slugify(name);
    let id = base;
    let n = 2;
    while (existsSync(join(STYLES_DIR, id))) id = `${base}-${n++}`;
    mkdirSync(join(STYLES_DIR, id, "sources"), { recursive: true });
    writeFileAtomic(
      join(STYLES_DIR, id, "profile.json"),
      `${JSON.stringify({ id, name: name.trim() || id, palette: [], exemplars: [], do: [], avoid: [] }, null, 2)}\n`,
    );
    return { ok: true, id };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function importStyleSources(id: string, paths: string[]): { ok: boolean; files: string[] } {
  const dir = safeStylePath(id, "sources");
  mkdirSync(dir, { recursive: true });
  const files: string[] = [];
  for (const p of paths) {
    if (assetKindFor(p) !== "video") continue;
    const { name, dest } = uniqueDest(dir, basename(p));
    copyFileSync(p, dest);
    files.push(name);
  }
  return { ok: true, files };
}

// Open a native picker (files or a whole folder) and import the chosen videos.
async function addStyleSourcesFromDialog(
  id: string,
  mode: "files" | "folder",
): Promise<{ ok: boolean; files: string[]; error?: string }> {
  try {
    const win = mainWindow ?? BrowserWindow.getFocusedWindow();
    const opts: Electron.OpenDialogOptions = {
      title: mode === "folder" ? "Choose a folder of reference videos" : "Choose reference videos",
      properties: mode === "folder" ? ["openDirectory"] : ["openFile", "multiSelections"],
      filters: mode === "files" ? [{ name: "Video", extensions: ["mp4", "mov", "webm", "m4v"] }] : undefined,
    };
    const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    if (result.canceled || result.filePaths.length === 0) return { ok: true, files: [] };
    let paths = result.filePaths;
    if (mode === "folder") {
      const folder = result.filePaths[0];
      paths = readdirSync(folder)
        .filter((f) => assetKindFor(f) === "video")
        .map((f) => join(folder, f));
    }
    return importStyleSources(id, paths);
  } catch (err) {
    return { ok: false, files: [], error: String(err) };
  }
}

// Open the native picker and create a new style in one step, named after the
// chosen folder (no name prompt needed — window.prompt isn't supported in Electron).
async function createStyleFromDialog(mode: "files" | "folder"): Promise<{
  ok: boolean;
  id?: string;
  name?: string;
  files?: string[];
  canceled?: boolean;
  error?: string;
}> {
  try {
    const win = mainWindow ?? BrowserWindow.getFocusedWindow();
    const opts: Electron.OpenDialogOptions = {
      title: mode === "folder" ? "Choose a folder of reference videos" : "Choose reference videos",
      properties: mode === "folder" ? ["openDirectory"] : ["openFile", "multiSelections"],
      filters: mode === "files" ? [{ name: "Video", extensions: ["mp4", "mov", "webm", "m4v"] }] : undefined,
    };
    const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    if (result.canceled || result.filePaths.length === 0) return { ok: true, canceled: true };

    let paths: string[];
    let name: string;
    if (mode === "folder") {
      const folder = result.filePaths[0];
      name = basename(folder) || "My Style";
      paths = readdirSync(folder)
        .filter((f) => assetKindFor(f) === "video")
        .map((f) => join(folder, f));
    } else {
      paths = result.filePaths;
      name = basename(dirname(paths[0])) || "My Style";
    }
    if (paths.length === 0) return { ok: false, error: "No videos found in the selection." };

    const created = createStyle(name);
    if (!created.ok || !created.id) return created;
    const imp = importStyleSources(created.id, paths);
    return { ok: true, id: created.id, name, files: imp.files };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

function getStyle(id: string): StyleProfile | null {
  try {
    return parseStyleProfile(JSON.parse(readFileSync(safeStylePath(id, "profile.json"), "utf8")));
  } catch {
    return null;
  }
}

function deleteStyle(id: string): { ok: boolean; error?: string } {
  try {
    if (!id || id.includes("/") || id.includes("\\")) return { ok: false, error: "invalid id" };
    const dir = safeStylePath(id);
    if (normalize(dir) === normalize(STYLES_DIR)) return { ok: false, error: "invalid id" };
    rmSync(dir, { recursive: true, force: true });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: String(err) };
  }
}

app.whenReady().then(() => {
  // macOS ignores the BrowserWindow `icon`; set the dock icon so the app shows
  // its own icon instead of the default Electron one (matters most in dev).
  if (process.platform === "darwin" && app.dock) {
    const dockIcon = nativeImage.createFromPath(ICON_PATH);
    if (!dockIcon.isEmpty()) app.dock.setIcon(dockIcon);
  }

  // Content-Security-Policy backstop. The renderer loads only local content and
  // project media over reel-asset://; there is no reason for it to reach the
  // network or eval remote code. In dev, Vite/React-Refresh inject inline
  // scripts and use a websocket for HMR, so the dev policy is looser.
  const isDev = Boolean(process.env["ELECTRON_RENDERER_URL"]);
  const csp = isDev
    ? "default-src 'self' 'unsafe-inline' 'unsafe-eval' reel-asset: data: blob: ws: http://localhost:*;"
    : [
        "default-src 'self'",
        "img-src 'self' reel-asset: data: blob:",
        "media-src 'self' reel-asset: blob:",
        // Remotion/React styles are applied inline; scripts stay same-origin.
        "style-src 'self' 'unsafe-inline'",
        "script-src 'self'",
        "connect-src 'self' reel-asset:",
        "font-src 'self' data:",
        "object-src 'none'",
        "frame-src 'none'",
      ].join("; ");
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: { ...details.responseHeaders, "Content-Security-Policy": [csp] },
    });
  });

  protocol.handle("reel-asset", (request) => {
    const url = new URL(request.url);
    const slug = url.hostname;
    const rel = decodeURIComponent(url.pathname).replace(/^\/+/, "");
    let file: string;
    try {
      file = safeProjectPath(slug, rel);
    } catch {
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
      const start = Math.min(match?.[1] ? Number.parseInt(match[1], 10) : 0, Math.max(0, size - 1));
      const end = Math.min(match?.[2] ? Number.parseInt(match[2], 10) : size - 1, size - 1);
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
  ipcMain.handle("projects:list", () => listProjects());
  ipcMain.handle(
    "project:create",
    (_event, input: { title: string; prompt?: string; platform?: string; styleProfileId?: string }) =>
      createProject(input),
  );
  ipcMain.handle("project:thumbnail", (_event, slug: string) => ensureThumbnail(slug));
  ipcMain.handle("albums:list", () => readAlbums());
  ipcMain.handle("albums:create", (_event, name: string) => createAlbum(name));
  ipcMain.handle("albums:rename", (_event, id: string, name: string) => renameAlbum(id, name));
  ipcMain.handle("albums:delete", (_event, id: string) => deleteAlbum(id));
  ipcMain.handle("project:setAlbum", (_event, slug: string, albumId: string | null) =>
    setProjectAlbum(slug, albumId),
  );
  ipcMain.handle("project:delete", (_event, slug: string) => deleteProject(slug));
  ipcMain.handle("project:load", (_event, slug: string) => loadProject(slug));
  ipcMain.handle("project:watch", (event, slug: string) => {
    try {
      assertSlug(slug);
      watchProject(slug, event);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });
  ipcMain.handle("edl:save", (_event, slug: string, edl: Edl) => writeEdl(slug, edl));
  ipcMain.handle("prompt:save", (_event, slug: string, text: string) => {
    try {
      writeFileAtomic(safeProjectPath(slug, "prompt.md"), text);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });
  ipcMain.handle("meta:load", (_event, slug: string) => readMeta(slug));
  ipcMain.handle("meta:save", (_event, slug: string, patch: Record<string, unknown>) => {
    touchMeta(slug, patch);
    return { ok: true };
  });
  ipcMain.handle("asset:import", (_event, slug: string, paths: string[]) => importAssets(slug, paths));
  ipcMain.handle("asset:importBuffer", (_event, slug: string, filename: string, data: Uint8Array) =>
    importAssetBuffer(slug, filename, data),
  );
  ipcMain.handle("audio:fromUrl", (event, slug: string, url: string) => importAudioFromUrl(slug, url, event));
  // ---- ElevenLabs voiceover ----
  ipcMain.handle("voices:status", () => ({
    configured: Boolean(elevenLabsKey()),
    keyLocked: envLocked.elevenLabsKey,
  }));
  ipcMain.handle("voices:list", () => listVoices());
  ipcMain.handle(
    "voices:clone",
    (
      _event,
      input: {
        name: string;
        paths: string[];
        recording?: { name: string; data: Uint8Array };
        consent: boolean;
      },
    ) => cloneVoice(input),
  );
  ipcMain.handle("voices:delete", (_event, id: string) => deleteVoice(id));
  ipcMain.handle("narration:load", (_event, slug: string) => {
    try {
      return readFileSync(safeProjectPath(slug, "narration.md"), "utf8");
    } catch {
      return "";
    }
  });
  ipcMain.handle("narration:save", (_event, slug: string, text: string) => {
    try {
      writeFileAtomic(safeProjectPath(slug, "narration.md"), text);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });
  ipcMain.handle("narration:draft", (event, slug: string) =>
    runScript(WRITE_NARRATION_SCRIPT, slug, event, "narration"),
  );
  ipcMain.handle("tts:start", (event, slug: string, voiceId: string) => {
    if (!/^[a-zA-Z0-9]{8,64}$/.test(voiceId)) {
      return Promise.resolve({ ok: false, error: "invalid voice id" });
    }
    return runScript(TTS_SCRIPT, slug, event, "tts", ["--voice", voiceId]);
  });
  ipcMain.handle("music:listBundled", () => listBundledMusic());
  ipcMain.handle("music:importBundled", (_event, slug: string, name: string) =>
    importBundledMusic(slug, name),
  );
  ipcMain.handle("references:import", (_event, slug: string, paths: string[]) =>
    importInto(slug, "references", paths),
  );
  ipcMain.handle("references:list", (_event, slug: string) => {
    try {
      return readdirSync(safeProjectPath(slug, "references")).filter((f) => assetKindFor(f) === "video");
    } catch {
      return [];
    }
  });
  ipcMain.handle("references:remove", (_event, slug: string, file: string) => {
    try {
      if (basename(file) !== file) return { ok: false, error: "invalid filename" };
      rmSync(safeProjectPath(slug, "references", file));
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });
  ipcMain.handle("style:learn", async (event, slug: string) => {
    // Rich collection analysis over this project's own references/ -> style.json.
    const res = await runScript(ANALYZE_COLLECTION_SCRIPT, slug, event, "style");
    if (res.ok) touchMeta(slug, { styleProfileId: "learned" });
    return res;
  });
  ipcMain.handle("style:load", (_event, slug: string): StyleProfile | null => {
    try {
      return parseStyleProfile(readJson(safeProjectPath(slug, "style.json")));
    } catch {
      return null;
    }
  });
  // Patch the ACTIVE style profile (same precedence generation uses: project
  // style.json -> meta.styleProfileId library profile -> the single library style).
  ipcMain.handle("style:patch", (_event, slug: string, patch: Record<string, unknown>) => {
    try {
      const projectStyle = safeProjectPath(slug, "style.json");
      let file: string | null = existsSync(projectStyle) ? projectStyle : null;
      if (!file) {
        let id = readMeta(slug).styleProfileId;
        if (!id) {
          const dirs = readdirSync(STYLES_DIR).filter((d) => existsSync(join(STYLES_DIR, d, "profile.json")));
          if (dirs.length === 1) id = dirs[0];
        }
        if (id && existsSync(safeStylePath(id, "profile.json"))) file = safeStylePath(id, "profile.json");
      }
      if (!file) return { ok: false, error: "no active style profile" };
      // Validate the merged profile before persisting — its values are stamped
      // into EDL themes, so a bad patch (e.g. a url() palette) must be rejected.
      const profile = parseStyleProfile({ ...(readJson(file) as Record<string, unknown>), ...patch });
      writeFileAtomic(file, `${JSON.stringify(profile, null, 2)}\n`);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: String(err) };
    }
  });
  // ---- Global style library ----
  ipcMain.handle("styles:list", () => listStyles());
  ipcMain.handle("styles:create", (_event, name: string) => createStyle(name));
  ipcMain.handle("styles:newFromDialog", (_event, mode: "files" | "folder") => createStyleFromDialog(mode));
  ipcMain.handle("styles:addFromDialog", (_event, id: string, mode: "files" | "folder") =>
    addStyleSourcesFromDialog(id, mode),
  );
  ipcMain.handle("styles:analyze", (event, id: string) =>
    runScriptArgs(ANALYZE_COLLECTION_SCRIPT, ["--styleDir", safeStylePath(id)], event, "styles"),
  );
  ipcMain.handle("styles:get", (_event, id: string) => getStyle(id));
  ipcMain.handle("styles:delete", (_event, id: string) => deleteStyle(id));
  ipcMain.handle("benchmark:import", (_event, slug: string, paths: string[]) =>
    importInto(slug, "benchmarks", paths),
  );
  ipcMain.handle("benchmark:list", (_event, slug: string) => {
    try {
      const dir = safeProjectPath(slug, "benchmarks");
      const metaFile = join(dir, "benchmarks.meta.json");
      const metrics = existsSync(metaFile) ? (readJson(metaFile) as Record<string, unknown>) : {};
      return readdirSync(dir)
        .filter((f) => assetKindFor(f) === "video")
        .map((file) => ({ file, ...(metrics[file] as object | undefined) }));
    } catch {
      return [];
    }
  });
  ipcMain.handle(
    "benchmark:saveMetrics",
    (_event, slug: string, file: string, m: { views?: number; likes?: number }) => {
      try {
        const metaFile = safeProjectPath(slug, "benchmarks", "benchmarks.meta.json");
        const metrics = existsSync(metaFile) ? (readJson(metaFile) as Record<string, unknown>) : {};
        metrics[file] = { ...(metrics[file] as object | undefined), ...m };
        writeFileAtomic(metaFile, `${JSON.stringify(metrics, null, 2)}\n`);
        return { ok: true };
      } catch (err) {
        return { ok: false, error: String(err) };
      }
    },
  );
  ipcMain.handle("benchmarks:analyze", (event, slug: string) =>
    runScript(ANALYZE_BENCHMARKS_SCRIPT, slug, event, "benchmarks"),
  );
  ipcMain.handle("benchmarks:load", (_event, slug: string): Benchmarks | null => {
    try {
      return parseBenchmarks(readJson(safeProjectPath(slug, "benchmarks.json")));
    } catch {
      return null;
    }
  });
  // Auto-improve uses the LLM critique-in-the-loop when configured; otherwise the
  // deterministic fix loop.
  ipcMain.handle("autotune:start", (event, slug: string) =>
    runScript(llmInfo().configured ? AUTOTUNE_LLM_SCRIPT : AUTOTUNE_SCRIPT, slug, event, "autotune"),
  );
  // LLM critique writes critique.json; requires a configured model.
  ipcMain.handle("critique:run", (event, slug: string) => {
    if (!llmInfo().configured) {
      return Promise.resolve({
        ok: false,
        error: "No model configured (set OPENAI_API_KEY in app/.env.local).",
      });
    }
    return runScript(CRITIQUE_LLM_SCRIPT, slug, event, "critique");
  });
  ipcMain.handle("autotune:results", (_event, slug: string) => {
    try {
      const rows = readFileSync(safeProjectPath(slug, "results.tsv"), "utf8")
        .trim()
        .split("\n")
        .slice(1)
        .filter(Boolean)
        .map((line) => {
          const [iter, score, delta, change] = line.split("\t");
          return { iter: Number(iter), score: Number(score), delta, change };
        });
      return rows;
    } catch {
      return [];
    }
  });
  ipcMain.handle("export:start", (event, slug: string) => {
    const s = readSettings();
    const args: string[] = [];
    if (s.hwEncode) args.push("--hwaccel");
    if (s.exportFps !== "project") args.push("--fps", s.exportFps);
    if (s.exportResolution !== "project") args.push("--resolution", s.exportResolution);
    args.push("--compression", s.exportCompression);
    return runScript(RENDER_SCRIPT, slug, event, "export", args);
  });
  ipcMain.handle("settings:get", () => publicSettings(readSettings()));
  ipcMain.handle("settings:set", (_event, patch: Partial<AppSettings>) =>
    publicSettings(writeSettings(patch)),
  );
  ipcMain.handle("home:get", () => PROJECTS_DIR);
  ipcMain.handle("home:reveal", () => shell.openPath(PROJECTS_DIR));
  ipcMain.handle("home:pick", async () => {
    const win = mainWindow ?? BrowserWindow.getFocusedWindow();
    const opts: Electron.OpenDialogOptions = {
      title: "Choose where Aperture stores your projects",
      properties: ["openDirectory", "createDirectory"],
      defaultPath: APP_HOME,
    };
    const result = win ? await dialog.showOpenDialog(win, opts) : await dialog.showOpenDialog(opts);
    if (result.canceled || result.filePaths.length === 0) return { ok: true, canceled: true };
    // Store the chosen folder as the Aperture home; projects/styles live under it.
    writeSettings({ homeDir: result.filePaths[0] });
    return { ok: true, homeDir: result.filePaths[0] };
  });
  // Generate runs the LLM editor (reads prompt + style, crafts a real edit) when
  // a model is configured; otherwise the deterministic offline baseline.
  ipcMain.handle("generate:start", (event, slug: string) =>
    runScript(llmInfo().configured ? GENERATE_LLM_SCRIPT : ANALYZE_SCRIPT, slug, event, "generate"),
  );
  ipcMain.handle("generate:mode", () => {
    const info = llmInfo();
    return {
      mode: info.configured ? "llm" : "baseline",
      provider: info.provider,
      model: info.model,
      // True when .env.local / shell env pins these (Settings then can't change them).
      modelLocked: envLocked.model,
      keyLocked: envLocked.apiKey,
    };
  });
  ipcMain.handle("transcribe:start", (event, slug: string) =>
    runScript(TRANSCRIBE_SCRIPT, slug, event, "transcribe"),
  );
  ipcMain.handle("critique:load", (_event, slug: string) => {
    try {
      // critique.json is a shareable project file; a score of 9000 or string
      // subscores must not reach the Critique panel.
      return parseCritique(JSON.parse(readFileSync(safeProjectPath(slug, "critique.json"), "utf8")));
    } catch {
      return null;
    }
  });
  ipcMain.handle("shell:reveal", (_event, filePath: string) => {
    // Only reveal paths inside the app's own storage roots — never an arbitrary
    // renderer-supplied path. (The one caller reveals an export under renders/.)
    const target = normalize(filePath);
    const roots = [PROJECTS_DIR, STYLES_DIR, APP_HOME].map(normalize);
    if (!roots.some((r) => target === r || target.startsWith(r + sep))) return;
    shell.showItemInFolder(target);
  });
  // Runtime build metadata so a bug report can be correlated to a version.
  ipcMain.handle("app:info", () => ({
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: `${process.platform} ${process.arch}`,
    logsDir: logsDir(),
  }));
  // Let the renderer persist its own errors (window.onerror, boundary) to the
  // shared log file — otherwise they only reach a usually-closed DevTools.
  ipcMain.handle("log:renderer", (_event, level: string, message: string) => {
    const fn = level === "error" ? logger.error : level === "warn" ? logger.warn : logger.info;
    fn(`[renderer] ${message}`);
  });

  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});

app.on("before-quit", () => {
  activeWatcher?.watcher.close();
  activeWatcher = null;
});
