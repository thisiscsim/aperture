import { useEffect, useRef, useState } from "react";
import type { StyleProfile } from "@reel/edl";
import { useEditor } from "../store";

export function StylePanel(): JSX.Element {
  const slug = useEditor((s) => s.slug);
  const updateEdl = useEditor((s) => s.updateEdl);
  const [refs, setRefs] = useState<string[]>([]);
  const [profile, setProfile] = useState<StyleProfile | null>(null);
  const [phase, setPhase] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const refInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!slug) return;
    window.api?.listReferences(slug).then(setRefs).catch(() => {});
    window.api?.loadStyle(slug).then(setProfile).catch(() => {});
  }, [slug]);

  const pathsFrom = (files: FileList): string[] =>
    Array.from(files)
      .map((f) => {
        try {
          return window.api.getPathForFile(f);
        } catch {
          return "";
        }
      })
      .filter(Boolean);

  const addRefs = async (files: FileList) => {
    if (!slug) return;
    const res = await window.api.importReferences(slug, pathsFrom(files));
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
      const p = await window.api.loadStyle(slug);
      setProfile(p);
    } finally {
      offPhase();
      offProgress();
      setPhase(null);
    }
  };

  const applyToVideo = () => {
    if (!profile) return;
    updateEdl((d) => {
      if (profile.palette.length >= 1) d.theme.palette = profile.palette.slice(0, 3);
      if (profile.fontFamily) d.theme.fontFamily = profile.fontFamily;
      if (profile.captionStyle) d.theme.captionStyle = profile.captionStyle;
      d.theme.stylePreset = profile.id;
    });
  };

  return (
    <div className="pad">
      <div className="section-h">Learn my aesthetic</div>
      <p className="muted small">
        Upload a few of your own past videos. Aperture studies their palette and pacing to build a reusable
        style profile that seeds generation.
      </p>

      <div className="dropzone mt" onClick={() => refInput.current?.click()}>
        <div className="dropzone-title">
          {refs.length === 0 ? "Add reference videos" : `${refs.length} reference${refs.length === 1 ? "" : "s"}`}
        </div>
        <div className="dropzone-sub">Your own past posts — click to add</div>
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

      <button className="btn btn-primary full mt" onClick={learn} disabled={!!phase || refs.length === 0}>
        {phase ? `Learning… ${phase}` : "Learn my style"}
      </button>
      {phase && (
        <div className="bar lg mt">
          <div className="bar-fill" style={{ width: `${progress}%` }} />
        </div>
      )}

      {profile && (
        <div className="critique">
          <div className="section-h">Style profile</div>
          <div className="swatches">
            {profile.palette.slice(0, 3).map((c, i) => (
              <span key={i} className="swatch">
                <span className="swatch-chip" style={{ background: c }} />
                <span>{c}</span>
              </span>
            ))}
          </div>
          <div className="kv mt">
            <span>Pacing</span>
            <span>{profile.pacing.cutsPer10s ?? "—"} cuts / 10s</span>
          </div>
          <div className="kv">
            <span>Avg shot</span>
            <span>{profile.pacing.avgShotSec ?? "—"}s</span>
          </div>
          <div className="kv">
            <span>Energy</span>
            <span>{profile.energy != null ? `${Math.round(profile.energy * 100)}%` : "—"}</span>
          </div>
          <div className="kv">
            <span>Target length</span>
            <span>{profile.targetLengthSec ? `${profile.targetLengthSec}s` : "—"}</span>
          </div>
          {profile.do.length > 0 && (
            <div className="fixes mt">
              <div className="section-h">Do</div>
              <ul>
                {profile.do.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}
          {profile.avoid.length > 0 && (
            <div className="fixes">
              <div className="section-h">Avoid</div>
              <ul>
                {profile.avoid.map((d, i) => (
                  <li key={i}>{d}</li>
                ))}
              </ul>
            </div>
          )}
          <button className="btn full mt" onClick={applyToVideo}>
            Apply to this video
          </button>
          <p className="muted small mt">
            For a richer profile (hook patterns, energy, do/avoid), run the <code>learn-aesthetic</code> skill — it
            reads the sampled frames and writes <code>style.json</code>.
          </p>
        </div>
      )}
    </div>
  );
}
