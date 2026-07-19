import { app } from "electron";
import { createWriteStream, existsSync, mkdirSync, renameSync, statSync, type WriteStream } from "node:fs";
import { join } from "node:path";

/**
 * Minimal leveled file logger for the main process. Before this, the main
 * process logged nothing and there was no on-disk record a user could send us
 * when something broke. Logs live under userData/logs so they're retrievable
 * in a packaged app; a single previous file is kept on rotation.
 */
const LOG_DIR = join(app.getPath("userData"), "logs");
const LOG_FILE = join(LOG_DIR, "main.log");
const SCRIPTS_LOG_DIR = join(LOG_DIR, "scripts");
const MAX_BYTES = 2 * 1024 * 1024;

type Level = "info" | "warn" | "error";

let stream: WriteStream | null = null;
let written = 0;

function open(): void {
  mkdirSync(LOG_DIR, { recursive: true });
  try {
    written = existsSync(LOG_FILE) ? statSync(LOG_FILE).size : 0;
  } catch {
    written = 0;
  }
  stream = createWriteStream(LOG_FILE, { flags: "a" });
}

function rotate(): void {
  try {
    stream?.end();
  } catch {
    // ignore
  }
  try {
    renameSync(LOG_FILE, `${LOG_FILE}.1`);
  } catch {
    // nothing to rotate
  }
  written = 0;
  stream = createWriteStream(LOG_FILE, { flags: "a" });
}

function fmt(v: unknown): string {
  if (typeof v === "string") return v;
  if (v instanceof Error) return v.stack || `${v.name}: ${v.message}`;
  try {
    return JSON.stringify(v);
  } catch {
    return String(v);
  }
}

function write(level: Level, args: unknown[]): void {
  const line = `${new Date().toISOString()} [${level}] ${args.map(fmt).join(" ")}\n`;
  // Mirror to the process console so `npm run dev` still shows it live.
  const sink = level === "error" ? console.error : level === "warn" ? console.warn : console.log;
  sink(line.trimEnd());
  try {
    if (!stream) open();
    if (written > MAX_BYTES) rotate();
    stream?.write(line);
    written += Buffer.byteLength(line);
  } catch {
    // logging must never throw into a caller
  }
}

export const logger = {
  info: (...args: unknown[]) => write("info", args),
  warn: (...args: unknown[]) => write("warn", args),
  error: (...args: unknown[]) => write("error", args),
};

/** Last-resort process guards so a throw/rejection is recorded, not silent. */
export function installCrashHandlers(): void {
  process.on("uncaughtException", (err) => logger.error("uncaughtException", err));
  process.on("unhandledRejection", (reason) => logger.error("unhandledRejection", reason));
}

export function logsDir(): string {
  return LOG_DIR;
}

/**
 * Open a per-run log file for a spawned engine script and return an appender +
 * finalizer. Script stdout/stderr is otherwise parsed then discarded, so a
 * failed render/transcribe left nothing to inspect.
 */
export function openScriptLog(prefix: string): {
  path: string;
  append: (chunk: string) => void;
  close: (code: number | null) => void;
} {
  let s: WriteStream | null = null;
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  const path = join(SCRIPTS_LOG_DIR, `${prefix}-${stamp}.log`);
  try {
    mkdirSync(SCRIPTS_LOG_DIR, { recursive: true });
    s = createWriteStream(path, { flags: "a" });
    s.write(`# ${prefix} @ ${new Date().toISOString()}\n`);
  } catch {
    s = null;
  }
  return {
    path,
    append: (chunk) => {
      try {
        s?.write(chunk);
      } catch {
        // best-effort
      }
    },
    close: (code) => {
      try {
        s?.end(`\n# exit ${code}\n`);
      } catch {
        // best-effort
      }
    },
  };
}
