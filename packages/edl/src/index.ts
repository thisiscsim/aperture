import { EdlSchema } from "./schema";
import type { Edl, Track } from "./types";

export * from "./schema";
export * from "./types";

export interface ParseResult {
  ok: boolean;
  edl?: Edl;
  errors?: string[];
}

/** Parse + validate unknown JSON into a typed, defaulted Edl. */
export function parseEdl(input: unknown): ParseResult {
  const result = EdlSchema.safeParse(input);
  if (result.success) {
    return { ok: true, edl: result.data };
  }
  return {
    ok: false,
    errors: result.error.issues.map((i) => `${i.path.join(".") || "(root)"}: ${i.message}`),
  };
}

/** Throwing variant — use where an invalid EDL is a programmer error. */
export function parseEdlOrThrow(input: unknown): Edl {
  return EdlSchema.parse(input);
}

/** Total duration in seconds = the latest end time across all tracks/clips. */
export function durationSeconds(edl: Edl): number {
  let max = 0;
  for (const track of edl.tracks) {
    max = Math.max(max, trackEndSeconds(track));
  }
  return max;
}

/** Total duration in frames, rounded up — what Remotion's durationInFrames needs. */
export function durationFrames(edl: Edl): number {
  return Math.max(1, Math.ceil(durationSeconds(edl) * edl.format.fps));
}

function trackEndSeconds(track: Track): number {
  switch (track.type) {
    case "video":
    case "audio":
      return track.clips.reduce((m, c) => Math.max(m, c.start + (c.out - c.in)), 0);
    case "text":
      return track.clips.reduce((m, c) => Math.max(m, c.end), 0);
    case "caption":
      return 0; // bounded by the audio/video it sits over
  }
}
