import type { AlbumSummary, ProjectSummary } from "../../../preload";

export type HomeSort = "newest" | "oldest" | "az" | "za";

export const SORT_LABELS: Record<HomeSort, string> = {
  newest: "By newest",
  oldest: "By oldest",
  az: "Name A–Z",
  za: "Name Z–A",
};

/** A grid tile: either a single project or an album of projects. */
export type HomeTile =
  | { kind: "project"; project: ProjectSummary }
  | { kind: "album"; album: AlbumSummary; members: ProjectSummary[]; updatedAt?: string };

const time = (iso?: string) => (iso ? new Date(iso).getTime() : 0);

export function matchesQuery(title: string, query: string): boolean {
  const q = query.trim().toLowerCase();
  return q === "" || title.toLowerCase().includes(q);
}

function tileName(tile: HomeTile): string {
  return tile.kind === "project" ? tile.project.title : tile.album.name;
}

function tileTime(tile: HomeTile): number {
  return tile.kind === "project" ? time(tile.project.updatedAt) : time(tile.updatedAt);
}

export function sortTiles(tiles: HomeTile[], sort: HomeSort): HomeTile[] {
  const sorted = [...tiles];
  switch (sort) {
    case "newest":
      return sorted.sort((a, b) => tileTime(b) - tileTime(a));
    case "oldest":
      return sorted.sort((a, b) => tileTime(a) - tileTime(b));
    case "az":
      return sorted.sort((a, b) => tileName(a).localeCompare(tileName(b)));
    case "za":
      return sorted.sort((a, b) => tileName(b).localeCompare(tileName(a)));
    default: {
      const exhaustive: never = sort;
      return exhaustive;
    }
  }
}

/**
 * Compose the grid for the current view.
 * - All tab: ungrouped projects + one tile per album (projects inside an album
 *   are represented by their album tile).
 * - Albums tab: album tiles only.
 * - Album drill-in: the album's member projects.
 * Search matches project titles / album names; sort applies to the result.
 * An album's timestamp is its latest member activity (or its creation time).
 */
export function buildTiles(input: {
  projects: ProjectSummary[];
  albums: AlbumSummary[];
  tab: "all" | "albums";
  openAlbumId: string | null;
  sort: HomeSort;
  query: string;
}): HomeTile[] {
  const { projects, albums, tab, openAlbumId, sort, query } = input;

  if (openAlbumId) {
    const members = projects.filter((p) => p.albumId === openAlbumId && matchesQuery(p.title, query));
    return sortTiles(
      members.map((project) => ({ kind: "project", project })),
      sort,
    );
  }

  const albumIds = new Set(albums.map((a) => a.id));
  const albumTiles: HomeTile[] = albums.map((album) => {
    // Newest members first so the 2x2 cover shows the freshest thumbnails.
    const members = sortTiles(
      projects
        .filter((p) => p.albumId === album.id)
        .map((project) => ({ kind: "project" as const, project })),
      "newest",
    ).map((t) => (t as Extract<HomeTile, { kind: "project" }>).project);
    const updatedAt =
      members
        .map((m) => m.updatedAt)
        .filter(Boolean)
        .sort()
        .pop() ?? album.createdAt;
    return { kind: "album", album, members, updatedAt };
  });

  const tiles: HomeTile[] =
    tab === "albums"
      ? albumTiles
      : [
          ...projects
            // Projects pointing at a deleted/unknown album are treated as ungrouped.
            .filter((p) => !p.albumId || !albumIds.has(p.albumId))
            .map((project) => ({ kind: "project" as const, project })),
          ...albumTiles,
        ];

  return sortTiles(
    tiles.filter((t) => matchesQuery(tileName(t), query)),
    sort,
  );
}

export function relativeTime(iso?: string): string | null {
  if (!iso) return null;
  const ms = Date.now() - new Date(iso).getTime();
  if (!Number.isFinite(ms) || ms < 0) return null;
  const min = Math.floor(ms / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min} min ago`;
  const hours = Math.floor(min / 60);
  if (hours < 24) return `${hours} hour${hours === 1 ? "" : "s"} ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} day${days === 1 ? "" : "s"} ago`;
  const months = Math.floor(days / 30);
  return `${months} month${months === 1 ? "" : "s"} ago`;
}
