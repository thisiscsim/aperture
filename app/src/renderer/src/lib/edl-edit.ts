import type { Asset, AudioClip, AudioTrack, Edl, TextClip, VideoClip } from "@reel/edl";
import { durationSeconds } from "@reel/edl";

const round = (n: number) => Math.round(n * 100) / 100;

/** Append imported assets, skipping any whose id already exists. */
export function addAssets(edl: Edl, assets: Asset[]): void {
  for (const a of assets) {
    if (!edl.assets.some((x) => x.id === a.id)) edl.assets.push(a);
  }
}

/**
 * Add (or replace) an audio clip for an asset. Music spans the whole video and
 * ducks under voice; voiceover/sfx sit at their natural length from t=0.
 */
export function addAudioClip(
  edl: Edl,
  assetId: string,
  role: "music" | "voiceover" | "sfx",
  durationSec?: number,
): void {
  let track = edl.tracks.find((t): t is AudioTrack => t.type === "audio");
  if (!track) {
    track = { id: "aud", type: "audio", clips: [] };
    edl.tracks.push(track);
  }
  const videoLen = durationSeconds(edl);
  const out = round(role === "music" ? durationSec ?? Math.max(1, videoLen) : durationSec ?? Math.max(1, videoLen));
  const clip: AudioClip = {
    id: `a-${assetId}`,
    assetId,
    start: 0,
    in: 0,
    out: out || 1,
    gain: role === "music" ? -12 : 0,
    duckUnderVoice: role === "music",
    role,
  };
  track.clips = track.clips.filter((c) => c.assetId !== assetId);
  track.clips.push(clip);
}

export function findVideoClip(edl: Edl, id: string | null): VideoClip | undefined {
  if (!id) return undefined;
  for (const track of edl.tracks) {
    if (track.type === "video") {
      const clip = track.clips.find((c) => c.id === id);
      if (clip) return clip;
    }
  }
  return undefined;
}

export function mutateVideoClip(edl: Edl, id: string, fn: (clip: VideoClip) => void): void {
  for (const track of edl.tracks) {
    if (track.type === "video") {
      const clip = track.clips.find((c) => c.id === id);
      if (clip) {
        fn(clip);
        return;
      }
    }
  }
}

export function findTextClip(edl: Edl, id: string | null): TextClip | undefined {
  if (!id) return undefined;
  for (const track of edl.tracks) {
    if (track.type === "text") {
      const clip = track.clips.find((c) => c.id === id);
      if (clip) return clip;
    }
  }
  return undefined;
}

export function mutateTextClip(edl: Edl, id: string, fn: (clip: TextClip) => void): void {
  for (const track of edl.tracks) {
    if (track.type === "text") {
      const clip = track.clips.find((c) => c.id === id);
      if (clip) {
        fn(clip);
        return;
      }
    }
  }
}
