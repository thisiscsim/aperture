// Standalone Remotion render. Run in a child Node process (spawned by the
// Electron main process, or directly: `node app/scripts/render.mjs --slug <slug>`).
// Emits line-oriented progress the main process parses: PHASE/PROGRESS/DONE/ERROR.
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { bundle } from "@remotion/bundler";
import { ensureBrowser, renderMedia, selectComposition } from "@remotion/renderer";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

async function main() {
  const slug = arg("slug");
  if (!slug) throw new Error("missing --slug");

  const projectDir = path.join(repoRoot, "projects", slug);
  const edl = JSON.parse(fs.readFileSync(path.join(projectDir, "edl.json"), "utf8"));

  const entryPoint = path.join(repoRoot, "app", "src", "renderer", "src", "motion", "index.ts");
  const rendersDir = path.join(projectDir, "renders");
  fs.mkdirSync(rendersDir, { recursive: true });
  const output = path.join(rendersDir, `${slug}-${Date.now()}.mp4`);

  // No assetBaseUrl: the composition uses staticFile(), served from publicDir.
  const inputProps = { edl };

  console.log("PHASE preparing");
  await ensureBrowser();

  console.log("PHASE bundling");
  const serveUrl = await bundle({ entryPoint, publicDir: projectDir });

  console.log("PHASE composition");
  const composition = await selectComposition({ serveUrl, id: "SocialVideo", inputProps });

  console.log("PHASE rendering");
  await renderMedia({
    composition,
    serveUrl,
    codec: "h264",
    outputLocation: output,
    inputProps,
    onProgress: ({ progress }) => console.log(`PROGRESS ${Math.round(progress * 100)}`),
  });

  console.log(`DONE ${output}`);
}

main().catch((err) => {
  console.error(`ERROR ${err?.stack || err}`);
  process.exit(1);
});
