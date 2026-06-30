import { useEffect, useRef, useState } from "react";
import { useEditor } from "../store";
import { ThemeToggle } from "./ThemeToggle";
import type { ProjectSummary } from "../../../preload";

const PLATFORMS = [
  { value: "reels", label: "Instagram Reels" },
  { value: "tiktok", label: "TikTok" },
  { value: "shorts", label: "YouTube Shorts" },
];

export function Home(): JSX.Element {
  const projects = useEditor((s) => s.projects);
  const setProjects = useEditor((s) => s.setProjects);
  const openProject = useEditor((s) => s.openProject);
  const [creating, setCreating] = useState(false);
  const [loading, setLoading] = useState(true);

  const refresh = () => {
    window.api
      ?.listProjects()
      .then((list) => setProjects(list))
      .catch(() => setProjects([]))
      .finally(() => setLoading(false));
  };

  useEffect(refresh, [setProjects]);

  return (
    <div className="home">
      <header className="home-bar">
        <span className="logo">Aperture</span>
        <div className="home-bar-right">
          <ThemeToggle />
          <button className="btn btn-primary" onClick={() => setCreating(true)}>
            New project
          </button>
        </div>
      </header>

      <main className="home-body">
        <div className="home-head">
          <h1>Your projects</h1>
          <p className="muted">Turn raw clips and a prompt into a finished short — start a new one or pick up where you left off.</p>
        </div>

        {loading ? (
          <p className="muted">Loading projects…</p>
        ) : projects.length === 0 ? (
          <div className="home-empty">
            <div className="home-empty-title">No projects yet</div>
            <div className="muted small">Create your first project to upload clips and write a brief.</div>
            <button className="btn btn-primary mt" onClick={() => setCreating(true)}>
              New project
            </button>
          </div>
        ) : (
          <div className="project-grid">
            <button className="project-card new-card" onClick={() => setCreating(true)}>
              <div className="new-card-plus">+</div>
              <div>New project</div>
            </button>
            {projects.map((p) => (
              <ProjectCard
                key={p.slug}
                project={p}
                onOpen={() => openProject(p.slug)}
                onDeleted={refresh}
              />
            ))}
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
    </div>
  );
}

function ProjectCard({
  project,
  onOpen,
  onDeleted,
}: {
  project: ProjectSummary;
  onOpen: () => void;
  onDeleted: () => void;
}): JSX.Element {
  const [thumb, setThumb] = useState<string | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    window.api
      ?.projectThumbnail(project.slug)
      .then((url) => alive && setThumb(url))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [project.slug]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!menuRef.current?.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [menuOpen]);

  const onDelete = async () => {
    setMenuOpen(false);
    if (!window.confirm(`Delete "${project.title}"? This permanently removes the project folder.`)) return;
    const res = await window.api.deleteProject(project.slug);
    if (res.ok) onDeleted();
  };

  return (
    <div className="project-card" onClick={onOpen} role="button" tabIndex={0}>
      <div className="project-thumb">
        {thumb ? <img src={thumb} alt="" /> : <div className="project-thumb-empty">No clips yet</div>}
        <span className={`status-pill status-${project.status}`}>{project.status}</span>
        <div className="card-menu-wrap" ref={menuRef}>
          <button
            className="card-menu-btn"
            title="Project options"
            aria-label="Project options"
            onClick={(e) => {
              e.stopPropagation();
              setMenuOpen((v) => !v);
            }}
          >
            ⋯
          </button>
          {menuOpen && (
            <div className="card-menu">
              <button
                className="card-menu-item danger"
                onClick={(e) => {
                  e.stopPropagation();
                  void onDelete();
                }}
              >
                Delete project
              </button>
            </div>
          )}
        </div>
      </div>
      <div className="project-meta">
        <div className="project-title">{project.title}</div>
        <div className="project-sub muted">
          {platformLabel(project.platform)} · {project.durationSec.toFixed(1)}s · {project.assetCount} asset
          {project.assetCount === 1 ? "" : "s"}
        </div>
      </div>
    </div>
  );
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
  const [platform, setPlatform] = useState("reels");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const create = async () => {
    if (!title.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      const res = await window.api.createProject({ title, prompt, platform });
      if (res.ok && res.slug) onCreated(res.slug);
      else setError(res.error ?? "Could not create project");
    } catch (err) {
      setError(String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">New project</div>
        <label className="field">
          <span className="field-label">Title</span>
          <input
            className="input"
            autoFocus
            value={title}
            placeholder="e.g. Tokyo street food"
            onChange={(e) => setTitle(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">What do you want to make?</span>
          <textarea
            className="input"
            rows={4}
            value={prompt}
            placeholder="Describe the vibe, beats, hook, length, and any music or captions you want."
            onChange={(e) => setPrompt(e.target.value)}
          />
        </label>
        <label className="field">
          <span className="field-label">Platform</span>
          <select className="input" value={platform} onChange={(e) => setPlatform(e.target.value)}>
            {PLATFORMS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
          </select>
        </label>
        {error && <p className="small" style={{ color: "var(--accent)" }}>{error}</p>}
        <div className="modal-actions">
          <button className="btn" onClick={onClose} disabled={busy}>
            Cancel
          </button>
          <button className="btn btn-primary" onClick={create} disabled={busy || !title.trim()}>
            {busy ? "Creating…" : "Create"}
          </button>
        </div>
      </div>
    </div>
  );
}

function platformLabel(value: string): string {
  return PLATFORMS.find((p) => p.value === value)?.label ?? value;
}
