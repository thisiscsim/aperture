import { type DragEvent, useEffect, useRef, useState } from "react";
import { useEditor } from "../store";
import { addAssets } from "../lib/edl-edit";
import {
  ASPECT_DIMENSIONS,
  DEFAULT_COMPOSER_SETTINGS,
  deriveTitle,
  formatClipDuration,
  type ComposerSettings,
} from "../lib/composer";
import { Composer, type ComposerReference } from "./composer/Composer";
import { Icon } from "./ui";
import splash1 from "../assets/splash/splash-1.jpg";
import splash2 from "../assets/splash/splash-2.jpg";
import splash3 from "../assets/splash/splash-3.jpg";
import splash4 from "../assets/splash/splash-4.jpg";

/**
 * Zero-state home (Figma "Home, Zero state" steps 1–3): the whole first-run
 * happy path on one surface — drop clips, describe the video, optionally
 * attach references — and submission scaffolds the project, imports
 * everything, and kicks off the first generation in the editor.
 */

interface StagedFile {
  id: string;
  path: string;
  name: string;
  previewUrl: string;
  isVideo: boolean;
  durationSec?: number;
}

const SPLASH = [
  { src: splash1, aspect: "450 / 300" },
  { src: splash2, aspect: "375 / 300" },
  { src: splash3, aspect: "204 / 300" },
  { src: splash4, aspect: "300 / 300" },
];

function stageFiles(list: FileList | File[]): StagedFile[] {
  // Snapshot synchronously: a FileList is LIVE and cleared when the caller
  // resets the input.
  const staged: StagedFile[] = [];
  for (const f of Array.from(list)) {
    try {
      const path = window.api.getPathForFile(f);
      if (!path) continue;
      staged.push({
        id: path,
        path,
        name: f.name,
        previewUrl: URL.createObjectURL(f),
        isVideo: f.type.startsWith("video/"),
      });
    } catch {
      // not a disk-backed file; skip
    }
  }
  return staged;
}

export function HomeZero({ onCreated }: { onCreated: () => void }): JSX.Element {
  const enterProject = useEditor((s) => s.enterProject);
  const pushNotice = useEditor((s) => s.pushNotice);
  const [clips, setClips] = useState<StagedFile[]>([]);
  const [refs, setRefs] = useState<StagedFile[]>([]);
  const [promptText, setPromptText] = useState("");
  const [settings, setSettings] = useState<ComposerSettings>(DEFAULT_COMPOSER_SETTINGS);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const clipInput = useRef<HTMLInputElement>(null);

  // Object URLs leak unless revoked; do it once on unmount for whatever is staged.
  const stagedRef = useRef<StagedFile[]>([]);
  stagedRef.current = [...clips, ...refs];
  useEffect(
    () => () => {
      for (const f of stagedRef.current) URL.revokeObjectURL(f.previewUrl);
    },
    [],
  );

  const addClips = (list: FileList | File[]) => {
    const staged = stageFiles(list);
    if (staged.length === 0) return;
    setClips((prev) => {
      const next = [...prev];
      for (const s of staged) {
        if (!next.some((c) => c.path === s.path)) next.push(s);
      }
      return next;
    });
  };

  const addReferences = (files: File[]) => {
    const staged = stageFiles(files);
    if (staged.length === 0) return;
    setRefs((prev) => {
      const next = [...prev];
      for (const s of staged) {
        if (!next.some((c) => c.path === s.path)) next.push(s);
      }
      return next;
    });
    // References auto-attach to the prompt as @mentions.
    setPromptText((prev) => {
      const mentions = staged.map((s) => `@${s.name}`).join(" ");
      return prev.trim() ? `${prev.trimEnd()} ${mentions}` : mentions;
    });
  };

  const submit = async () => {
    if (busy || !promptText.trim() || clips.length === 0) return;
    setBusy(true);
    try {
      const title = deriveTitle(promptText);
      const created = await window.api.createProject({ title, prompt: promptText });
      if (!created.ok || !created.slug) {
        pushNotice("error", `Couldn't create the project: ${created.error ?? "unknown error"}`);
        return;
      }
      const slug = created.slug;

      const imported = await window.api.importAssets(
        slug,
        clips.map((c) => c.path),
      );
      if (refs.length > 0) {
        await window.api.importReferences(
          slug,
          refs.map((r) => r.path),
        );
      }

      // Register clips in the fresh EDL and stamp the chosen output format.
      const proj = await window.api.loadProject(slug);
      if (!proj.ok || !proj.edl) {
        pushNotice("error", `Couldn't open the new project: ${proj.errors?.join(", ") ?? "unknown error"}`);
        return;
      }
      const dims = ASPECT_DIMENSIONS[settings.aspect];
      proj.edl.format.width = dims.width;
      proj.edl.format.height = dims.height;
      if (imported.ok && imported.assets.length > 0) addAssets(proj.edl, imported.assets);
      await window.api.saveEdl(slug, proj.edl);

      enterProject({
        edl: proj.edl,
        slug: proj.slug,
        dir: proj.dir,
        promptText: proj.promptText,
        meta: proj.meta,
      });
      onCreated();

      // First generation starts immediately; the editor's canvas loader takes
      // over. Runs through the store so it survives this component unmounting.
      // Composer settings beyond aspect (effort, duration, reference mode)
      // start flowing into the run when the session backend lands.
      const store = useEditor.getState();
      store.setGenerating(true);
      window.api
        .generateProject(slug)
        .then(async (res) => {
          await useEditor.getState().reloadProject();
          if (!res.ok) {
            useEditor.getState().pushNotice("error", `Generate failed: ${res.error ?? "unknown error"}`);
          }
        })
        .catch((err) => {
          useEditor.getState().pushNotice("error", `Generate failed: ${String(err)}`);
        })
        .finally(() => useEditor.getState().setGenerating(false));
    } finally {
      setBusy(false);
    }
  };

  const references: ComposerReference[] = refs.map((r) => ({
    id: r.id,
    name: r.name,
    thumb: r.previewUrl,
    duration: r.durationSec !== undefined ? formatClipDuration(r.durationSec) : undefined,
  }));

  return (
    <div className="home-zero">
      <div className="home-zero-body">
        <div className="home-zero-hero">
          <h1>Welcome to Aperture</h1>
          <p>
            Drop in your clips, add a reference, describe in natural language, let our creative agent assemble
            a first cut, refine to your needs and publish.
          </p>
        </div>

        {clips.length === 0 ? (
          <div
            className={`home-zero-upload ${dragOver ? "drag" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => clipInput.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && clipInput.current?.click()}
            onDragOver={(e: DragEvent<HTMLDivElement>) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e: DragEvent<HTMLDivElement>) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files.length) addClips(e.dataTransfer.files);
            }}
          >
            <span className="home-zero-upload-title">
              <Icon name="arrow-out-of-box" size={16} />
              Upload clips
            </span>
            <span className="home-zero-upload-sub">Drag and drop files here or click to upload</span>
            <span className="home-zero-upload-formats">MP4, MOV, HEIC, WebM, JPEGs, PNGs</span>
          </div>
        ) : (
          <div className="home-zero-clips">
            {clips.map((clip) => (
              <StagedClipThumb
                key={clip.id}
                clip={clip}
                onDuration={(sec) =>
                  setClips((prev) => prev.map((c) => (c.id === clip.id ? { ...c, durationSec: sec } : c)))
                }
                onRemove={() => {
                  URL.revokeObjectURL(clip.previewUrl);
                  setClips((prev) => prev.filter((c) => c.id !== clip.id));
                }}
              />
            ))}
            <button className="home-zero-clip-add" onClick={() => clipInput.current?.click()}>
              <Icon name="arrow-out-of-box" size={16} />
              Upload clips
            </button>
          </div>
        )}
        <input
          ref={clipInput}
          type="file"
          accept="video/*,image/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) addClips(e.target.files);
            e.target.value = "";
          }}
        />

        <Composer
          value={promptText}
          onValueChange={setPromptText}
          settings={settings}
          onSettingsChange={setSettings}
          references={references}
          onAddReferences={addReferences}
          onRemoveReference={(id) =>
            setRefs((prev) => {
              const target = prev.find((r) => r.id === id);
              if (target) URL.revokeObjectURL(target.previewUrl);
              return prev.filter((r) => r.id !== id);
            })
          }
          onSubmit={() => void submit()}
          busy={busy}
          canSubmit={promptText.trim().length > 0 && clips.length > 0}
          placeholder="Create a 45-second vertical video documenting…"
          showCritique={false}
        />
      </div>

      <div className="home-zero-splash" aria-hidden>
        <div className="home-zero-splash-row">
          {SPLASH.map((item) => (
            <div key={item.src} className="home-zero-splash-item" style={{ aspectRatio: item.aspect }}>
              <img src={item.src} alt="" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Staged clip preview: first frame for videos (plus a duration badge), plain img for stills. */
function StagedClipThumb({
  clip,
  onDuration,
  onRemove,
}: {
  clip: StagedFile;
  onDuration: (sec: number) => void;
  onRemove: () => void;
}): JSX.Element {
  return (
    <div className="home-zero-clip">
      {clip.isVideo ? (
        <video
          src={clip.previewUrl}
          muted
          playsInline
          preload="metadata"
          onLoadedMetadata={(e) => onDuration(e.currentTarget.duration)}
        />
      ) : (
        <img src={clip.previewUrl} alt={clip.name} />
      )}
      {clip.durationSec !== undefined && (
        <span className="home-zero-clip-duration">{formatClipDuration(clip.durationSec)}</span>
      )}
      <button className="home-zero-clip-remove" aria-label={`Remove ${clip.name}`} onClick={onRemove}>
        ×
      </button>
    </div>
  );
}
