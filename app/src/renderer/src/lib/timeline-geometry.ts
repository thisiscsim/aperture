import type { Edl, Track } from "@reel/edl";

// Pure geometry + placement helpers for the timeline, split out of the
// Timeline component so they can be unit-tested without a DOM. No React here.

export const LABEL_W = 150;
export const PX_PER_SEC = 60;
export const MIN_DUR = 0.2;
export const ASSET_MIME = "application/x-aperture-asset";

export type DragMode = "move" | "left" | "right";
/** Timeline lanes render clip-bearing tracks only (captions burn in via preview). */
export type LaneTrack = Extract<Track, { type: "video" | "text" | "audio" }>;

export interface Preview {
  start: number;
  end?: number;
  in?: number;
  out?: number;
}
export interface DragState {
  clipId: string;
  trackType: Track["type"];
  preview: Preview;
}

export interface MediaLike {
  id: string;
  start: number;
  in: number;
  out: number;
  assetId: string;
}
export interface TextLike {
  id: string;
  start: number;
  end: number;
  text: string;
}
export type AnyClip = (MediaLike | TextLike) & { id: string; start: number };

export const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
export const round = (n: number) => Math.round(n * 100) / 100;

export function clipsOf(track: Track): AnyClip[] {
  if (track.type === "caption") return [];
  return track.clips as AnyClip[];
}

export function labelOf(type: Track["type"], clip: AnyClip): string {
  if (type === "text") return (clip as TextLike).text;
  return (clip as MediaLike).assetId;
}

export function assetDurationFor(edl: Edl, clip: AnyClip): number | undefined {
  const assetId = (clip as MediaLike).assetId;
  if (!assetId) return undefined;
  return edl.assets.find((a) => a.id === assetId)?.durationSec;
}

export function geomFor(
  type: Track["type"],
  clip: AnyClip,
  drag: DragState | null,
): { start: number; dur: number } {
  const p = drag && drag.clipId === clip.id ? drag.preview : null;
  if (type === "text") {
    const start = p?.start ?? clip.start;
    const end = p?.end ?? (clip as TextLike).end;
    return { start, dur: Math.max(MIN_DUR, end - start) };
  }
  const start = p?.start ?? clip.start;
  const inP = p?.in ?? (clip as MediaLike).in;
  const outP = p?.out ?? (clip as MediaLike).out;
  return { start, dur: Math.max(MIN_DUR, outP - inP) };
}

export function computePreview(
  type: Track["type"],
  mode: DragMode,
  orig: Preview,
  dSec: number,
  assetDur: number | undefined,
): Preview {
  if (type === "text") {
    const end = orig.end ?? orig.start + 1;
    if (mode === "move") {
      const start = Math.max(0, orig.start + dSec);
      return { start, end: end + (start - orig.start) };
    }
    if (mode === "left") {
      return { start: clamp(orig.start + dSec, 0, end - MIN_DUR), end };
    }
    return { start: orig.start, end: Math.max(orig.start + MIN_DUR, end + dSec) };
  }

  const inV = orig.in ?? 0;
  const outV = orig.out ?? 1;
  if (mode === "move") {
    return { start: Math.max(0, orig.start + dSec), in: inV, out: outV };
  }
  if (mode === "left") {
    const newIn = clamp(inV + dSec, 0, outV - MIN_DUR);
    return { start: Math.max(0, orig.start + (newIn - inV)), in: newIn, out: outV };
  }
  const maxOut = assetDur ?? Number.POSITIVE_INFINITY;
  return { start: orig.start, in: inV, out: clamp(outV + dSec, inV + MIN_DUR, maxOut) };
}

export function commit(
  updateEdl: (fn: (edl: Edl) => void) => void,
  id: string,
  type: Track["type"],
  preview: Preview,
): void {
  updateEdl((d) => {
    for (const track of d.tracks) {
      if (track.type === "caption") continue;
      const clip = track.clips.find((c) => c.id === id);
      if (!clip) continue;
      clip.start = round(preview.start);
      if (track.type === "text" && preview.end != null) {
        (clip as TextLike).end = round(preview.end);
      } else if (track.type !== "text") {
        if (preview.in != null) (clip as MediaLike).in = round(preview.in);
        if (preview.out != null) (clip as MediaLike).out = round(preview.out);
      }
      return;
    }
  });
}

/**
 * Place an audio asset on the exact lane the user targeted (unlike the left
 * rail's role-routed add). Role is inferred from the lane; a music drop while
 * a voiceover exists ducks by default.
 */
export function placeAudioOnTrack(
  edl: Edl,
  trackId: string,
  assetId: string,
  durationSec: number | undefined,
  at: number,
): void {
  const track = edl.tracks.find((t) => t.id === trackId);
  if (track?.type !== "audio") return;
  const role = track.id === "vo" || track.name?.toLowerCase().includes("voice") ? "voiceover" : "music";
  const hasVoice = edl.tracks.some((t) => t.type === "audio" && t.clips.some((c) => c.role === "voiceover"));
  track.clips = track.clips.filter((c) => c.assetId !== assetId);
  track.clips.push({
    id: `a-${assetId}-${Date.now().toString(36)}`,
    assetId,
    start: round(at),
    in: 0,
    out: round(Math.max(0.1, durationSec ?? 1)),
    gain: role === "music" ? -12 : 0,
    duckUnderVoice: role === "music" && hasVoice,
    role,
  });
}

export function emptyHint(type: Track["type"]): string {
  switch (type) {
    case "video":
      return "Click to add video, or drag a clip from the left";
    case "text":
      return "Drag to sketch a text overlay";
    case "audio":
      return "Click to add audio, or drag from the left";
    default:
      return "";
  }
}
