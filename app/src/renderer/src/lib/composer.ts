/** Composer settings model shared by the zero-state home and the Create tab. */

export type ComposerMode = "generation" | "critique";
export type ComposerEffort = "low" | "medium" | "high" | "ultra";
export type ComposerAspect = "9:16" | "1:1" | "4:3" | "16:9" | "4:5";
export type ReferenceMode = "literal" | "inspired";

export interface ComposerSettings {
  mode: ComposerMode;
  effort: ComposerEffort;
  fastMode: boolean;
  aspect: ComposerAspect;
  durationSec: number;
  referenceMode: ReferenceMode;
}

export const DEFAULT_COMPOSER_SETTINGS: ComposerSettings = {
  mode: "generation",
  effort: "high",
  fastMode: false,
  aspect: "9:16",
  durationSec: 12,
  referenceMode: "literal",
};

export const EFFORT_LABELS: Record<ComposerEffort, string> = {
  low: "Low",
  medium: "Medium",
  high: "High",
  ultra: "Ultra",
};

export const EFFORT_ICONS = {
  low: "battery-low",
  medium: "battery-medium",
  high: "battery-full",
  ultra: "lightning-bolt",
} as const;

export const ASPECT_LABELS: Record<ComposerAspect, string> = {
  "9:16": "Vertical",
  "1:1": "Square",
  "4:3": "Classic",
  "16:9": "Wide",
  "4:5": "Portrait",
};

export const ASPECT_ORDER: ComposerAspect[] = ["9:16", "1:1", "4:3", "16:9", "4:5"];

/** Output dimensions per aspect, anchored to the 1080-wide vertical default. */
export const ASPECT_DIMENSIONS: Record<ComposerAspect, { width: number; height: number }> = {
  "9:16": { width: 1080, height: 1920 },
  "1:1": { width: 1080, height: 1080 },
  "4:3": { width: 1440, height: 1080 },
  "16:9": { width: 1920, height: 1080 },
  "4:5": { width: 1080, height: 1350 },
};

export const DURATION_OPTIONS = [12, 15, 30, 45, 60];

export const REFERENCE_MODE_LABELS: Record<ReferenceMode, string> = {
  literal: "Literal",
  inspired: "As inspiration",
};

/**
 * Derive a project title from the first prompt: first sentence-ish chunk,
 * capped by words and length so slugs stay reasonable.
 */
export function deriveTitle(promptText: string): string {
  const clean = promptText.replace(/\s+/g, " ").trim();
  if (!clean) return "Untitled project";
  const sentence = clean.split(/[.!?\n]/)[0]?.trim() ?? clean;
  const words = sentence.split(" ").slice(0, 8).join(" ");
  const capped = words.length > 60 ? `${words.slice(0, 60).trimEnd()}…` : words;
  return capped || "Untitled project";
}

/** "00:21"-style badge label for staged clip durations. */
export function formatClipDuration(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return "00:00";
  const total = Math.round(seconds);
  const mins = Math.floor(total / 60);
  const secs = total % 60;
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}`;
}
