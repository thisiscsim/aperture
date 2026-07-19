import { describe, expect, it } from "vitest";
import {
  durationFrames,
  durationSeconds,
  parseBenchmarks,
  parseCritique,
  parseEdl,
  parseMeta,
  parseStyleProfile,
} from "@reel/edl";

describe("parseEdl", () => {
  it("fills defaults for an empty object", () => {
    const res = parseEdl({});
    expect(res.ok).toBe(true);
    expect(res.edl?.format).toEqual({ width: 1080, height: 1920, fps: 30 });
    expect(res.edl?.theme.captionStyle).toBe("karaoke");
    expect(res.edl?.assets).toEqual([]);
    expect(res.edl?.tracks).toEqual([]);
  });

  it("rejects an invalid track type with errors", () => {
    const res = parseEdl({ tracks: [{ id: "x", type: "bogus" }] });
    expect(res.ok).toBe(false);
    expect(res.errors?.length).toBeGreaterThan(0);
  });

  it("parses the discriminated track union and defaults audio role to music", () => {
    const res = parseEdl({
      assets: [{ id: "a", kind: "audio", src: "assets/a.mp3" }],
      tracks: [{ id: "aud", type: "audio", clips: [{ id: "c", assetId: "a", out: 5 }] }],
    });
    expect(res.ok).toBe(true);
    const track = res.edl?.tracks[0];
    expect(track?.type).toBe("audio");
    if (track?.type === "audio") {
      expect(track.clips[0].role).toBe("music");
      expect(track.clips[0].duckUnderVoice).toBe(false);
    }
  });

  it("applies grade defaults when theme.grade is provided", () => {
    const res = parseEdl({ theme: { grade: {} } });
    expect(res.ok).toBe(true);
    expect(res.edl?.theme.grade).toEqual({
      brightness: 1,
      contrast: 1,
      saturation: 1,
      temperature: 0,
      vignette: 0,
    });
  });

  it("leaves grade undefined by default", () => {
    expect(parseEdl({}).edl?.theme.grade).toBeUndefined();
  });
});

// Project files are shareable, so the schema is the security boundary:
// unbounded numbers hang the timeline/player, traversal paths escape the
// project sandbox, and non-color palette strings reach inline CSS.
describe("hostile input hardening", () => {
  const withVideoClip = (clip: Record<string, unknown>) => ({
    tracks: [
      { id: "v", type: "video", clips: [{ id: "c", assetId: "a", start: 0, in: 0, out: 4, ...clip }] },
    ],
  });

  it("rejects Infinity timings (JSON 1e400 parses to Infinity)", () => {
    expect(parseEdl(withVideoClip({ out: Number.POSITIVE_INFINITY })).ok).toBe(false);
    expect(parseEdl(withVideoClip({ start: Number.POSITIVE_INFINITY })).ok).toBe(false);
  });

  it("rejects absurd finite timings", () => {
    expect(parseEdl(withVideoClip({ out: 1e13 })).ok).toBe(false);
    expect(parseEdl(withVideoClip({ out: 14_000 })).ok).toBe(true);
  });

  it("rejects traversal and absolute asset paths", () => {
    const asset = (src: string) => parseEdl({ assets: [{ id: "a", kind: "video", src }] });
    expect(asset("../../secret/recording.m4a").ok).toBe(false);
    expect(asset("/etc/passwd").ok).toBe(false);
    expect(asset("C:\\Windows\\evil.mp4").ok).toBe(false);
    expect(asset("assets/../../../x.mp4").ok).toBe(false);
    expect(asset("assets/clip.mp4").ok).toBe(true);
  });

  it("rejects palette entries that are not plain color literals", () => {
    const theme = (color: string) => parseEdl({ theme: { palette: [color] } });
    expect(theme("url('https://attacker.example/beacon')").ok).toBe(false);
    expect(theme("red; background:url(//x)").ok).toBe(false);
    expect(theme("#E8B04B").ok).toBe(true);
    expect(theme("rgba(0, 0, 0, 0.5)").ok).toBe(true);
    expect(theme("rebeccapurple").ok).toBe(true);
  });

  it("caps text clip length", () => {
    const text = (t: string) =>
      parseEdl({ tracks: [{ id: "t", type: "text", clips: [{ id: "t1", start: 0, end: 2, text: t }] }] });
    expect(text("x".repeat(2001)).ok).toBe(false);
    expect(text("x".repeat(500)).ok).toBe(true);
  });

  it("rejects NUL bytes and UNC prefixes in media paths", () => {
    const asset = (src: string) => parseEdl({ assets: [{ id: "a", kind: "video", src }] });
    expect(asset("assets/clip\0.mp4").ok).toBe(false);
    expect(asset("\\\\evil-host\\share\\x.mp4").ok).toBe(false);
  });

  it("rejects inverted clip ranges (out <= in, end <= start)", () => {
    expect(parseEdl(withVideoClip({ in: 10, out: 2 })).ok).toBe(false);
    expect(parseEdl(withVideoClip({ in: 4, out: 4 })).ok).toBe(false);
    const text = parseEdl({
      tracks: [{ id: "t", type: "text", clips: [{ id: "t1", start: 5, end: 2, text: "hi" }] }],
    });
    expect(text.ok).toBe(false);
    const audio = parseEdl({
      tracks: [{ id: "a", type: "audio", clips: [{ id: "c", assetId: "x", in: 9, out: 3 }] }],
    });
    expect(audio.ok).toBe(false);
  });

  it("rejects unbounded track ids/names and anim names", () => {
    expect(parseEdl({ tracks: [{ id: "x".repeat(257), type: "video", clips: [] }] }).ok).toBe(false);
    expect(parseEdl({ tracks: [{ id: "v", name: "n".repeat(257), type: "video", clips: [] }] }).ok).toBe(
      false,
    );
    const anim = parseEdl({
      tracks: [
        {
          id: "t",
          type: "text",
          clips: [{ id: "t1", start: 0, end: 2, text: "hi", anim: { name: "a".repeat(65) } }],
        },
      ],
    });
    expect(anim.ok).toBe(false);
  });

  it("caps clip-array sizes", () => {
    const clips = Array.from({ length: 501 }, (_, i) => ({
      id: `c${i}`,
      assetId: "a",
      start: 0,
      in: 0,
      out: 1,
    }));
    expect(parseEdl({ tracks: [{ id: "v", type: "video", clips }] }).ok).toBe(false);
  });
});

// style.json / benchmarks.json / critique.json are shareable project files
// too — the same hostile-input rules apply to the sidecar schemas.
describe("hostile sidecar input", () => {
  it("style profile rejects non-color palette entries (they get stamped into EDL themes)", () => {
    expect(() => parseStyleProfile({ palette: ["url('https://x/beacon')"] })).toThrow();
    expect(parseStyleProfile({ palette: ["#FAFAF9", "rgb(1, 2, 3)"] }).palette).toHaveLength(2);
  });

  it("style profile rejects Infinity/absurd numerics", () => {
    expect(() => parseStyleProfile({ targetLengthSec: Number.POSITIVE_INFINITY })).toThrow();
    expect(() => parseStyleProfile({ pacing: { cutsPer10s: Number.POSITIVE_INFINITY } })).toThrow();
    expect(() => parseStyleProfile({ hookSec: -1 })).toThrow();
    expect(parseStyleProfile({ targetLengthSec: 22, pacing: { cutsPer10s: 6 } }).targetLengthSec).toBe(22);
  });

  it("style profile caps prompt-bound strings and arrays", () => {
    expect(() => parseStyleProfile({ styleGuide: "x".repeat(20_001) })).toThrow();
    expect(() => parseStyleProfile({ do: Array.from({ length: 51 }, () => "tip") })).toThrow();
    expect(() => parseStyleProfile({ exemplars: Array.from({ length: 51 }, () => ({})) })).toThrow();
  });

  it("benchmarks reject Infinity metrics (they feed z-score math)", () => {
    expect(() =>
      parseBenchmarks({
        distribution: { durationSec: { mean: Number.POSITIVE_INFINITY, std: 1, min: 0, max: 1 } },
      }),
    ).toThrow();
    expect(() => parseBenchmarks({ videos: [{ file: "a.mp4", durationSec: 1e13 }] })).toThrow();
    expect(
      parseBenchmarks({
        count: 1,
        videos: [{ file: "a.mp4", durationSec: 21, loudnessLufs: -14 }],
        distribution: { durationSec: { mean: 21, std: 3, min: 15, max: 30 } },
      }).count,
    ).toBe(1);
  });

  it("parseCritique returns null for junk and clamps shape for valid input", () => {
    expect(parseCritique(null)).toBeNull();
    expect(parseCritique({ score: 9000, subscores: [] })).toBeNull();
    expect(parseCritique({ score: 80, subscores: ["not-an-object"] })).toBeNull();
    const ok = parseCritique({
      score: 72,
      subscores: [{ key: "hook", label: "Hook", score: 20, max: 25, note: "solid" }],
      fixes: [{ issue: "ending", fix: "add a CTA" }],
      benchmarksUsed: false,
      summary: "decent first cut",
    });
    expect(ok?.score).toBe(72);
    expect(ok?.subscores[0].benchmark).toBeUndefined();
  });
});

describe("duration helpers", () => {
  const edl = parseEdl({
    format: { fps: 30 },
    tracks: [
      { id: "v", type: "video", clips: [{ id: "c1", assetId: "a", start: 0, in: 0, out: 4 }] },
      { id: "t", type: "text", clips: [{ id: "t1", start: 1, end: 6, text: "hi" }] },
    ],
  }).edl!;

  it("durationSeconds is the latest end across tracks", () => {
    expect(durationSeconds(edl)).toBe(6);
  });

  it("durationFrames rounds up to frames", () => {
    expect(durationFrames(edl)).toBe(180);
  });
});

describe("sidecar parsers", () => {
  it("parseMeta defaults", () => {
    expect(parseMeta({})).toMatchObject({ title: "Untitled", platform: "reels", status: "draft" });
  });

  it("parseStyleProfile defaults", () => {
    const p = parseStyleProfile({});
    expect(p.palette).toEqual([]);
    expect(p.exemplars).toEqual([]);
    expect(p.pacing).toEqual({});
  });

  it("parseBenchmarks defaults", () => {
    expect(parseBenchmarks({})).toMatchObject({ count: 0, videos: [], distribution: {} });
  });
});
