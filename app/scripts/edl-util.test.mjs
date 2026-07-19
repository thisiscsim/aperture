import { describe, expect, it } from "vitest";
import { enforceStyle, extractJson, metrics, restoreAudioTracks, sanitizeEdl } from "./edl-util.mjs";

describe("sanitizeEdl", () => {
  it("fills a missing anim.name (the baseline-fallback bug) and defaults from", () => {
    const out = sanitizeEdl({
      tracks: [{ type: "text", clips: [{ id: "t1", anim: { from: "x" } }] }],
    });
    expect(out.tracks[0].clips[0].anim.name).toBe("soft-blur-in");
    expect(out.tracks[0].clips[0].anim.from).toBe("x");
  });

  it("drops a non-object anim and fixes an invalid style", () => {
    const out = sanitizeEdl({
      tracks: [{ type: "text", clips: [{ id: "t1", anim: "nope", style: "headline" }] }],
    });
    expect(out.tracks[0].clips[0].anim).toBeUndefined();
    expect(out.tracks[0].clips[0].style).toBe("subtitle");
  });

  it("leaves non-text tracks and valid anims untouched", () => {
    const input = { tracks: [{ type: "video", clips: [{ id: "v1" }] }] };
    expect(sanitizeEdl(input)).toEqual(input);
  });

  it("swaps inverted in/out and start/end ranges, padding degenerate ones", () => {
    const out = sanitizeEdl({
      tracks: [
        { type: "video", clips: [{ id: "v1", in: 10, out: 2 }] },
        { type: "video", clips: [{ id: "v2", in: 4, out: 4 }] },
        { type: "text", clips: [{ id: "t1", start: 5, end: 2, text: "hi" }] },
      ],
    });
    expect(out.tracks[0].clips[0]).toMatchObject({ in: 2, out: 10 });
    expect(out.tracks[1].clips[0]).toMatchObject({ in: 4, out: 5 });
    expect(out.tracks[2].clips[0]).toMatchObject({ start: 2, end: 5 });
  });

  it("repairs transitions: defaults broken durations, drops zero/negative or preset-less ones", () => {
    const out = sanitizeEdl({
      tracks: [
        {
          type: "video",
          clips: [
            { id: "a", in: 0, out: 2, transitionIn: { preset: "fade", duration: 0 } },
            { id: "b", in: 0, out: 2, transitionIn: { preset: "fade" }, transitionOut: { duration: 1 } },
            { id: "c", in: 0, out: 2, transitionIn: { preset: "slide", duration: 400 } },
          ],
        },
      ],
    });
    const [a, b, c] = out.tracks[0].clips;
    expect(a.transitionIn).toBeUndefined();
    expect(b.transitionIn).toMatchObject({ preset: "fade", duration: 0.4 });
    expect(b.transitionOut).toBeUndefined();
    expect(c.transitionIn).toMatchObject({ preset: "slide", duration: 30 });
  });

  it("clamps volume/gain and truncates oversized ids and track names", () => {
    const out = sanitizeEdl({
      tracks: [
        {
          type: "video",
          id: "x".repeat(300),
          name: "n".repeat(300),
          clips: [{ id: "i".repeat(300), in: 0, out: 2, volume: 9 }],
        },
        { type: "audio", clips: [{ id: "a1", in: 0, out: 2, gain: -900 }] },
      ],
    });
    expect(out.tracks[0].id).toHaveLength(256);
    expect(out.tracks[0].name).toHaveLength(256);
    expect(out.tracks[0].clips[0].id).toHaveLength(256);
    expect(out.tracks[0].clips[0].volume).toBe(1);
    expect(out.tracks[1].clips[0].gain).toBe(-60);
  });

  it("repairs caption words: clamps timings and fixes inverted ranges", () => {
    const out = sanitizeEdl({
      tracks: [
        {
          type: "caption",
          words: [
            { text: "hi", start: 2, end: 1 },
            { text: "there", start: 1, end: Number.POSITIVE_INFINITY },
          ],
        },
      ],
    });
    expect(out.tracks[0].words[0]).toMatchObject({ start: 1, end: 2 });
    expect(out.tracks[0].words[1]).toMatchObject({ start: 1, end: 1 });
  });
});

describe("restoreAudioTracks", () => {
  const baseline = {
    tracks: [
      { id: "v", type: "video", clips: [{ id: "v1", assetId: "a", start: 0, in: 0, out: 12 }] },
      {
        id: "aud",
        type: "audio",
        name: "Music",
        clips: [
          {
            id: "a-m",
            assetId: "m",
            start: 0,
            in: 0,
            out: 12,
            gain: -12,
            duckUnderVoice: false,
            role: "music",
          },
        ],
      },
      {
        id: "vo",
        type: "audio",
        clips: [
          {
            id: "a-v",
            assetId: "v",
            start: 0,
            in: 0,
            out: 6,
            gain: 0,
            duckUnderVoice: false,
            role: "voiceover",
          },
        ],
      },
    ],
  };

  it("re-attaches audio tracks the model dropped, capping music to the new video length", () => {
    const modelCut = {
      tracks: [{ id: "v", type: "video", clips: [{ id: "v1", assetId: "a", start: 0, in: 0, out: 8 }] }],
    };
    const out = restoreAudioTracks(modelCut, baseline);
    const aud = out.tracks.find((t) => t.id === "aud");
    const vo = out.tracks.find((t) => t.id === "vo");
    expect(aud.name).toBe("Music");
    expect(aud.clips[0]).toMatchObject({ assetId: "m", role: "music", out: 8 });
    // Voiceover keeps its natural length (captions may outlast the last cut).
    expect(vo.clips[0]).toMatchObject({ assetId: "v", role: "voiceover", out: 6 });
  });

  it("restores clips onto an emptied track without duplicating a kept one", () => {
    const modelCut = {
      tracks: [
        { id: "v", type: "video", clips: [{ id: "v1", assetId: "a", start: 0, in: 0, out: 12 }] },
        { id: "aud", type: "audio", clips: [] },
        {
          id: "vo",
          type: "audio",
          clips: [{ id: "a-v", assetId: "v", start: 1, in: 0, out: 6, role: "voiceover" }],
        },
      ],
    };
    const out = restoreAudioTracks(modelCut, baseline);
    expect(out.tracks.find((t) => t.id === "aud").clips).toHaveLength(1);
    // The model's own placement of the kept voiceover is untouched.
    expect(out.tracks.find((t) => t.id === "vo").clips[0].start).toBe(1);
  });

  it("is a no-op when the model kept all audio", () => {
    const modelCut = JSON.parse(JSON.stringify(baseline));
    const out = restoreAudioTracks(modelCut, baseline);
    expect(out).toEqual(baseline);
  });
});

describe("extractJson", () => {
  it("parses a fenced ```json block", () => {
    expect(extractJson('prose\n```json\n{"a":1}\n```\nmore')).toEqual({ a: 1 });
  });

  it("parses bare JSON surrounded by prose", () => {
    expect(extractJson('here it is {"b":2} thanks')).toEqual({ b: 2 });
  });

  it("throws when there is no JSON object", () => {
    expect(() => extractJson("no json here")).toThrow();
  });
});

describe("metrics", () => {
  it("computes cuts and duration from tracks", () => {
    const edl = {
      theme: { safeMargins: { top: 10, bottom: 10 } },
      tracks: [
        {
          type: "video",
          clips: [
            { start: 0, in: 0, out: 2 },
            { start: 2, in: 0, out: 2 },
          ],
        },
        { type: "caption", words: [{ text: "hi", start: 0, end: 1 }] },
      ],
    };
    const m = metrics(edl);
    expect(m.durationSec).toBe(4);
    expect(m.videoClips).toBe(2);
    expect(m.cutsPer10s).toBe(5);
    expect(m.hasCaptions).toBe(true);
    expect(m.hasMargins).toBe(true);
    expect(m.hookPresent).toBe(true);
  });
});

describe("enforceStyle", () => {
  it("stamps palette, font, caption, grade, and preset id", () => {
    const edl = { theme: { palette: ["#000"], captionStyle: "karaoke" } };
    const profile = {
      id: "p1",
      palette: ["#111111", "#eeeeee", "#ff0000"],
      fontFamily: "Inter",
      captionStyle: "block",
      grade: { brightness: 1.1 },
    };
    enforceStyle(edl, profile);
    expect(edl.theme.palette).toEqual(["#111111", "#eeeeee", "#ff0000"]);
    expect(edl.theme.fontFamily).toBe("Inter");
    expect(edl.theme.captionStyle).toBe("block");
    expect(edl.theme.grade).toEqual({ brightness: 1.1 });
    expect(edl.theme.stylePreset).toBe("p1");
  });

  it("is a no-op without a profile", () => {
    const edl = { theme: { palette: ["#000"] } };
    expect(enforceStyle(edl, null)).toBe(edl);
    expect(edl.theme.palette).toEqual(["#000"]);
  });
});
