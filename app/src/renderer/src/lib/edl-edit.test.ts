import { describe, expect, it } from "vitest";
import { parseEdl, type Asset, type AudioTrack } from "@reel/edl";
import {
  addAssets,
  addAudioClip,
  findAudioClip,
  findVideoClip,
  mutateTextClip,
  mutateVideoClip,
  removeClip,
  reorderAssets,
} from "./edl-edit";

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
  it("appends new assets and dedups re-imports of the same file", () => {
    const edl = baseEdl();
    edl.assets = [{ id: "a", kind: "video", src: "assets/a.mp4" }];
    addAssets(edl, [
      { id: "a", kind: "video", src: "assets/a.mp4" },
      { id: "b", kind: "audio", src: "assets/b.mp3" },
    ]);
    expect(edl.assets.map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("suffixes the id when a different file collides with an existing stem", () => {
    const edl = baseEdl();
    edl.assets = [{ id: "clip", kind: "video", src: "assets/clip.mp4" }];
    const incoming = [{ id: "clip", kind: "video" as const, src: "assets/clip.mov" }];
    addAssets(edl, incoming);
    expect(edl.assets.map((x) => x.id)).toEqual(["clip", "clip-2"]);
    // Mutated in place so callers placing clips right after see the final id.
    expect(incoming[0].id).toBe("clip-2");
  });
});

describe("addAudioClip", () => {
  it("caps a music bed at the video length (never stretches the cut)", () => {
    const edl = baseEdl(); // video ends at 4s
    addAudioClip(edl, "m", "music", 10);
    const track = edl.tracks.find((t): t is AudioTrack => t.type === "audio")!;
    expect(track.clips[0]).toMatchObject({
      assetId: "m",
      role: "music",
      gain: -12,
      duckUnderVoice: true,
      out: 4,
    });
  });

  it("uses the track's natural length when there is no video yet", () => {
    const edl = parseEdl({ tracks: [{ id: "v", type: "video", clips: [] }] }).edl!;
    addAudioClip(edl, "m", "music", 10);
    const track = edl.tracks.find((t): t is AudioTrack => t.type === "audio")!;
    expect(track.clips[0].out).toBe(10);
  });

  it("adds a voiceover clip at 0dB and ducks existing music under it", () => {
    const edl = baseEdl();
    addAudioClip(edl, "m", "music", 4);
    const music = edl.tracks.find((t): t is AudioTrack => t.type === "audio")!;
    music.clips[0].duckUnderVoice = false; // e.g. a generated bed with no VO at the time

    addAudioClip(edl, "vo", "voiceover", 5);
    const vo = edl.tracks.find((t): t is AudioTrack => t.type === "audio" && t.id === "vo")!;
    expect(vo.clips[0]).toMatchObject({ role: "voiceover", gain: 0, duckUnderVoice: false });
    expect(music.clips[0].duckUnderVoice).toBe(true);
  });

  it("splits music and voiceover onto separate tracks", () => {
    const edl = baseEdl();
    addAudioClip(edl, "m", "music", 4);
    addAudioClip(edl, "vo", "voiceover", 5);
    const ids = edl.tracks.filter((t) => t.type === "audio").map((t) => t.id);
    expect(ids).toEqual(["aud", "vo"]);
  });
});

describe("reorderAssets", () => {
  // Clips and audio interleaved on purpose: reordering one family must keep
  // the other family's slots fixed.
  const mixed = (): Asset[] => [
    { id: "c1", kind: "video", src: "assets/c1.mp4" },
    { id: "m1", kind: "audio", src: "assets/m1.mp3" },
    { id: "c2", kind: "video", src: "assets/c2.mp4" },
    { id: "c3", kind: "image", src: "assets/c3.jpg" },
    { id: "m2", kind: "audio", src: "assets/m2.mp3" },
  ];

  it("moves a clip forward, landing after the target (arrayMove semantics)", () => {
    const edl = baseEdl();
    edl.assets = mixed();
    reorderAssets(edl, "clip", "c1", "c3");
    expect(edl.assets.map((a) => a.id)).toEqual(["c2", "m1", "c3", "c1", "m2"]);
  });

  it("moves a clip backward, landing before the target", () => {
    const edl = baseEdl();
    edl.assets = mixed();
    reorderAssets(edl, "clip", "c3", "c1");
    expect(edl.assets.map((a) => a.id)).toEqual(["c3", "m1", "c1", "c2", "m2"]);
  });

  it("reorders audio without disturbing clip positions", () => {
    const edl = baseEdl();
    edl.assets = mixed();
    reorderAssets(edl, "audio", "m2", "m1");
    expect(edl.assets.map((a) => a.id)).toEqual(["c1", "m2", "c2", "c3", "m1"]);
  });

  it("no-ops on identical ids or ids missing from the family", () => {
    const edl = baseEdl();
    edl.assets = mixed();
    const before = edl.assets.map((a) => a.id);
    reorderAssets(edl, "clip", "c1", "c1");
    reorderAssets(edl, "clip", "c1", "ghost");
    // m1 is audio — not in the clip family view, so this must not move c1.
    reorderAssets(edl, "clip", "c1", "m1");
    expect(edl.assets.map((a) => a.id)).toEqual(before);
  });
});

describe("removeClip", () => {
  it("removes video, text, and audio clips by id, whatever layer holds them", () => {
    const edl = baseEdl();
    addAudioClip(edl, "m", "music", 4); // clip id a-m

    removeClip(edl, "v1");
    removeClip(edl, "t1");
    removeClip(edl, "a-m");

    expect(findVideoClip(edl, "v1")).toBeUndefined();
    const text = edl.tracks.find((t) => t.type === "text");
    expect(text?.type === "text" && text.clips).toEqual([]);
    expect(findAudioClip(edl, "a-m")).toBeUndefined();
  });

  it("no-ops on unknown ids and skips caption layers safely", () => {
    const edl = parseEdl({
      tracks: [
        { id: "v", type: "video", clips: [{ id: "v1", assetId: "a", start: 0, in: 0, out: 4 }] },
        { id: "cap", type: "caption" },
      ],
    }).edl!;
    removeClip(edl, "ghost");
    expect(findVideoClip(edl, "v1")).toBeDefined();
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
