import { describe, expect, it } from "vitest";
import { buildTiles, matchesQuery, sortTiles, type HomeTile } from "./home";
import type { AlbumSummary, ProjectSummary } from "../../../preload";

const proj = (slug: string, title: string, updatedAt: string, albumId?: string): ProjectSummary => ({
  slug,
  title,
  platform: "reels",
  status: "draft",
  durationSec: 10,
  assetCount: 1,
  updatedAt,
  albumId,
});

const album = (id: string, name: string, createdAt: string): AlbumSummary => ({ id, name, createdAt });

const projects = [
  proj("a", "Alpha", "2026-07-01T00:00:00Z"),
  proj("b", "Bravo", "2026-07-03T00:00:00Z", "trip"),
  proj("c", "Charlie", "2026-07-02T00:00:00Z", "trip"),
];
const albums = [album("trip", "Road Trip", "2026-06-30T00:00:00Z")];

describe("matchesQuery", () => {
  it("is case-insensitive and empty-query matches all", () => {
    expect(matchesQuery("Napa Valley", "napa")).toBe(true);
    expect(matchesQuery("Napa Valley", "  ")).toBe(true);
    expect(matchesQuery("Napa Valley", "tokyo")).toBe(false);
  });
});

describe("sortTiles", () => {
  const tiles: HomeTile[] = projects.map((project) => ({ kind: "project", project }));
  it("newest / oldest sort by timestamp", () => {
    expect(sortTiles(tiles, "newest").map((t) => (t.kind === "project" ? t.project.slug : ""))).toEqual([
      "b",
      "c",
      "a",
    ]);
    expect(sortTiles(tiles, "oldest").map((t) => (t.kind === "project" ? t.project.slug : ""))).toEqual([
      "a",
      "c",
      "b",
    ]);
  });
  it("az / za sort by name", () => {
    expect(sortTiles(tiles, "az")[0]).toMatchObject({ project: { title: "Alpha" } });
    expect(sortTiles(tiles, "za")[0]).toMatchObject({ project: { title: "Charlie" } });
  });
});

describe("buildTiles", () => {
  it("All tab: ungrouped projects + one tile per album, sorted together", () => {
    const tiles = buildTiles({ projects, albums, tab: "all", openAlbumId: null, sort: "newest", query: "" });
    // Album carries its latest member activity (Jul 3) so it leads Alpha (Jul 1).
    expect(tiles.map((t) => (t.kind === "album" ? `album:${t.album.id}` : t.project.slug))).toEqual([
      "album:trip",
      "a",
    ]);
  });

  it("album tile aggregates members newest-first with latest-member timestamp", () => {
    const [albumTile] = buildTiles({ projects, albums, tab: "albums", openAlbumId: null, sort: "newest", query: "" });
    if (albumTile.kind !== "album") throw new Error("expected album tile");
    expect(albumTile.members.map((m) => m.slug)).toEqual(["b", "c"]);
    expect(albumTile.updatedAt).toBe("2026-07-03T00:00:00Z");
  });

  it("drill-in lists only the album's members and respects search", () => {
    const tiles = buildTiles({ projects, albums, tab: "all", openAlbumId: "trip", sort: "az", query: "" });
    expect(tiles.map((t) => (t.kind === "project" ? t.project.slug : ""))).toEqual(["b", "c"]);
    const filtered = buildTiles({ projects, albums, tab: "all", openAlbumId: "trip", sort: "az", query: "brav" });
    expect(filtered).toHaveLength(1);
  });

  it("search matches album names on the top level", () => {
    const tiles = buildTiles({ projects, albums, tab: "all", openAlbumId: null, sort: "newest", query: "road" });
    expect(tiles).toHaveLength(1);
    expect(tiles[0].kind).toBe("album");
  });

  it("projects pointing at a deleted album are treated as ungrouped", () => {
    const orphan = [proj("d", "Delta", "2026-07-04T00:00:00Z", "gone")];
    const tiles = buildTiles({ projects: orphan, albums: [], tab: "all", openAlbumId: null, sort: "newest", query: "" });
    expect(tiles).toEqual([{ kind: "project", project: orphan[0] }]);
  });
});
