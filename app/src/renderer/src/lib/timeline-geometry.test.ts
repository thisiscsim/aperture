import { describe, expect, it } from "vitest";
import { parseEdl } from "@reel/edl";
import { computePreview, geomFor, placeAudioOnTrack, type AnyClip } from "./timeline-geometry";

describe("computePreview", () => {
  const media = { start: 2, in: 1, out: 4 };

  it("move shifts start, keeps in/out", () => {
    expect(computePreview("video", "move", media, 1.5, 10)).toEqual({ start: 3.5, in: 1, out: 4 });
  });

  it("move clamps start at 0", () => {
    expect(computePreview("video", "move", media, -10, 10).start).toBe(0);
  });

  it("left trims in and shifts start together", () => {
    expect(computePreview("video", "left", media, 1, 10)).toEqual({ start: 3, in: 2, out: 4 });
  });

  it("right extends out, capped by the asset duration", () => {
    expect(computePreview("video", "right", media, 100, 5)).toEqual({ start: 2, in: 1, out: 5 });
  });

  it("right keeps at least MIN_DUR above in", () => {
    const r = computePreview("video", "right", { start: 0, in: 2, out: 3 }, -100, 10);
    expect(r.out).toBeGreaterThan(r.in!);
  });

  it("text move shifts start and end together", () => {
    expect(computePreview("text", "move", { start: 1, end: 3 }, 2, undefined)).toEqual({
      start: 3,
      end: 5,
    });
  });
});

describe("geomFor", () => {
  it("uses the live preview for the dragged clip only", () => {
    const clip = { id: "c", start: 0, in: 0, out: 3 } as AnyClip;
    const drag = { clipId: "c", trackType: "video" as const, preview: { start: 5, in: 0, out: 2 } };
    expect(geomFor("video", clip, drag)).toEqual({ start: 5, dur: 2 });
    expect(geomFor("video", clip, null)).toEqual({ start: 0, dur: 3 });
  });
});

describe("placeAudioOnTrack", () => {
  it("infers voiceover role from the track id and dedupes the asset", () => {
    const edl = parseEdl({
      assets: [{ id: "a", kind: "audio", src: "assets/a.mp3", durationSec: 5 }],
      tracks: [{ id: "vo", type: "audio", clips: [] }],
    }).edl!;
    placeAudioOnTrack(edl, "vo", "a", 5, 1);
    const track = edl.tracks.find((t) => t.id === "vo");
    expect(track?.type).toBe("audio");
    if (track?.type === "audio") {
      expect(track.clips).toHaveLength(1);
      expect(track.clips[0]).toMatchObject({ role: "voiceover", start: 1, out: 5, gain: 0 });
    }
  });

  it("music ducks when a voiceover already exists", () => {
    const edl = parseEdl({
      assets: [
        { id: "m", kind: "audio", src: "assets/m.mp3", durationSec: 8 },
        { id: "v", kind: "audio", src: "assets/v.mp3", durationSec: 4 },
      ],
      tracks: [
        { id: "vo", type: "audio", clips: [{ id: "c", assetId: "v", in: 0, out: 4, role: "voiceover" }] },
        { id: "aud", type: "audio", clips: [] },
      ],
    }).edl!;
    placeAudioOnTrack(edl, "aud", "m", 8, 0);
    const music = edl.tracks.find((t) => t.id === "aud");
    if (music?.type === "audio") {
      expect(music.clips[0]).toMatchObject({ role: "music", duckUnderVoice: true, gain: -12 });
    }
  });
});
