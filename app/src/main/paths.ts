import { renameSync, unlinkSync, writeFileSync } from "node:fs";
import { basename, dirname, extname, join, normalize, sep } from "node:path";

/**
 * Pure path / id / mime helpers for the main process. Extracted from index.ts
 * so the security-sensitive containment logic (`safePath`, `assertSlug`) is
 * unit-testable without booting Electron. No electron imports live here.
 */

export const VIDEO_EXT = new Set([".mp4", ".mov", ".webm", ".m4v"]);
export const AUDIO_EXT = new Set([".mp3", ".wav", ".m4a", ".aac", ".ogg"]);
export const IMAGE_EXT = new Set([".png", ".jpg", ".jpeg", ".webp", ".gif"]);

export function assetKindFor(file: string): "video" | "audio" | "image" | null {
  const ext = extname(file).toLowerCase();
  if (VIDEO_EXT.has(ext)) return "video";
  if (AUDIO_EXT.has(ext)) return "audio";
  if (IMAGE_EXT.has(ext)) return "image";
  return null;
}

/** Resolve + guard a path so it can never escape the given root. */
export function safePath(root: string, rel: string[]): string {
  const base = normalize(root);
  const file = normalize(join(base, ...rel));
  // Compare against root + separator so a sibling like "<root>-evil" can't pass.
  if (file !== base && !file.startsWith(base + sep)) throw new Error("path escapes storage dir");
  return file;
}

export const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
/** Throw on a malformed renderer-supplied slug (handlers convert to {ok,error}). */
export function assertSlug(slug: string): void {
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) throw new Error("invalid project id");
}

/** True only for real web links we're willing to hand to the OS handler. */
export function isSafeExternalUrl(url: string): boolean {
  try {
    return new URL(url).protocol === "https:";
  } catch {
    return false;
  }
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60) || "project"
  );
}

export function mimeFor(file: string): string {
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
    case ".aac":
      return "audio/aac";
    case ".ogg":
      return "audio/ogg";
    case ".png":
      return "image/png";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".webp":
      return "image/webp";
    case ".gif":
      return "image/gif";
    default:
      return "application/octet-stream";
  }
}

/**
 * Write-then-rename so concurrent readers (the file watcher's reload path,
 * engine scripts, a second window) can never observe a truncated file. The
 * temp file lives in the same directory so the rename stays on one volume
 * (atomic on POSIX).
 */
export function writeFileAtomic(file: string, data: string | Buffer): void {
  const tmp = join(
    dirname(file),
    `.${basename(file)}.${process.pid.toString(36)}${Date.now().toString(36)}.tmp`,
  );
  writeFileSync(tmp, data);
  try {
    renameSync(tmp, file);
  } catch (err) {
    try {
      unlinkSync(tmp);
    } catch {
      // best-effort cleanup; the original error is the one that matters
    }
    throw err;
  }
}
