import { describe, expect, it } from "vitest";
import { round, sanitizeAssetId, tsvCell } from "./cli.mjs";

describe("sanitizeAssetId", () => {
  it("matches the app importer's id derivation (spaces -> dashes, ext dropped)", () => {
    expect(sanitizeAssetId("my clip.mp4")).toBe("my-clip");
    expect(sanitizeAssetId("Clip_01.MOV")).toBe("Clip_01");
    expect(sanitizeAssetId("a (2).webm")).toBe("a-2-");
    expect(sanitizeAssetId("émoji☺.mp4")).toBe("-moji-");
  });
});

describe("tsvCell", () => {
  it("collapses tabs/newlines so a value can't shift TSV columns", () => {
    expect(tsvCell("added\tmusic\nbed")).toBe("added music bed");
    expect(tsvCell("  spaced   out  ")).toBe("spaced out");
  });
});

describe("round", () => {
  it("rounds to 2 decimals", () => {
    expect(round(1.239)).toBe(1.24);
    expect(round(3)).toBe(3);
  });
});
