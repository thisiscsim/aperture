// LLM-backed auto-improve loop (the Claudia auto-skills pattern): each iteration
// the model critiques the current cut and returns an improved edl.json plus a
// 0-100 score and a one-line change note. We validate, write, log the score
// trajectory to results.tsv, and stop on target/plateau/iteration cap.
// Provider-agnostic (default GPT-5.5; see llm.mjs).
//
// Run: `OPENAI_API_KEY=... node app/scripts/autotune-llm.mjs --slug <slug> [--iterations 3] [--target 88]`
import { fileURLToPath } from "node:url";
import path from "node:path";
import fs from "node:fs";
import { generateText } from "ai";
import { parseEdl } from "@reel/edl";
import { isLlmConfigured, llmConfig, resolveModel, reasoningEffort } from "./llm.mjs";
import { ANIM_NAMES, extractJson, metrics, restoreAudioTracks, sanitizeEdl } from "./edl-util.mjs";
import { resolveProjectDir } from "./lib/project-dir.mjs";
import { arg, readMaybe, tsvCell } from "./lib/cli.mjs";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, "..", "..");
const clampScore = (n) => Math.min(100, Math.max(0, Math.round(n)));

function buildPrompt({ edlJson, metricsJson, promptMd, styleJson, benchmarksJson }) {
  return [
    "You are an expert short-form (vertical 9:16) video editor improving a cut, one focused pass at a time.",
    "Critique the CURRENT edit, then return an IMPROVED version that fixes the 1-2 highest-impact problems",
    "(weakest of: hook in first 2s, pacing/cuts, captions, safe margins, length, audio, ending).",
    "If a benchmarks distribution is given, move pacing/length toward its means.",
    "",
    "Return ONLY this JSON (no prose, no code fences):",
    '{ "score": <your 0-100 estimate of the IMPROVED cut>, "change": "<one line: what you changed and why>", "edl": <the COMPLETE improved edl.json object> }',
    "",
    "Constraints for `edl`:",
    "- Same shape/keys as the input; only use assets already present (same id/src).",
    `- Every text clip's anim, if present, must be {"name":"<one of ${ANIM_NAMES.join("|")}>","from":"animate-text"} (name REQUIRED) — or omit anim.`,
    "- Keep it schema-valid; respect theme.safeMargins.",
    "",
    "=== DETERMINISTIC METRICS (ground truth) ===",
    metricsJson,
    "",
    "=== CREATOR PROMPT ===",
    promptMd || "(none)",
    "",
    "=== STYLE PROFILE ===",
    styleJson || "(none)",
    "",
    "=== BENCHMARKS ===",
    benchmarksJson || "(none)",
    "",
    "=== CURRENT edl.json ===",
    edlJson,
  ].join("\n");
}

async function main() {
  const slug = arg("slug");
  if (!slug) throw new Error("missing --slug");
  if (!isLlmConfigured()) {
    console.error("ERROR no LLM credentials configured (set OPENAI_API_KEY or APERTURE_LLM_API_KEY).");
    process.exit(3);
  }
  const maxIterations = Number(arg("iterations") ?? 3);
  const target = Number(arg("target") ?? 88);

  const projectDir = resolveProjectDir(repoRoot, slug);
  const edlPath = path.join(projectDir, "edl.json");
  if (!fs.existsSync(edlPath)) {
    console.error("ERROR no edl.json to improve");
    process.exit(2);
  }
  const promptMd = readMaybe(path.join(projectDir, "prompt.md"));
  const styleJson = readMaybe(path.join(projectDir, "style.json"));
  const benchmarksJson = readMaybe(path.join(projectDir, "benchmarks.json")) || "(none)";

  const resultsPath = path.join(projectDir, "results.tsv");
  if (!fs.existsSync(resultsPath)) fs.writeFileSync(resultsPath, "iter\tscore\tdelta\tchange\n");

  const { provider, model } = llmConfig();
  const llm = resolveModel();
  // The current cut is untrusted input too (shareable file, or a prior tool's
  // output): don't iterate on — or interpolate into prompts — an invalid EDL.
  const initial = parseEdl(JSON.parse(readMaybe(edlPath)));
  if (!initial.ok || !initial.edl) {
    console.error(`ERROR invalid edl.json: ${(initial.errors ?? []).slice(0, 5).join("; ")}`);
    process.exit(2);
  }
  let edl = initial.edl;
  let prev = null;
  let stagnant = 0;
  // Deterministic plateau signal: the model's self-reported score can't be
  // trusted (a hostile/confused cut could claim 100 to stop early), so also
  // track whether the structural metrics actually changed between iterations.
  let prevSig = JSON.stringify(metrics(edl));

  for (let i = 1; i <= maxIterations; i++) {
    console.log(`PHASE iteration ${i}/${maxIterations} (${provider}/${model})`);
    const prompt = buildPrompt({
      edlJson: JSON.stringify(edl, null, 2),
      metricsJson: JSON.stringify(metrics(edl), null, 2),
      promptMd,
      styleJson,
      benchmarksJson,
    });

    let out;
    try {
      const { text } = await generateText({
        model: llm,
        prompt,
        maxOutputTokens: 16000,
        providerOptions: { openai: { reasoningEffort: reasoningEffort() } },
      });
      out = extractJson(text);
    } catch (err) {
      console.error(`ERROR iteration ${i} model call failed: ${err}`);
      break;
    }

    const candidate = sanitizeEdl(out.edl);
    const parsed = parseEdl(candidate);
    if (!parsed.ok || !parsed.edl) {
      console.log(`PHASE iteration ${i} produced invalid edl, stopping`);
      break;
    }
    // Clamp the model's self-reported score to a sane range, and escape the
    // change note so tabs/newlines can't shift results.tsv columns.
    const score = typeof out.score === "number" ? clampScore(out.score) : (prev ?? 0);
    const change = tsvCell(typeof out.change === "string" ? out.change.slice(0, 120) : "revised edit");

    // Never let an improvement pass silently drop the music bed / voiceover.
    // restoreAudioTracks runs after the schema gate, so re-validate before the
    // result is allowed to replace edl.json.
    const restored = parseEdl(restoreAudioTracks(parsed.edl, edl));
    if (!restored.ok || !restored.edl) {
      console.log(`PHASE iteration ${i} post-processing produced invalid edl, stopping`);
      break;
    }
    edl = restored.edl;
    fs.writeFileSync(edlPath, `${JSON.stringify(edl, null, 2)}\n`);
    const delta = prev == null ? 0 : score - prev;
    fs.appendFileSync(resultsPath, `${i}\t${score}\t${delta >= 0 ? "+" : ""}${delta}\t${change}\n`);
    console.log(`PHASE ${change} -> ${score}`);
    console.log(`PROGRESS ${Math.round((i / maxIterations) * 100)}`);

    if (score >= target) {
      console.log("PHASE target reached");
      prev = score;
      break;
    }
    // Stop when the cut stops actually changing (deterministic) OR the reported
    // score plateaus — whichever fires first.
    const sig = JSON.stringify(metrics(edl));
    const unchanged = sig === prevSig;
    prevSig = sig;
    if (unchanged || (prev != null && delta < 2)) {
      stagnant++;
      if (stagnant >= 2) {
        console.log(unchanged ? "PHASE no structural change" : "PHASE score plateaued");
        prev = score;
        break;
      }
    } else {
      stagnant = 0;
    }
    prev = score;
  }

  console.log(`DONE final score ${prev ?? "n/a"}`);
}

main().catch((err) => {
  console.error(`ERROR ${err?.stack || err}`);
  process.exit(1);
});
