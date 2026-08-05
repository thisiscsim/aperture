import { describe, expect, it } from "vitest";
import { deriveTitle, formatClipDuration } from "./composer";

describe("deriveTitle", () => {
  it("takes the first sentence, capped at 8 words", () => {
    expect(deriveTitle("Create a 45-second vertical video documenting Napa Valley. Two moons hang.")).toBe(
      "Create a 45-second vertical video documenting Napa Valley",
    );
  });

  it("caps very long word runs at 60 chars with an ellipsis", () => {
    const title = deriveTitle(
      "Supercalifragilistic expialidocious extraordinarily comprehensive documentary retrospective anthology compilation",
    );
    expect(title.length).toBeLessThanOrEqual(61);
    expect(title.endsWith("…")).toBe(true);
  });

  it("collapses whitespace and falls back for empty prompts", () => {
    expect(deriveTitle("  a   day \n in  napa  ")).toBe("a day in napa");
    expect(deriveTitle("   ")).toBe("Untitled project");
  });
});

describe("formatClipDuration", () => {
  it("formats mm:ss", () => {
    expect(formatClipDuration(21)).toBe("00:21");
    expect(formatClipDuration(75)).toBe("01:15");
  });

  it("guards non-finite input", () => {
    expect(formatClipDuration(Number.NaN)).toBe("00:00");
    expect(formatClipDuration(-3)).toBe("00:00");
  });
});
