import type { Edl, TextClip, VideoClip } from "@reel/edl";

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
