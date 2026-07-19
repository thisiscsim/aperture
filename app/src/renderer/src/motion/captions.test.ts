import { describe, expect, it } from "vitest";
import { activeWordAt } from "./SocialVideo";

// The caption lookup runs every preview/export frame over up to 20k words, so
// it's a binary search; guard the boundary behavior (a linear scan is the
// trivially-correct reference).
describe("activeWordAt", () => {
  const words = [
    { text: "one", start: 0, end: 0.5 },
    { text: "two", start: 0.5, end: 1.0 },
    { text: "three", start: 1.2, end: 1.8 },
  ];
  const linear = (t: number) => words.find((w) => t >= w.start && t < w.end);

  it("matches a linear scan across the timeline (including the gap and edges)", () => {
    for (let t = -0.2; t <= 2.2; t += 0.05) {
      const ref = linear(t);
      expect(activeWordAt(words, t)?.text).toBe(ref?.text);
    }
  });

  it("is start-inclusive and end-exclusive at exact boundaries", () => {
    expect(activeWordAt(words, 0)?.text).toBe("one");
    expect(activeWordAt(words, 0.5)?.text).toBe("two"); // one.end is exclusive
    expect(activeWordAt(words, 1.0)).toBeUndefined(); // in the 1.0–1.2 gap
    expect(activeWordAt(words, 1.8)).toBeUndefined(); // three.end is exclusive
  });

  it("handles empty/undefined word lists", () => {
    expect(activeWordAt([], 1)).toBeUndefined();
    expect(activeWordAt(undefined, 1)).toBeUndefined();
  });
});
