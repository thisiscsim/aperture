import { useCallback, useEffect, useRef, useState } from "react";
import type { StyleProfile } from "@reel/edl";
import { useEditor } from "../store";
import type { StyleSummary } from "../../../preload";

export function StylePanel(): JSX.Element {
  const slug = useEditor((s) => s.slug);
  const meta = useEditor((s) => s.meta);
  const updateEdl = useEditor((s) => s.updateEdl);

  const [styles, setStyles] = useState<StyleSummary[]>([]);
  const [activeId, setActiveId] = useState<string | undefined>(meta?.styleProfileId);
  const [activeProfile, setActiveProfile] = useState<StyleProfile | null>(null);
  const [localProfile, setLocalProfile] = useState<StyleProfile | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [phase, setPhase] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);

  const refresh = useCallback(() => {
    window.api?.listStyles().then(setStyles).catch(() => {});
    if (slug) {
      window.api?.loadMeta(slug).then((m) => setActiveId(m.styleProfileId)).catch(() => {});
      window.api?.loadStyle(slug).then(setLocalProfile).catch(() => {});
    }
  }, [slug]);

  useEffect(refresh, [refresh]);

  useEffect(() => {
    if (activeId && !localProfile) window.api?.getStyle(activeId).then(setActiveProfile).catch(() => {});
    else setActiveProfile(null);
  }, [activeId, localProfile]);

  const newStyle = async () => {
    const name = window.prompt("Name this style (e.g. 'My TikTok look')");
    if (!name?.trim()) return;
    const res = await window.api.createStyle(name.trim());
    if (res.ok && res.id) {
      await window.api.addStyleSources(res.id, "folder");
      refresh();
    }
  };

  const addSources = async (id: string, mode: "files" | "folder") => {
    setBusy(`Importing into ${id}…`);
    try {
      await window.api.addStyleSources(id, mode);
      refresh();
    } finally {
      setBusy(null);
    }
  };

  const analyze = async (id: string) => {
    if (phase) return;
    setProgress(0);
    setPhase("starting");
    const offPhase = window.api.onPhase("styles", setPhase);
    const offProgress = window.api.onProgress("styles", setProgress);
    try {
      await window.api.analyzeStyle(id);
      refresh();
      if (activeId === id) window.api.getStyle(id).then(setActiveProfile).catch(() => {});
    } finally {
      offPhase();
      offProgress();
      setPhase(null);
    }
  };

  const useForProject = async (id: string) => {
    if (!slug) return;
    await window.api.saveMeta(slug, { styleProfileId: id });
    setActiveId(id);
  };

  const removeStyle = async (id: string) => {
    if (!window.confirm("Delete this style and its reference videos?")) return;
    await window.api.deleteStyle(id);
    if (activeId === id) setActiveId(undefined);
    refresh();
  };

  const profile = localProfile ?? activeProfile;
  const activeLabel = localProfile
    ? "this project's own references"
    : activeId
      ? styles.find((s) => s.id === activeId)?.name ?? activeId
      : "none";

  return (
    <div className="pad">
      <div className="section-h">Style library</div>
      <p className="muted small">
        Build a reusable look from a whole collection of your past videos, then point any project at it.
      </p>

      <button className="btn btn-primary full mt" onClick={newStyle}>
        New style (choose a folder)
      </button>

      {styles.length > 0 && (
        <div className="style-list mt">
          {styles.map((s) => (
            <div key={s.id} className={`style-row ${activeId === s.id && !localProfile ? "active" : ""}`}>
              <div className="style-row-top">
                <span className="style-name">{s.name}</span>
                <span className="muted small">
                  {s.clips} clip{s.clips === 1 ? "" : "s"}
                  {s.analyzed ? " · analyzed" : " · not analyzed"}
                </span>
              </div>
              <div className="style-actions">
                <button className="btn compact" onClick={() => addSources(s.id, "files")} disabled={!!busy}>
                  + Files
                </button>
                <button className="btn compact" onClick={() => addSources(s.id, "folder")} disabled={!!busy}>
                  + Folder
                </button>
                <button className="btn compact" onClick={() => analyze(s.id)} disabled={!!phase || s.clips === 0}>
                  {phase ? "Analyzing…" : "Analyze"}
                </button>
                <button
                  className="btn compact"
                  onClick={() => useForProject(s.id)}
                  disabled={!slug || (activeId === s.id && !localProfile)}
                >
                  {activeId === s.id && !localProfile ? "In use" : "Use"}
                </button>
                <button className="btn compact" onClick={() => removeStyle(s.id)}>
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {phase && (
        <div className="bar lg mt">
          <div className="bar-fill" style={{ width: `${progress}%` }} />
        </div>
      )}
      {busy && <p className="muted small mt">{busy}</p>}

      <p className="muted small mt">
        Active style for this project: <strong>{activeLabel}</strong>
        {localProfile && " (per-project references override the library)"}
      </p>

      {profile && <ProfileView profile={profile} onApply={() => applyToTheme(profile, updateEdl)} />}

      <div className="section-h" style={{ marginTop: 22 }}>
        Or learn from this project&apos;s clips
      </div>
      <ProjectReferences onLearned={refresh} setBusy={setBusy} />
    </div>
  );
}

function ProfileView({ profile, onApply }: { profile: StyleProfile; onApply: () => void }): JSX.Element {
  return (
    <div className="critique">
      <div className="section-h">Style profile</div>
      {profile.palette.length > 0 && (
        <div className="swatches">
          {profile.palette.slice(0, 3).map((c, i) => (
            <span key={i} className="swatch">
              <span className="swatch-chip" style={{ background: c }} />
              <span>{c}</span>
            </span>
          ))}
        </div>
      )}
      <div className="kv mt">
        <span>Pacing</span>
        <span>{profile.pacing.cutsPer10s ?? "—"} cuts / 10s</span>
      </div>
      <div className="kv">
        <span>Energy</span>
        <span>{profile.energy != null ? `${Math.round(profile.energy * 100)}%` : "—"}</span>
      </div>
      <div className="kv">
        <span>Target length</span>
        <span>{profile.targetLengthSec ? `${profile.targetLengthSec}s` : "—"}</span>
      </div>
      {profile.styleGuide && <p className="prompt mt">{profile.styleGuide}</p>}
      <button className="btn full mt" onClick={onApply}>
        Apply look to this video
      </button>
    </div>
  );
}

function ProjectReferences({
  onLearned,
  setBusy,
}: {
  onLearned: () => void;
  setBusy: (s: string | null) => void;
}): JSX.Element {
  const slug = useEditor((s) => s.slug);
  const [refs, setRefs] = useState<string[]>([]);
  const [phase, setPhase] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const refInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (slug) window.api?.listReferences(slug).then(setRefs).catch(() => {});
  }, [slug]);

  const addRefs = async (files: FileList) => {
    if (!slug) return;
    const paths = Array.from(files)
      .map((f) => {
        try {
          return window.api.getPathForFile(f);
        } catch {
          return "";
        }
      })
      .filter(Boolean);
    const res = await window.api.importReferences(slug, paths);
    if (res.ok) setRefs((r) => Array.from(new Set([...r, ...res.files])));
  };

  const learn = async () => {
    if (!slug || phase) return;
    setProgress(0);
    setPhase("starting");
    const offPhase = window.api.onPhase("style", setPhase);
    const offProgress = window.api.onProgress("style", setProgress);
    try {
      await window.api.learnStyle(slug);
      onLearned();
    } finally {
      offPhase();
      offProgress();
      setPhase(null);
    }
  };

  return (
    <>
      <p className="muted small">A per-project override: learn from clips you drop just into this project.</p>
      <div className="dropzone mt" onClick={() => refInput.current?.click()}>
        <div className="dropzone-title">
          {refs.length === 0 ? "Add reference videos" : `${refs.length} reference${refs.length === 1 ? "" : "s"}`}
        </div>
        <div className="dropzone-sub">Click to add</div>
      </div>
      <input
        ref={refInput}
        type="file"
        accept="video/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void addRefs(e.target.files);
          e.target.value = "";
        }}
      />
      <button className="btn full mt" onClick={learn} disabled={!!phase || refs.length === 0}>
        {phase ? `Learning… ${phase}` : "Learn from these"}
      </button>
      {phase && (
        <div className="bar lg mt">
          <div className="bar-fill" style={{ width: `${progress}%` }} />
        </div>
      )}
    </>
  );
}

function applyToTheme(profile: StyleProfile, updateEdl: (fn: (edl: import("@reel/edl").Edl) => void) => void): void {
  updateEdl((d) => {
    if (profile.palette.length >= 1) d.theme.palette = profile.palette.slice(0, 3);
    if (profile.fontFamily) d.theme.fontFamily = profile.fontFamily;
    if (profile.captionStyle) d.theme.captionStyle = profile.captionStyle;
    if (profile.grade) d.theme.grade = profile.grade;
    d.theme.stylePreset = profile.id;
  });
}
