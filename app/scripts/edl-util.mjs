// Shared helpers for the LLM-backed scripts (generate / critique / autotune):
// JSON extraction, schema-deviation repair, and a deterministic metrics summary
// used to ground the model so it scores/edit against real numbers.
import { durationSeconds } from "@reel/edl";

export const ANIM_NAMES = [
  "soft-blur-in",
  "per-character-rise",
  "per-word-crossfade",
  "spring-scale-in",
  "mask-reveal-up",
  "blur-out-up",
  "scale-down-fade",
  "typewriter",
];

const round = (n) => Math.round(n * 100) / 100;

/** Pull the first {...} JSON object out of a model response (handles code fences). */
export function extractJson(text) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const body = fenced ? fenced[1] : text;
  const start = body.indexOf("{");
  const end = body.lastIndexOf("}");
  if (start < 0 || end <= start) throw new Error("no JSON object in model output");
  return JSON.parse(body.slice(start, end + 1));
}

/** Repair common harmless model deviations before strict EdlSchema validation. */
export function sanitizeEdl(obj) {
  if (!obj || !Array.isArray(obj.tracks)) return obj;
  for (const track of obj.tracks) {
    if (track?.type === "text" && Array.isArray(track.clips)) {
      for (const clip of track.clips) {
        if (clip && clip.anim != null) {
          if (typeof clip.anim !== "object") {
            delete clip.anim;
          } else if (typeof clip.anim.name !== "string" || !clip.anim.name) {
            clip.anim.name = "soft-blur-in";
            clip.anim.from = clip.anim.from ?? "animate-text";
          }
        }
        if (clip && clip.style && clip.style !== "title" && clip.style !== "subtitle") {
          clip.style = "subtitle";
        }
      }
    }
  }
  return obj;
}

/** Deterministic structural metrics for grounding the LLM critic/editor. */
export function metrics(edl) {
  const vids = edl.tracks.filter((t) => t.type === "video").flatMap((t) => t.clips ?? []);
  const txt = edl.tracks.filter((t) => t.type === "text").flatMap((t) => t.clips ?? []);
  const dur = durationSeconds(edl);
  return {
    durationSec: round(dur),
    videoClips: vids.length,
    textClips: txt.length,
    cutsPer10s: dur > 0 ? round((vids.length / dur) * 10) : 0,
    hasCaptions: edl.tracks.some((t) => t.type === "caption" && (t.source || (t.words?.length ?? 0) > 0)),
    hasAudio: edl.tracks.some((t) => t.type === "audio" && (t.clips?.length ?? 0) > 0),
    hasMargins: (edl.theme?.safeMargins?.top ?? 0) > 0 && (edl.theme?.safeMargins?.bottom ?? 0) > 0,
    hookPresent: vids.some((c) => c.start <= 0.1) || txt.some((c) => c.start <= 2),
  };
}
