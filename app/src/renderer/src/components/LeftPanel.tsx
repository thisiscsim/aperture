import { type DragEvent, useEffect, useRef, useState } from "react";
import { durationSeconds } from "@reel/edl";
import { useEditor } from "../store";
import { addAssets, addAudioClip } from "../lib/edl-edit";
import type { ImportedAsset } from "../../../preload";

export function LeftPanel(): JSX.Element {
  const edl = useEditor((s) => s.edl);
  const slug = useEditor((s) => s.slug);
  const promptText = useEditor((s) => s.promptText);
  const setPromptText = useEditor((s) => s.setPromptText);
  const updateEdl = useEditor((s) => s.updateEdl);
  const saveNow = useEditor((s) => s.saveNow);
  const reloadProject = useEditor((s) => s.reloadProject);

  const [busy, setBusy] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const clipInput = useRef<HTMLInputElement>(null);
  // Debounced save to prompt.md. Must be declared before any early return so the
  // hook order stays stable across renders (edl goes null -> set on load).
  const promptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  if (!edl) return <aside className="panel left" />;
  const dur = durationSeconds(edl);

  const onPrompt = (text: string) => {
    setPromptText(text);
    if (!slug) return;
    if (promptTimer.current) clearTimeout(promptTimer.current);
    promptTimer.current = setTimeout(() => void window.api?.savePrompt(slug, text), 400);
  };

  const pathsFrom = (files: FileList | File[]): string[] =>
    Array.from(files)
      .map((f) => {
        try {
          return window.api.getPathForFile(f);
        } catch {
          return "";
        }
      })
      .filter(Boolean);

  const importClips = async (files: FileList | File[]) => {
    if (!slug) return;
    const paths = pathsFrom(files);
    if (paths.length === 0) return;
    setBusy("Importing clips…");
    try {
      const res = await window.api.importAssets(slug, paths);
      if (res.ok && res.assets.length) updateEdl((d) => addAssets(d, res.assets));
    } finally {
      setBusy(null);
    }
  };

  const onDrop = (e: DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setDragOver(false);
    if (e.dataTransfer.files.length) void importClips(e.dataTransfer.files);
  };

  return (
    <aside className="panel left">
      <div className="section">
        <div className="section-h">Project</div>
        <div className="kv">
          <span>Format</span>
          <span>
            {edl.format.width}&times;{edl.format.height}
          </span>
        </div>
        <div className="kv">
          <span>Frame rate</span>
          <span>{edl.format.fps} fps</span>
        </div>
        <div className="kv">
          <span>Duration</span>
          <span>{dur.toFixed(1)}s</span>
        </div>
      </div>

      <div className="section">
        <div className="section-h">Prompt</div>
        <textarea
          className="input prompt-input"
          value={promptText}
          placeholder="Describe the video you want: vibe, beats, hook, length, captions, music…"
          onChange={(e) => onPrompt(e.target.value)}
        />
      </div>

      <div className="section">
        <div className="section-h">Clips</div>
        <div
          className={`dropzone ${dragOver ? "drag" : ""}`}
          onClick={() => clipInput.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setDragOver(true);
          }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
        >
          <div className="dropzone-title">{busy ?? "Drop clips or click to add"}</div>
          <div className="dropzone-sub">MP4, MOV, WebM, images</div>
        </div>
        <input
          ref={clipInput}
          type="file"
          accept="video/*,image/*"
          multiple
          hidden
          onChange={(e) => {
            if (e.target.files) void importClips(e.target.files);
            e.target.value = "";
          }}
        />
        {edl.assets.filter((a) => a.kind !== "audio").length > 0 && (
          <ul className="asset-list mt">
            {edl.assets
              .filter((a) => a.kind !== "audio")
              .map((a) => (
                <li key={a.id}>
                  <span className={`asset-kind ${a.kind}`}>{a.kind}</span>
                  <span className="asset-name">{a.src.replace(/^assets\//, "")}</span>
                </li>
              ))}
          </ul>
        )}
      </div>

      <AudioSection
        onAddMusic={(asset) => updateEdl((d) => {
          addAssets(d, [asset]);
          addAudioClip(d, asset.id, "music", asset.durationSec);
        })}
        onAddVoiceover={async (asset) => {
          updateEdl((d) => {
            addAssets(d, [asset]);
            addAudioClip(d, asset.id, "voiceover", asset.durationSec);
          });
          await saveNow();
          setBusy("Transcribing voiceover…");
          try {
            await window.api.transcribeProject(slug!);
            reloadProject();
          } finally {
            setBusy(null);
          }
        }}
        setBusy={setBusy}
      />
    </aside>
  );
}

function AudioSection({
  onAddMusic,
  onAddVoiceover,
  setBusy,
}: {
  onAddMusic: (asset: ImportedAsset) => void;
  onAddVoiceover: (asset: ImportedAsset) => void | Promise<void>;
  setBusy: (s: string | null) => void;
}): JSX.Element {
  const slug = useEditor((s) => s.slug);
  const [bundled, setBundled] = useState<string[]>([]);
  const musicInput = useRef<HTMLInputElement>(null);
  const voInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    window.api?.listBundledMusic().then(setBundled).catch(() => {});
  }, []);

  const path = (f: File): string => {
    try {
      return window.api.getPathForFile(f);
    } catch {
      return "";
    }
  };

  const addMusicFile = async (f: File) => {
    if (!slug) return;
    setBusy("Adding music…");
    try {
      const res = await window.api.importAssets(slug, [path(f)]);
      if (res.assets[0]) onAddMusic(res.assets[0]);
    } finally {
      setBusy(null);
    }
  };

  const addBundled = async (name: string) => {
    if (!slug || !name) return;
    setBusy("Adding music…");
    try {
      const res = await window.api.importBundledMusic(slug, name);
      if (res.assets[0]) onAddMusic(res.assets[0]);
    } finally {
      setBusy(null);
    }
  };

  const addVoiceoverFile = async (f: File) => {
    if (!slug) return;
    setBusy("Adding voiceover…");
    try {
      const res = await window.api.importAssets(slug, [path(f)]);
      if (res.assets[0]) await onAddVoiceover(res.assets[0]);
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="section">
      <div className="section-h">Audio</div>

      <div className="audio-row">
        <span className="audio-label">Music</span>
        <div className="audio-actions">
          {bundled.length > 0 && (
            <select
              className="input compact"
              defaultValue=""
              onChange={(e) => {
                void addBundled(e.target.value);
                e.target.value = "";
              }}
            >
              <option value="" disabled>
                Library…
              </option>
              {bundled.map((b) => (
                <option key={b} value={b}>
                  {b.replace(/\.[^.]+$/, "")}
                </option>
              ))}
            </select>
          )}
          <button className="btn compact" onClick={() => musicInput.current?.click()}>
            Upload
          </button>
        </div>
        <input
          ref={musicInput}
          type="file"
          accept="audio/*"
          hidden
          onChange={(e) => {
            if (e.target.files?.[0]) void addMusicFile(e.target.files[0]);
            e.target.value = "";
          }}
        />
      </div>

      <div className="audio-row">
        <span className="audio-label">Voiceover</span>
        <div className="audio-actions">
          <VoiceRecorder setBusy={setBusy} onAdd={onAddVoiceover} />
          <button className="btn compact" onClick={() => voInput.current?.click()}>
            Upload
          </button>
        </div>
        <input
          ref={voInput}
          type="file"
          accept="audio/*"
          hidden
          onChange={(e) => {
            if (e.target.files?.[0]) void addVoiceoverFile(e.target.files[0]);
            e.target.value = "";
          }}
        />
      </div>
      <p className="muted small">Adding a voiceover auto-generates word-level captions.</p>
    </div>
  );
}

function VoiceRecorder({
  setBusy,
  onAdd,
}: {
  setBusy: (s: string | null) => void;
  onAdd: (asset: ImportedAsset) => void | Promise<void>;
}): JSX.Element {
  const slug = useEditor((s) => s.slug);
  const [recording, setRecording] = useState(false);
  const recorder = useRef<MediaRecorder | null>(null);
  const chunks = useRef<Blob[]>([]);

  const start = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      chunks.current = [];
      mr.ondataavailable = (e) => e.data.size > 0 && chunks.current.push(e.data);
      mr.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks.current, { type: "audio/webm" });
        const buf = new Uint8Array(await blob.arrayBuffer());
        if (!slug) return;
        setBusy("Saving voiceover…");
        try {
          const res = await window.api.importAssetBuffer(slug, `voiceover-${Date.now()}.webm`, buf);
          if (res.assets[0]) await onAdd(res.assets[0]);
        } finally {
          setBusy(null);
        }
      };
      mr.start();
      recorder.current = mr;
      setRecording(true);
    } catch {
      setBusy("Mic unavailable");
      setTimeout(() => setBusy(null), 1500);
    }
  };

  const stop = () => {
    recorder.current?.stop();
    recorder.current = null;
    setRecording(false);
  };

  return (
    <button className={`btn compact ${recording ? "btn-rec" : ""}`} onClick={recording ? stop : start}>
      {recording ? "Stop" : "Record"}
    </button>
  );
}
