import { type DragEvent, useCallback, useEffect, useRef, useState } from "react";
import { useEditor } from "../store";
import { addAssets } from "../lib/edl-edit";
import { buildTiles, relativeTime, SORT_LABELS, type HomeSort } from "../lib/home";
import { SettingsButton } from "./SettingsModal";
import {
  AlbumCover,
  AlbumCoverCell,
  Button,
  Field,
  Icon,
  IconButton,
  Input,
  Menu,
  MenuItem,
  MenuSub,
  Modal,
  NewTile,
  TextArea,
  Tile,
  TileThumb,
} from "./ui";
import type { AlbumSummary, ProjectSummary } from "../../../preload";

const SORTS: HomeSort[] = ["newest", "oldest", "az", "za"];

export function Home(): JSX.Element {
  const projects = useEditor((s) => s.projects);
  const setProjects = useEditor((s) => s.setProjects);
  const openProject = useEditor((s) => s.openProject);
  const enterProject = useEditor((s) => s.enterProject);
  const [albums, setAlbums] = useState<AlbumSummary[]>([]);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"all" | "albums">("all");
  const [sort, setSort] = useState<HomeSort>("newest");
  const [query, setQuery] = useState("");
  const [openAlbumId, setOpenAlbumId] = useState<string | null>(null);
  /** Slug of the project awaiting a new album name (naming dialog open). */
  const [namingFor, setNamingFor] = useState<string | null>(null);

  const refresh = useCallback(() => {
    window.api
      ?.listProjects()
      .then((list) => setProjects(list))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
    window.api
      ?.listAlbums()
      .then(setAlbums)
      .catch(() => {});
  }, [setProjects]);

  useEffect(refresh, [refresh]);

  const openAlbum = openAlbumId ? (albums.find((a) => a.id === openAlbumId) ?? null) : null;
  const tiles = buildTiles({ projects, albums, tab, openAlbumId, sort, query });

  // Seamless navigation: load the project while Home is still showing and
  // switch views only once the data is in the store — no empty-editor flash.
  // If the disk read is genuinely slow (>250ms), fall back to the classic
  // switch-then-load path so the user still gets a loading state.
  const openSeamlessly = useCallback(
    async (slug: string) => {
      const timeout = new Promise<null>((resolve) => setTimeout(() => resolve(null), 250));
      try {
        const first = await Promise.race([window.api.loadProject(slug), timeout]);
        if (first?.ok && first.edl) {
          enterProject({
            edl: first.edl,
            slug: first.slug,
            dir: first.dir,
            promptText: first.promptText,
            meta: first.meta,
          });
          return;
        }
      } catch {
        // fall through to the classic path, which surfaces the load error
      }
      openProject(slug);
    },
    [enterProject, openProject],
  );

  return (
    <div className="home">
      <header className="home-header">
        <div className="brand">
          <Icon name="aperture-logomark" size={20} />
          <span className="home-wordmark">Aperture</span>
        </div>
        <div className="home-header-actions">
          <SettingsButton />
          <Button variant="primary" size="sm" icon="clapboard-wide" onClick={() => setCreating(true)}>
            New project
          </Button>
        </div>
      </header>

      <main className="home-content">
        <div className="home-hero">
          <h1>Welcome to Aperture</h1>
          <p>
            Drop in your clips, describe in natural language, let our creative agent assemble a first cut,
            refine to your needs and export to your socials.
          </p>
        </div>

        <div className="home-toolbar">
          {openAlbum ? (
            <Button variant="secondary" size="sm" onClick={() => setOpenAlbumId(null)}>
              Back
            </Button>
          ) : (
            <div className="home-tabs" role="tablist">
              <button
                role="tab"
                aria-selected={tab === "all"}
                className={`home-tab ${tab === "all" ? "active" : ""}`}
                onClick={() => setTab("all")}
              >
                All
              </button>
              <button
                role="tab"
                aria-selected={tab === "albums"}
                className={`home-tab ${tab === "albums" ? "active" : ""}`}
                onClick={() => setTab("albums")}
              >
                Albums
              </button>
            </div>
          )}
          <div className="home-toolbar-right">
            <SortMenu sort={sort} onChange={setSort} />
            <Input
              className="home-search"
              type="text"
              placeholder="Search..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
        </div>

        {loading ? (
          <p className="home-loading">Loading projects…</p>
        ) : tiles.length === 0 && tab === "albums" && !openAlbum && query.trim() === "" ? (
          <p className="home-empty">No albums yet</p>
        ) : (
          <div className="tile-grid">
            {tiles.map((tile) =>
              tile.kind === "project" ? (
                <ProjectTile
                  key={tile.project.slug}
                  project={tile.project}
                  albums={albums}
                  inAlbum={Boolean(openAlbumId)}
                  onOpen={() => void openSeamlessly(tile.project.slug)}
                  onChanged={refresh}
                  onNewAlbum={() => setNamingFor(tile.project.slug)}
                />
              ) : (
                <AlbumTile
                  key={tile.album.id}
                  album={tile.album}
                  members={tile.members}
                  updatedAt={tile.updatedAt}
                  onOpen={() => setOpenAlbumId(tile.album.id)}
                  onChanged={refresh}
                />
              ),
            )}
            {!openAlbum && tab === "all" && (
              <NewTile icon="clapboard-wide" onClick={() => setCreating(true)}>
                New project
              </NewTile>
            )}
          </div>
        )}
      </main>

      {creating && (
        <NewProjectModal
          onClose={() => setCreating(false)}
          onCreated={(slug) => {
            setCreating(false);
            refresh();
            openProject(slug);
          }}
        />
      )}
      {namingFor && (
        <NewAlbumDialog
          onClose={() => setNamingFor(null)}
          onCreate={async (name) => {
            const slug = namingFor;
            setNamingFor(null);
            const res = await window.api.createAlbum(name);
            if (res.ok && res.id && slug) {
              await window.api.setProjectAlbum(slug, res.id);
              refresh();
            }
          }}
        />
      )}
    </div>
  );
}

/** Name-an-album dialog — creating an album is always an explicit, named act. */
function NewAlbumDialog({
  onClose,
  onCreate,
}: {
  onClose: () => void;
  onCreate: (name: string) => void | Promise<void>;
}): JSX.Element {
  const [name, setName] = useState("");

  const create = () => {
    if (!name.trim()) return;
    void onCreate(name.trim());
  };

  return (
    <Modal
      title="New album"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={create} disabled={!name.trim()}>
            Create album
          </Button>
        </>
      }
    >
      <Field label="Name">
        <Input
          autoFocus
          value={name}
          placeholder="e.g. New York City"
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
        />
      </Field>
    </Modal>
  );
}

/** Rename dialog shared by projects and albums — same specs as the creation dialogs. */
function RenameDialog({
  title,
  label,
  initial,
  onClose,
  onSave,
}: {
  title: string;
  label: string;
  initial: string;
  onClose: () => void;
  onSave: (value: string) => void | Promise<void>;
}): JSX.Element {
  const [value, setValue] = useState(initial);

  const save = () => {
    if (!value.trim()) return;
    void onSave(value.trim());
  };

  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" onClick={save} disabled={!value.trim()}>
            Save
          </Button>
        </>
      }
    >
      <Field label={label}>
        <Input
          autoFocus
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
        />
      </Field>
    </Modal>
  );
}

/* ---------------- toolbar sort ---------------- */

function SortMenu({ sort, onChange }: { sort: HomeSort; onChange: (s: HomeSort) => void }): JSX.Element {
  return (
    <Menu
      className="sort-wrap"
      popClassName="sort-pop"
      trigger={(toggle) => (
        <button className="sort-btn" onClick={toggle}>
          {SORT_LABELS[sort]}
          <Icon name="chevron-top" size={16} style={{ transform: "rotate(180deg)" }} />
        </button>
      )}
    >
      {SORTS.map((s) => (
        <MenuItem key={s} onSelect={() => onChange(s)}>
          {SORT_LABELS[s]}
        </MenuItem>
      ))}
    </Menu>
  );
}

/* ---------------- tiles ---------------- */

function useThumb(slug: string): string | null {
  const [thumb, setThumb] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    window.api
      ?.projectThumbnail(slug)
      .then((url) => alive && setThumb(url))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [slug]);
  return thumb;
}

function ProjectTile({
  project,
  albums,
  inAlbum,
  onOpen,
  onChanged,
  onNewAlbum,
}: {
  project: ProjectSummary;
  albums: AlbumSummary[];
  inAlbum: boolean;
  onOpen: () => void;
  onChanged: () => void;
  onNewAlbum: () => void;
}): JSX.Element {
  const thumb = useThumb(project.slug);
  const [renaming, setRenaming] = useState(false);

  const meta = [`${project.durationSec.toFixed(1)}s`, relativeTime(project.updatedAt)]
    .filter(Boolean)
    .join(" ⋅ ");

  return (
    <Tile
      media={<TileThumb src={thumb} emptyLabel="No clips yet" />}
      title={project.title}
      meta={meta}
      onOpen={onOpen}
      actions={
        <Menu
          className="tile-menu"
          popClassName="tile-menu-pop"
          trigger={(toggle, open) => (
            <IconButton
              icon="ellipsis"
              size={12}
              className={`tile-menu-btn ${open ? "open" : ""}`}
              label={`Options for ${project.title}`}
              onClick={toggle}
            />
          )}
        >
          <MenuSub icon="move-folder" label="Move to album">
            <MenuItem icon="plus-large" onSelect={onNewAlbum}>
              New album
            </MenuItem>
            {albums.map((a) => (
              <AlbumMenuItem
                key={a.id}
                album={a}
                onPick={async () => {
                  await window.api.setProjectAlbum(project.slug, a.id);
                  onChanged();
                }}
              />
            ))}
          </MenuSub>
          <MenuItem icon="input-form" onSelect={() => setRenaming(true)}>
            Rename project
          </MenuItem>
          {inAlbum && (
            <MenuItem
              icon="move-folder"
              onSelect={async () => {
                await window.api.setProjectAlbum(project.slug, null);
                onChanged();
              }}
            >
              Remove from album
            </MenuItem>
          )}
          <MenuItem
            icon="trash-can"
            danger
            onSelect={async () => {
              if (!window.confirm(`Delete "${project.title}"? This permanently removes the project folder.`))
                return;
              const res = await window.api.deleteProject(project.slug);
              if (res.ok) onChanged();
              else
                useEditor
                  .getState()
                  .pushNotice("error", `Couldn't delete project: ${res.error ?? "unknown error"}`);
            }}
          >
            Delete project
          </MenuItem>
        </Menu>
      }
    >
      {renaming && (
        <RenameDialog
          title="Rename project"
          label="Title"
          initial={project.title}
          onClose={() => setRenaming(false)}
          onSave={async (title) => {
            setRenaming(false);
            if (title !== project.title) {
              await window.api.saveMeta(project.slug, { title });
              onChanged();
            }
          }}
        />
      )}
    </Tile>
  );
}

/** Album row in the move-to submenu: leading cover thumbnail + name. */
function AlbumMenuItem({
  album,
  onPick,
}: {
  album: AlbumSummary;
  onPick: () => void | Promise<void>;
}): JSX.Element {
  const projects = useEditor((s) => s.projects);
  const first = projects.find((p) => p.albumId === album.id);
  const thumb = useThumb(first?.slug ?? "");
  return (
    <MenuItem
      leading={
        first && thumb ? (
          <img className="menu-item-thumb" src={thumb} alt="" />
        ) : (
          <span className="menu-item-thumb menu-item-thumb-empty" />
        )
      }
      onSelect={onPick}
    >
      {album.name}
    </MenuItem>
  );
}

function AlbumTile({
  album,
  members,
  updatedAt,
  onOpen,
  onChanged,
}: {
  album: AlbumSummary;
  members: ProjectSummary[];
  updatedAt?: string;
  onOpen: () => void;
  onChanged: () => void;
}): JSX.Element {
  const [renaming, setRenaming] = useState(false);

  const meta = [`${members.length} item${members.length === 1 ? "" : "s"}`, relativeTime(updatedAt)]
    .filter(Boolean)
    .join(" ⋅ ");

  return (
    <Tile
      media={
        <AlbumCover
          cells={members.slice(0, 4).map((m) => (
            <MemberCoverCell key={m.slug} slug={m.slug} />
          ))}
        />
      }
      title={album.name}
      meta={meta}
      onOpen={onOpen}
      actions={
        <Menu
          className="tile-menu"
          popClassName="tile-menu-pop"
          trigger={(toggle, open) => (
            <IconButton
              icon="ellipsis"
              size={12}
              className={`tile-menu-btn ${open ? "open" : ""}`}
              label={`Options for ${album.name}`}
              onClick={toggle}
            />
          )}
        >
          <MenuItem icon="input-form" onSelect={() => setRenaming(true)}>
            Rename album
          </MenuItem>
          <MenuItem
            icon="trash-can"
            danger
            onSelect={async () => {
              if (!window.confirm(`Delete the album "${album.name}"? Its projects are kept and ungrouped.`))
                return;
              const res = await window.api.deleteAlbum(album.id);
              if (res.ok) onChanged();
              else
                useEditor
                  .getState()
                  .pushNotice("error", `Couldn't delete album: ${res.error ?? "unknown error"}`);
            }}
          >
            Delete album
          </MenuItem>
        </Menu>
      }
    >
      {renaming && (
        <RenameDialog
          title="Rename album"
          label="Name"
          initial={album.name}
          onClose={() => setRenaming(false)}
          onSave={async (name) => {
            setRenaming(false);
            if (name !== album.name) {
              await window.api.renameAlbum(album.id, name);
              onChanged();
            }
          }}
        />
      )}
    </Tile>
  );
}

/** Kit cover cell fed by the project's fetched thumbnail. */
function MemberCoverCell({ slug }: { slug: string }): JSX.Element {
  const thumb = useThumb(slug);
  return <AlbumCoverCell src={thumb} />;
}

interface StagedFile {
  path: string;
  name: string;
}

function NewProjectModal({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: (slug: string) => void;
}): JSX.Element {
  const [title, setTitle] = useState("");
  const [prompt, setPrompt] = useState("");
  const [files, setFiles] = useState<StagedFile[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);

  const stage = (list: FileList | File[]) => {
    // Snapshot synchronously: a FileList is LIVE, and the caller resets the
    // input right after this call — by the time React runs a deferred state
    // updater the list would already be empty.
    const picked: StagedFile[] = [];
    for (const f of Array.from(list)) {
      try {
        const path = window.api.getPathForFile(f);
        if (path) picked.push({ path, name: f.name });
      } catch {
        // not a disk-backed file; skip
      }
    }
    if (picked.length === 0) return;
    setFiles((prev) => {
      const next = [...prev];
      for (const p of picked) {
        if (!next.some((s) => s.path === p.path)) next.push(p);
      }
      return next;
    });
  };

  const create = async () => {
    if (!title.trim() || busy) return;
    setBusy("Creating project…");
    setError(null);
    try {
      const res = await window.api.createProject({ title, prompt });
      if (!res.ok || !res.slug) {
        setError(res.error ?? "Could not create project");
        return;
      }
      // Import the staged clips and register them in the fresh project's EDL
      // so the editor opens with everything already in place.
      if (files.length > 0) {
        setBusy(`Importing ${files.length} clip${files.length === 1 ? "" : "s"}…`);
        const imp = await window.api.importAssets(
          res.slug,
          files.map((f) => f.path),
        );
        if (imp.ok && imp.assets.length > 0) {
          const proj = await window.api.loadProject(res.slug);
          if (proj.ok && proj.edl) {
            addAssets(proj.edl, imp.assets);
            await window.api.saveEdl(res.slug, proj.edl);
          }
        }
      }
      onCreated(res.slug);
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Modal
      title="New project"
      onClose={onClose}
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={!!busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={create} disabled={!!busy || !title.trim()}>
            {busy ?? "Create"}
          </Button>
        </>
      }
    >
      <Field label="Title">
        <Input
          autoFocus
          value={title}
          placeholder="e.g. Day in the life of startup engineer"
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && create()}
        />
      </Field>
      <Field label="Clips">
        <div
          className={`upload-area ${dragOver ? "drag" : ""}`}
          style={{ height: 96 }}
          onClick={() => fileInput.current?.click()}
          onDragOver={(e: DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={(e: DragEvent<HTMLDivElement>) => {
            e.preventDefault();
            setDragOver(false);
            if (e.dataTransfer.files.length) stage(e.dataTransfer.files);
          }}
        >
          <span className="upload-title">
            <Icon name="arrow-out-of-box" size={16} />
            Upload clips
          </span>
          <span className="upload-sub">Drag and drop files here or click to upload</span>
          <span className="upload-formats">MP4, MOV, HEIC, WebM, JPEGs, PNGs</span>
        </div>
        <input
          ref={fileInput}
          type="file"
          accept="video/*,image/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) stage(e.target.files);
            e.target.value = "";
          }}
        />
        {files.length > 0 && (
          <div className="clip-list clip-list-capped" style={{ marginTop: 6 }}>
            {files.map((f) => (
              <div key={f.path} className="clip-row" title={f.path}>
                <Icon name="multi-media" size={14} />
                <span className="name">{f.name}</span>
                <button
                  className="clip-row-remove"
                  title="Remove"
                  aria-label={`Remove ${f.name}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setFiles((prev) => prev.filter((s) => s.path !== f.path));
                  }}
                >
                  <Icon name="trash-can" size={12} />
                </button>
              </div>
            ))}
          </div>
        )}
      </Field>
      <Field label="What do you want to make?">
        <TextArea
          rows={4}
          value={prompt}
          placeholder="Describe the vibe, beats, hook, length, and any music or captions you want."
          onChange={(e) => setPrompt(e.target.value)}
        />
      </Field>
      {error && <p className="ui-form-error">{error}</p>}
    </Modal>
  );
}
