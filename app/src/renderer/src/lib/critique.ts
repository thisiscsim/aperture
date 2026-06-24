import type { Edl } from "@reel/edl";
import { durationSeconds } from "@reel/edl";

export interface SubScore {
  key: string;
  label: string;
  score: number;
  max: number;
  note: string;
}

export interface Critique {
  score: number;
  subscores: SubScore[];
  fixes: { issue: string; fix: string }[];
}

/**
 * Heuristic best-practices score for a short-form cut. NOT a virality
 * prediction — it rewards the structural choices that reliably help
 * short-form perform (strong hook, good pacing, captions, safe areas).
 * The real agent-driven version lands in M6.
 */
export function critiqueEdl(edl: Edl): Critique {
  const dur = durationSeconds(edl);
  const videoClips = edl.tracks.filter((t) => t.type === "video").flatMap((t) => (t.type === "video" ? t.clips : []));
  const textClips = edl.tracks.filter((t) => t.type === "text").flatMap((t) => (t.type === "text" ? t.clips : []));
  const hasCaptions = edl.tracks.some((t) => t.type === "caption" && Boolean(t.source));
  const hasAudio = edl.tracks.some((t) => t.type === "audio" && t.clips.length > 0);
  const hasMargins = edl.theme.safeMargins.top > 0 && edl.theme.safeMargins.bottom > 0;

  const hookPresent = videoClips.some((c) => c.start <= 0.1) || textClips.some((c) => c.start <= 2);
  const endingPresent =
    videoClips.some((c) => c.start + (c.out - c.in) >= dur - 1.5) || textClips.some((c) => c.end >= dur - 1.5);

  const subscores: SubScore[] = [
    {
      key: "hook",
      label: "Hook (first 2s)",
      max: 25,
      score: hookPresent ? 22 : 6,
      note: hookPresent ? "Opens with a clear hook." : "No strong element in the first 2 seconds.",
    },
    {
      key: "pacing",
      label: "Pacing",
      max: 15,
      score: videoClips.length >= 4 && videoClips.length <= 12 ? 14 : videoClips.length === 0 ? 4 : 9,
      note:
        videoClips.length === 0
          ? "No video clips yet — pacing can't be judged."
          : `${videoClips.length} cuts.`,
    },
    {
      key: "captions",
      label: "Captions",
      max: 15,
      score: hasCaptions ? 15 : 4,
      note: hasCaptions ? "Captions present." : "Add captions — most short-form is watched muted.",
    },
    {
      key: "safe",
      label: "Safe areas",
      max: 10,
      score: hasMargins ? 10 : 3,
      note: hasMargins ? "Text respects platform UI zones." : "Set safe margins so text clears the UI.",
    },
    {
      key: "length",
      label: "Length",
      max: 10,
      score: dur >= 7 && dur <= 35 ? 10 : dur < 7 ? 5 : 6,
      note: `${dur.toFixed(1)}s ${dur >= 7 && dur <= 35 ? "(in range)" : "(outside 7-35s sweet spot)"}.`,
    },
    {
      key: "audio",
      label: "Audio",
      max: 15,
      score: hasAudio ? 14 : 5,
      note: hasAudio ? "Has an audio bed." : "Add music or voice — silence underperforms.",
    },
    {
      key: "ending",
      label: "Ending",
      max: 10,
      score: endingPresent ? 9 : 4,
      note: endingPresent ? "Has a closing beat." : "Land the ending with a payoff or CTA.",
    },
  ];

  const score = Math.round(subscores.reduce((s, x) => s + x.score, 0));

  const fixes = subscores
    .filter((s) => s.score / s.max < 0.7)
    .map((s) => ({ issue: s.label, fix: s.note }));

  return { score, subscores, fixes };
}
