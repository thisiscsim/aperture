// Shared CLI helpers for the engine scripts. These were copy-pasted verbatim
// across ~13 scripts (arg/round/readMaybe/…); centralizing them removes the
// drift risk and gives the asset-id + TSV fixes a single home.
import fs from "node:fs";

/** Read a `--name value` flag from argv. */
export function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

/** Round to 2 decimals (timeline precision). */
export const round = (n) => Math.round(n * 100) / 100;

/** Read a file, returning "" if it doesn't exist. */
export function readMaybe(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

/** Read + JSON.parse a file, returning null on any failure. */
export function readJsonMaybe(file) {
  try {
    return JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    return null;
  }
}

/**
 * Derive an asset id from a filename the SAME way the app's importer does
 * (main/index.ts describeAsset). analyze.mjs used the raw basename, so a file
 * with spaces ("my clip.mp4") got a different id than the app assigned,
 * forking the asset list and orphaning the proxy on every Generate.
 */
export function sanitizeAssetId(filename) {
  const base = filename.replace(/\.[^.]+$/, "");
  return base.replace(/[^a-zA-Z0-9_-]+/g, "-");
}

/**
 * Escape a value for a single TSV cell: tabs/newlines would otherwise shift
 * columns in results.tsv (which the app parses by splitting on \t).
 */
export function tsvCell(value) {
  return String(value).replace(/\s+/g, " ").trim();
}
