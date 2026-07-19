// Shared ffmpeg helpers for the analysis scripts. The duration/scene/loudness/
// palette probes were copy-pasted across analyze-style, analyze-collection, and
// analyze-benchmarks; centralizing them also adds the null-binary + spawn-error
// guard those copies lacked (ffmpeg-static can be null on unsupported platforms,
// and a failed spawn silently returned 0, poisoning the aggregated metrics).
import { spawnSync } from "node:child_process";
import ffmpegPath from "ffmpeg-static";

const MAX_BUFFER = 1 << 26;

function stderrOf(args) {
  if (!ffmpegPath) throw new Error("ffmpeg-static unavailable on this platform");
  const res = spawnSync(ffmpegPath, args, { encoding: "utf8", maxBuffer: MAX_BUFFER });
  if (res.error) throw res.error;
  // ffmpeg exits non-zero for probe-style invocations (no output file); the
  // stderr banner is still what we parse, so only treat a missing binary /
  // spawn failure as fatal.
  return res.stderr || "";
}

const round = (n) => Math.round(n * 100) / 100;

/** Duration in seconds parsed from ffmpeg's banner (0 when unparseable). */
export function durationSec(file) {
  const m = stderrOf(["-i", file]).match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/);
  return m ? Number(m[1]) * 3600 + Number(m[2]) * 60 + Number(m[3]) : 0;
}

/** Scene-change timestamps (seconds) via ffmpeg detection. */
export function sceneTimes(file) {
  const err = stderrOf(["-i", file, "-vf", "select='gt(scene,0.4)',showinfo", "-f", "null", "-"]);
  return [...err.matchAll(/pts_time:(\d+(?:\.\d+)?)/g)].map((m) => Number(m[1]));
}

/** Hard-cut count via scene detection. */
export function countCuts(file) {
  const err = stderrOf(["-i", file, "-vf", "select='gt(scene,0.4)',showinfo", "-f", "null", "-"]);
  const matches = err.match(/pts_time:/g);
  return matches ? matches.length : 0;
}

/** Integrated loudness (LUFS) via ebur128 (undefined when unmeasured). */
export function loudnessLufs(file) {
  const err = stderrOf(["-i", file, "-af", "ebur128", "-f", "null", "-"]);
  const matches = [...err.matchAll(/I:\s*(-?\d+(?:\.\d+)?)\s*LUFS/g)];
  return matches.length ? Number(matches[matches.length - 1][1]) : undefined;
}

const toHex = (r, g, b) =>
  "#" +
  [r, g, b]
    .map((v) =>
      Math.max(0, Math.min(255, Math.round(v)))
        .toString(16)
        .padStart(2, "0"),
    )
    .join("");

/** Crude 3-swatch palette: one frame at `atSec` downscaled to 3x1 raw RGB. */
export function paletteAt(file, atSec) {
  try {
    if (!ffmpegPath) return [];
    const res = spawnSync(
      ffmpegPath,
      [
        "-ss",
        String(atSec),
        "-i",
        file,
        "-frames:v",
        "1",
        "-vf",
        "scale=3:1",
        "-f",
        "rawvideo",
        "-pix_fmt",
        "rgb24",
        "-",
      ],
      { maxBuffer: 1 << 20 },
    );
    const buf = res.stdout;
    if (!buf || buf.length < 9) return [];
    return [0, 3, 6].map((o) => toHex(buf[o], buf[o + 1], buf[o + 2]));
  } catch {
    return [];
  }
}

/** Average a set of 3-swatch palettes into one. */
export function avgPalette(palettes) {
  const valid = palettes.filter((p) => p.length === 3);
  if (valid.length === 0) return [];
  const acc = [
    [0, 0, 0],
    [0, 0, 0],
    [0, 0, 0],
  ];
  for (const p of valid) {
    p.forEach((hex, i) => {
      const n = parseInt(hex.slice(1), 16);
      acc[i][0] += (n >> 16) & 255;
      acc[i][1] += (n >> 8) & 255;
      acc[i][2] += n & 255;
    });
  }
  return acc.map(([r, g, b]) =>
    toHex(Math.round(r / valid.length), Math.round(g / valid.length), Math.round(b / valid.length)),
  );
}

export { round };
