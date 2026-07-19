// Deterministic baseline for aesthetic learning. Probes the creator's own past
// videos in projects/<slug>/references/ and writes a baseline style.json
// (palette, pacing, length, energy). The richer, interpretive layer (hook
// patterns, do/avoid, narrative) is added by the `learn-aesthetic` agent skill
// on top of this, exactly as create-social-video builds on analyze.mjs.
//
// Run: `node app/scripts/analyze-style.mjs --slug <slug>`
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { parseStyleProfile } from "@reel/edl";
import { resolveProjectDir } from "./lib/project-dir.mjs";
import { arg, round } from "./lib/cli.mjs";
import { avgPalette, durationSec, countCuts, paletteAt } from "./lib/ffmpeg.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const VIDEO_EXT = new Set([".mp4", ".mov", ".webm", ".m4v"]);

const median = (xs) => {
  if (xs.length === 0) return undefined;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

async function main() {
  const slug = arg("slug");
  if (!slug) throw new Error("missing --slug");

  const projectDir = resolveProjectDir(repoRoot, slug);
  const refDir = path.join(projectDir, "references");
  const videos = (fs.existsSync(refDir) ? fs.readdirSync(refDir) : []).filter((f) =>
    VIDEO_EXT.has(path.extname(f).toLowerCase()),
  );
  if (videos.length === 0) throw new Error("no reference videos in references/");

  console.log(`PHASE analyzing ${videos.length} reference clips`);
  const cutsPer10s = [];
  const shotLens = [];
  const lengths = [];
  const palettes = [];

  let done = 0;
  for (const f of videos) {
    const file = path.join(refDir, f);
    const dur = durationSec(file);
    const cuts = countCuts(file);
    if (dur > 0) {
      cutsPer10s.push((cuts / dur) * 10);
      shotLens.push(dur / (cuts + 1));
      lengths.push(dur);
      palettes.push(paletteAt(file, Math.max(0.5, dur / 2)));
    }
    done++;
    console.log(`PROGRESS ${Math.round((done / videos.length) * 100)}`);
  }

  const medianCuts = median(cutsPer10s) ?? 0;
  // energy: ~0 at 1 cut / 10s, ~1 at 12 cuts / 10s.
  const energy = Math.max(0, Math.min(1, round((medianCuts - 1) / 11)));

  const stylePath = path.join(projectDir, "style.json");
  const existing = fs.existsSync(stylePath) ? JSON.parse(fs.readFileSync(stylePath, "utf8")) : {};
  // The schema requires avgShotSec/targetLengthSec to be positive; omit them
  // when analysis produced nothing (all-zero durations) instead of writing 0.
  const avgShotSec = round(median(shotLens) ?? 0);
  const targetLengthSec = round(median(lengths) ?? 0);
  const style = {
    id: existing.id ?? "learned",
    name: existing.name ?? "My Style",
    palette: avgPalette(palettes),
    fontFamily: existing.fontFamily,
    captionStyle: existing.captionStyle ?? "karaoke",
    pacing: {
      cutsPer10s: round(medianCuts),
      ...(avgShotSec > 0 ? { avgShotSec } : {}),
    },
    hookPattern: existing.hookPattern,
    energy,
    ...(targetLengthSec > 0 ? { targetLengthSec } : {}),
    do: existing.do ?? [],
    avoid: existing.avoid ?? [],
    notes: existing.notes ?? "Baseline from analyze-style.mjs — refine with the learn-aesthetic skill.",
    source: { clips: videos.length, generatedAt: new Date().toISOString() },
  };

  // style.json values get stamped into EDL themes; never persist a profile
  // the schema would reject (parse also normalizes defaults).
  let validated;
  try {
    validated = parseStyleProfile(style);
  } catch (err) {
    console.error(`ERROR analyzed style failed validation: ${err}`);
    process.exit(2);
  }
  fs.writeFileSync(stylePath, `${JSON.stringify(validated, null, 2)}\n`);
  console.log(`DONE ${stylePath}`);
}

main().catch((err) => {
  console.error(`ERROR ${err?.stack || err}`);
  process.exit(1);
});
