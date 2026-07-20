import { describe, expect, it } from "vitest";
import { activeWordIndexAt, captionLineAt } from "./SocialVideo";

// The caption lookup runs every preview/export frame over up to 20k words, so
// it's a binary search; guard the boundary behavior (a linear scan is the
// trivially-correct reference).
const words = [
  { text: "one", start: 0, end: 0.5 },
  { text: "two", start: 0.5, end: 1.0 },
  { text: "three", start: 1.2, end: 1.8 },
  // A long pause here should start a new caption line.
  { text: "four", start: 5.0, end: 5.4 },
  { text: "five", start: 5.4, end: 5.9 },
];

describe("activeWordIndexAt", () => {
  const linear = (t: number) => words.findIndex((w) => t >= w.start && t < w.end);

  it("matches a linear scan across the timeline (including gaps and edges)", () => {
    for (let t = -0.2; t <= 6.2; t += 0.05) {
      expect(activeWordIndexAt(words, t)).toBe(linear(t));
    }
  });

  it("is start-inclusive and end-exclusive at exact boundaries", () => {
    expect(activeWordIndexAt(words, 0)).toBe(0);
    expect(activeWordIndexAt(words, 0.5)).toBe(1); // one.end is exclusive
    expect(activeWordIndexAt(words, 1.0)).toBe(-1); // in the 1.0-1.2 gap
    expect(activeWordIndexAt(words, 5.9)).toBe(-1); // five.end is exclusive
  });

  it("handles an empty list", () => {
    expect(activeWordIndexAt([], 1)).toBe(-1);
  });
});

describe("captionLineAt", () => {
  it("groups words into a phrase and reports the active index within it", () => {
    const at = captionLineAt(words, 0.6); // "two"
    expect(at?.line.map((w) => w.text)).toEqual(["one", "two", "three"]);
    expect(at?.activeIndex).toBe(1);
  });

  it("breaks the line on a long pause", () => {
    const at = captionLineAt(words, 5.1); // "four", after the 3.2s gap
    expect(at?.line.map((w) => w.text)).toEqual(["four", "five"]);
    expect(at?.activeIndex).toBe(0);
  });

  it("returns null when no word is active", () => {
    expect(captionLineAt(words, 1.05)).toBeNull();
  });
});
