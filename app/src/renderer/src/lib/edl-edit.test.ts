import { describe, expect, it } from "vitest";
import { parseEdl, type AudioTrack } from "@reel/edl";
import { addAssets, addAudioClip, findVideoClip, mutateTextClip, mutateVideoClip } from "./edl-edit";

function baseEdl() {
  return parseEdl({
    tracks: [
      {
        id: "v",
        type: "video",
        clips: [{ id: "v1", assetId: "a", start: 0, in: 0, out: 4 }],
      },
      { id: "t", type: "text", clips: [{ id: "t1", start: 0, end: 2, text: "hi" }] },
    ],
  }).edl!;
}

describe("addAssets", () => {
  it("appends new assets and dedups by id", () => {
    const edl = baseEdl();
    edl.assets = [{ id: "a", kind: "video", src: "assets/a.mp4" }];
    addAssets(edl, [
      { id: "a", kind: "video", src: "assets/a.mp4" },
      { id: "b", kind: "audio", src: "assets/b.mp3" },
    ]);
    expect(edl.assets.map((x) => x.id)).toEqual(["a", "b"]);
  });
});

describe("addAudioClip", () => {
  it("adds a music clip that ducks under voice at -12dB", () => {
    const edl = baseEdl();
    addAudioClip(edl, "m", "music", 10);
    const track = edl.tracks.find((t): t is AudioTrack => t.type === "audio")!;
    expect(track.clips[0]).toMatchObject({ assetId: "m", role: "music", gain: -12, duckUnderVoice: true, out: 10 });
  });

  it("adds a voiceover clip at 0dB without ducking", () => {
    const edl = baseEdl();
    addAudioClip(edl, "vo", "voiceover", 5);
    const track = edl.tracks.find((t): t is AudioTrack => t.type === "audio")!;
    expect(track.clips[0]).toMatchObject({ role: "voiceover", gain: 0, duckUnderVoice: false });
  });
});

describe("mutators", () => {
  it("mutateVideoClip edits the matching clip", () => {
    const edl = baseEdl();
    mutateVideoClip(edl, "v1", (c) => (c.out = 2));
    expect(findVideoClip(edl, "v1")?.out).toBe(2);
  });

  it("mutateTextClip edits the matching clip", () => {
    const edl = baseEdl();
    mutateTextClip(edl, "t1", (c) => (c.text = "changed"));
    const text = edl.tracks.find((t) => t.type === "text");
    expect(text?.type === "text" && text.clips[0].text).toBe("changed");
  });
});
