import { useCallback, useEffect, useRef, useState } from "react";
import type { StyleProfile } from "@reel/edl";
import { useEditor } from "../../store";
import { pathsFrom } from "../../lib/files";
import { Button, Icon } from "../ui";
import type { StyleSummary } from "../../../../preload";

/**
 * References tab: the project's reference videos (which seed aesthetic
 * learning) plus the distilled style guide. Uploads land in references/ and
 * are what the composer's @-mentions point at.
 */
export function ReferencesTab(): JSX.Element {
  const slug = useEditor((s) => s.slug);
  const [refs, setRefs] = useState<string[]>([]);
  const [styles, setStyles] = useState<StyleSummary[]>([]);
  const [profile, setProfile] = useState<StyleProfile | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [phase, setPhase] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const input = useRef<HTMLInputElement>(null);

  const refresh = useCallback(() => {
    if (!slug) return;
    window.api
      .listReferences(slug)
      .then(setRefs)
      .catch(() => {});
    window.api
      .listStyles()
      .then(setStyles)
      .catch(() => {});
    window.api
      .loadStyle(slug)
      .then((p) => setProfile(p ?? null))
      .catch(() => {});
  }, [slug]);

  useEffect(refresh, [refresh]);

  const upload = async (files: FileList | File[]) => {
    if (!slug) return;
    const paths = pathsFrom(files);
    if (paths.length === 0) return;
    setBusy("Importing…");
    try {
      await window.api.importReferences(slug, paths);
      refresh();
    } finally {
      setBusy(null);
    }
  };

  const learn = async () => {
    if (!slug || phase) return;
    setProgress(0);
    setPhase("starting");
    const offPhase = window.api.onPhase("style", setPhase);
    const offProgress = window.api.onProgress("style", setProgress);
    try {
      await window.api.learnStyle(slug);
      refresh();
    } finally {
      offPhase();
      offProgress();
      setPhase(null);
    }
  };

  return (
    <div className="panel-tab">
      <div
        className="panel-upload"
        role="button"
        tabIndex={0}
        onClick={() => input.current?.click()}
        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
      >
        <span className="panel-upload-title">
          <Icon name="arrow-out-of-box" size={16} />
          Upload references
        </span>
        <span className="panel-upload-sub">{busy ?? "Videos whose look the agent should learn"}</span>
      </div>
      <input
        ref={input}
        type="file"
        accept="video/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void upload(e.target.files);
          e.target.value = "";
        }}
      />

      {refs.length > 0 && (
        <div className="panel-grid">
          {refs.map((file) => (
            <div key={file} className="panel-cell" title={file}>
              {slug && <video src={`reel-asset://${slug}/references/${file}`} muted preload="metadata" />}
              <span className="panel-cell-name">{file}</span>
              <button
                className="panel-cell-remove"
                aria-label={`Remove ${file}`}
                onClick={async () => {
                  await window.api.removeReference(slug!, file);
                  refresh();
                }}
              >
                ×
              </button>
            </div>
          ))}
        </div>
      )}

      {refs.length === 0 && styles.length > 0 && (
        <p className="panel-hint">
          No project references yet — generation falls back to your library
          {styles.length === 1 ? ` "${styles[0].name}"` : ` (${styles.length} styles)`}.
        </p>
      )}

      <div className="panel-section">
        <span className="panel-section-title">Style guide</span>
        {profile?.styleGuide ? (
          <p className="panel-styleguide">{profile.styleGuide}</p>
        ) : (
          <p className="panel-hint">
            The agent distills a reusable style guide from these references on the first generation — or learn
            it now.
          </p>
        )}
        <Button variant="secondary" size="sm" onClick={() => void learn()} disabled={!!phase || !slug}>
          {phase ? `Learning… ${phase}` : profile?.styleGuide ? "Re-learn aesthetic" : "Learn aesthetic"}
        </Button>
        {phase && (
          <div className="panel-progress">
            <div className="panel-progress-fill" style={{ width: `${progress}%` }} />
          </div>
        )}
      </div>
    </div>
  );
}
