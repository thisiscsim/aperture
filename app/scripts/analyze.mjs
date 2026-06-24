// Clip ingest + deterministic first-cut assembly.
// Run directly: `node app/scripts/analyze.mjs --slug <slug>`
// or via the Electron main process (the Generate button).
//
// Probes every clip in projects/<slug>/assets with @remotion/media-parser,
// then writes a baseline edl.json: clips laid end-to-end (each capped), with
// existing theme + text overlays preserved. The prompt-aware "smart" assembly
// is done by the agent (the /create-social-video skill) on top of this.
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { parseMedia } from "@remotion/media-parser";
import { nodeReader } from "@remotion/media-parser/node";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const VIDEO_EXT = new Set([".mp4", ".mov", ".webm", ".m4v"]);
const AUDIO_EXT = new Set([".mp3", ".wav", ".m4a", ".aac"]);
const CAP_SEC = 4;

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

const round = (n) => Math.round(n * 100) / 100;

async function main() {
  const slug = arg("slug");
  if (!slug) throw new Error("missing --slug");

  const projectDir = path.join(repoRoot, "projects", slug);
  const assetsDir = path.join(projectDir, "assets");
  const edlPath = path.join(projectDir, "edl.json");
  const edl = JSON.parse(fs.readFileSync(edlPath, "utf8"));

  const all = fs.readdirSync(assetsDir).sort();
  const videoFiles = all.filter((f) => VIDEO_EXT.has(path.extname(f).toLowerCase()));
  const audioFiles = all.filter((f) => AUDIO_EXT.has(path.extname(f).toLowerCase()));

  console.log(`PHASE probing ${videoFiles.length} clips`);
  const assets = [];
  const probes = [];
  for (const f of videoFiles) {
    const full = path.join(assetsDir, f);
    const meta = await parseMedia({
      src: full,
      fields: { durationInSeconds: true, dimensions: true, fps: true },
      reader: nodeReader,
      acknowledgeRemotionLicense: true,
    });
    const id = path.basename(f, path.extname(f));
    assets.push({
      id,
      kind: "video",
      src: `assets/${f}`,
      durationSec: meta.durationInSeconds ?? undefined,
      width: meta.dimensions?.width,
      height: meta.dimensions?.height,
    });
    probes.push({ file: f, ...meta });
    console.log(`CLIP ${f} ${round(meta.durationInSeconds ?? 0)}s ${meta.dimensions?.width}x${meta.dimensions?.height}`);
  }

  // Deterministic assembly: clips on one absolute timeline, overlapping by the
  // transition duration so crossfades stay in sync with text/captions. Muted
  // (music comes later).
  const TRANS = 0.3;
  let cursor = 0;
  const clips = assets.map((a, i) => {
    const len = Math.min(a.durationSec ?? CAP_SEC, CAP_SEC);
    const start = round(cursor);
    const clip = {
      id: `v-${a.id}`,
      assetId: a.id,
      start,
      in: 0,
      out: round(len),
      volume: 0,
    };
    if (i > 0) clip.transitionIn = { preset: "fade", duration: TRANS };
    if (i < assets.length - 1) clip.transitionOut = { preset: "fade", duration: TRANS };
    cursor = start + len - (i < assets.length - 1 ? TRANS : 0);
    return clip;
  });

  // Music bed: first audio file, spanning the video duration.
  for (const f of audioFiles) {
    const meta = await parseMedia({
      src: path.join(assetsDir, f),
      fields: { durationInSeconds: true },
      reader: nodeReader,
      acknowledgeRemotionLicense: true,
    });
    assets.push({
      id: path.basename(f, path.extname(f)),
      kind: "audio",
      src: `assets/${f}`,
      durationSec: meta.durationInSeconds ?? undefined,
    });
  }

  edl.assets = assets;
  const videoTrack = edl.tracks.find((tr) => tr.type === "video");
  if (videoTrack) videoTrack.clips = clips;
  else edl.tracks.unshift({ id: "v", type: "video", clips });

  const videoDur = round(cursor);
  const music = assets.find((a) => a.kind === "audio");
  if (music) {
    const span = videoDur > 0 ? videoDur : (music.durationSec ?? 1);
    const out = round(Math.min(music.durationSec ?? span, span)) || 1;
    const audioClips = [
      { id: `a-${music.id}`, assetId: music.id, start: 0, in: 0, out, gain: -12, duckUnderVoice: false },
    ];
    const audioTrack = edl.tracks.find((tr) => tr.type === "audio");
    if (audioTrack) audioTrack.clips = audioClips;
    else edl.tracks.push({ id: "aud", type: "audio", clips: audioClips });
  }

  fs.writeFileSync(edlPath, `${JSON.stringify(edl, null, 2)}\n`);
  fs.writeFileSync(
    path.join(projectDir, "analysis.json"),
    `${JSON.stringify({ slug, generatedAt: new Date().toISOString(), probes }, null, 2)}\n`,
  );
  console.log(`DONE assembled ${clips.length} clips, ${round(cursor)}s of video`);
}

main().catch((err) => {
  console.error(`ERROR ${err?.stack || err}`);
  process.exit(1);
});
