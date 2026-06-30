// LLM-backed first cut via a single structured-output call (cost-predictable),
// provider-agnostic (default GPT-5.5; see llm.mjs for the escape hatch).
//
// Flow: run the cheap local baseline (analyze.mjs) to probe clips and produce a
// valid edl.json skeleton, then ask the model to REFINE it from prompt.md +
// style.json. One model call (with one repair retry on invalid JSON), validated
// against EdlSchema before writing.
//
// Run: `OPENAI_API_KEY=... node app/scripts/generate-llm.mjs --slug <slug>`
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { spawnSync } from "node:child_process";
import { generateText } from "ai";
import { parseEdl } from "@reel/edl";
import { isLlmConfigured, llmConfig, resolveModel } from "./llm.mjs";
import { ANIM_NAMES, extractJson, sanitizeEdl } from "./edl-util.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
// Reasoning models spend tokens on hidden reasoning before the JSON, so give
// the completion generous headroom.
const MAX_OUTPUT_TOKENS = 16000;

function arg(name) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : undefined;
}

function readMaybe(file) {
  try {
    return fs.readFileSync(file, "utf8");
  } catch {
    return "";
  }
}

function buildPrompt(baselineJson, promptMd, styleJson) {
  return [
    "You are an expert short-form (vertical 9:16) video editor.",
    "Refine the BASELINE edit decision list (edl.json) into a polished first cut.",
    "",
    "Return ONLY a single JSON object — the complete updated edl.json. No prose, no code fences.",
    "",
    "Rules:",
    "- Keep the exact same shape/keys as the baseline (it is already schema-valid).",
    "- Only use assets that exist in the baseline `assets` array (same `id` and `src`).",
    "- Make the first ~2 seconds a strong hook; reorder/trim video clips for pacing.",
    "- Add a `text` track with title/subtitle overlays derived from the prompt.",
    `- Every text clip MUST have this exact shape: {"id":"t1","start":0.2,"end":2.6,"text":"...","style":"title"|"subtitle","anim":{"name":"<one of ${ANIM_NAMES.join("|")}>","from":"animate-text"}}. The anim.name field is REQUIRED — never omit it. Or omit the whole "anim" key.`,
    "- Respect theme.safeMargins; keep captions/text out of platform UI zones.",
    "- If a style profile is given, honor its palette, fontFamily, captionStyle, pacing, and target length.",
    "",
    "=== CREATOR PROMPT (prompt.md) ===",
    promptMd || "(none)",
    "",
    "=== STYLE PROFILE (style.json) ===",
    styleJson || "(none)",
    "",
    "=== BASELINE edl.json ===",
    baselineJson,
  ].join("\n");
}

async function main() {
  const slug = arg("slug");
  if (!slug) throw new Error("missing --slug");
  if (!isLlmConfigured()) {
    console.error("ERROR no LLM credentials configured (set APERTURE_LLM_API_KEY or OPENAI_API_KEY).");
    process.exit(3);
  }

  const projectDir = path.join(repoRoot, "projects", slug);
  const edlPath = path.join(projectDir, "edl.json");

  // 1) Deterministic baseline (probes clips, writes a valid edl.json skeleton).
  console.log("PHASE assembling baseline");
  const baseline = spawnSync("node", [path.join(__dirname, "analyze.mjs"), "--slug", slug], {
    cwd: repoRoot,
    encoding: "utf8",
  });
  if (baseline.status !== 0) {
    console.error(`ERROR baseline assembly failed: ${baseline.stderr || baseline.status}`);
    process.exit(2);
  }

  const baselineJson = readMaybe(edlPath);
  const promptMd = readMaybe(path.join(projectDir, "prompt.md"));
  const styleJson = readMaybe(path.join(projectDir, "style.json"));

  const { provider, model } = llmConfig();
  console.log(`PHASE editing with ${provider}/${model}`);

  const llm = resolveModel();
  let prompt = buildPrompt(baselineJson, promptMd, styleJson);
  let edl = null;
  let lastError = "";

  for (let attempt = 0; attempt < 2 && !edl; attempt++) {
    const { text } = await generateText({
      model: llm,
      prompt,
      maxOutputTokens: MAX_OUTPUT_TOKENS,
      // Reasoning models (e.g. gpt-5.5) reject `temperature`; keep effort modest
      // for latency/cost. providerOptions is ignored by non-OpenAI providers.
      providerOptions: { openai: { reasoningEffort: "low" } },
    });
    try {
      const candidate = sanitizeEdl(extractJson(text));
      const parsed = parseEdl(candidate);
      if (parsed.ok && parsed.edl) {
        edl = parsed.edl;
      } else {
        lastError = (parsed.errors ?? ["invalid edl"]).join("; ");
        prompt = `${buildPrompt(baselineJson, promptMd, styleJson)}\n\nYour previous output was invalid: ${lastError}\nReturn corrected JSON only.`;
      }
    } catch (err) {
      lastError = String(err);
      prompt = `${buildPrompt(baselineJson, promptMd, styleJson)}\n\nYour previous output could not be parsed: ${lastError}\nReturn a single valid JSON object only.`;
    }
  }

  if (!edl) {
    console.error(`ERROR model did not produce a valid edl.json (${lastError}). Baseline was kept.`);
    process.exit(2);
  }

  console.log("PHASE writing edl.json");
  fs.writeFileSync(edlPath, `${JSON.stringify(edl, null, 2)}\n`);
  console.log(`DONE generated ${slug}/edl.json`);
}

main().catch((err) => {
  console.error(`ERROR ${err?.stack || err}`);
  process.exit(1);
});
