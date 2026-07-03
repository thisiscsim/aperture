import { type DragEvent, useEffect, useRef, useState } from "react";
import { useEditor } from "../store";
import { addAssets, addAudioClip } from "../lib/edl-edit";
import { ASSET_MIME } from "./Timeline";
import { Button, Icon } from "./ui";
import type { ImportedAsset } from "../../../preload";

/**
 * The editor's input rail (Figma V0): Prompt + Generate, Clips, Audio.
 * Uploaded audio becomes the music bed; in-app recordings become voiceovers
 * (with auto-transcribed captions). Roles become editable in the clip
 * inspector subflow.
 */
export function LeftRail(): JSX.Element {
  const edl = useEditor((s) => s.edl);
  const slug = useEditor((s) => s.slug);
  const promptText = useEditor((s) => s.promptText);
  const setPromptText = useEditor((s) => s.setPromptText);
  const updateEdl = useEditor((s) => s.updateEdl);
  const saveNow = useEditor((s) => s.saveNow);
  const reloadProject = useEditor((s) => s.reloadProject);
  const generating = useEditor((s) => s.generating);
  const setGenerating = useEditor((s) => s.setGenerating);
  const setNotice = useEditor((s) => s.setNotice);

  const [busy, setBusy] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [audioDragOver, setAudioDragOver] = useState(false);
  const [audioUrl, setAudioUrl] = useState("");
  const [urlBusy, setUrlBusy] = useState<string | null>(null);
  const [genMode, setGenMode] = useState<{ mode: "llm" | "baseline"; model: string }>({
    mode: "baseline",
    model: "gpt-5.5",
  });
  const clipInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const promptTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    window.api
      ?.generateMode()
      .then((m) => setGenMode({ mode: m.mode, model: m.model }))
      .catch(() => {});
  }, []);

  if (!edl) return <aside className="left-rail" />;

  const hasCut = edl.tracks.some((t) => t.type === "video" && t.clips.length > 0);

  const onPrompt = (text: string) => {
    setPromptText(text);
    if (!slug) return;
    if (promptTimer.current) clearTimeout(promptTimer.current);
    promptTimer.current = setTimeout(() => void window.api?.savePrompt(slug, text), 400);
  };

  const onGenerate = async () => {
    if (!slug || generating) return;
    setGenerating(true);
    setNotice(null);
    try {
      const res = await window.api.generateProject(slug);
      reloadProject();
      if (res.ok) {
        setNotice({
          kind: "info",
          text: genMode.mode === "llm" ? `Generated with ${genMode.model}.` : "Assembled a baseline cut.",
        });
      } else {
        setNotice({ kind: "error", text: `Generate failed: ${res.error ?? "unknown error"}` });
      }
    } catch (err) {
      setNotice({ kind: "error", text: `Generate failed: ${String(err)}` });
    } finally {
      setGenerating(false);
    }
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

  const importMusic = async (files: FileList | File[]) => {
    if (!slug) return;
    const paths = pathsFrom(files);
    if (paths.length === 0) return;
    setBusy("Adding audio…");
    try {
      const res = await window.api.importAssets(slug, paths);
      if (res.assets.length === 0) return;
      // One updateEdl call = one undo step for the whole batch.
      updateEdl((d) => {
        for (const asset of res.assets) {
          addAssets(d, [asset]);
          addAudioClip(d, asset.id, "music", asset.durationSec);
        }
      });
    } finally {
      setBusy(null);
    }
  };

  const importFromUrl = async () => {
    const url = audioUrl.trim();
    if (!slug || !url || urlBusy) return;
    setUrlBusy("Fetching…");
    const offPhase = window.api.onPhase("audiourl", (p) => setUrlBusy(`${p}…`));
    const offProgress = window.api.onProgress("audiourl", (pct) => setUrlBusy(`Fetching ${pct}%`));
    try {
      const res = await window.api.importAudioFromUrl(slug, url);
      if (res.ok && res.assets.length > 0) {
        updateEdl((d) => {
          for (const asset of res.assets) {
            addAssets(d, [asset]);
            addAudioClip(d, asset.id, "music", asset.durationSec);
          }
        });
        setAudioUrl("");
      } else {
        setNotice({ kind: "error", text: `Couldn't fetch audio: ${res.error ?? "unknown error"}` });
      }
    } catch (err) {
      setNotice({ kind: "error", text: `Couldn't fetch audio: ${String(err)}` });
    } finally {
      offPhase();
      offProgress();
      setUrlBusy(null);
    }
  };

  const addVoiceover = async (asset: ImportedAsset) => {
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
  };

  const clips = edl.assets.filter((a) => a.kind !== "audio");

  return (
    <aside className="left-rail">
      <div className="rail-section">
        <div className="rail-head">
          <Icon name="prompt" size={16} />
          Prompt
        </div>
        <div className="rail-body">
          <textarea
            className="rail-textarea"
            value={promptText}
            placeholder="Describe the video you want, the vibes, beats, hook, length, etc"
            onChange={(e) => onPrompt(e.target.value)}
          />
          <Button
            variant={hasCut ? "secondary" : "primary"}
            size="sm"
            icon={hasCut ? "arrow-rotate" : undefined}
            onClick={onGenerate}
            disabled={generating || clips.length === 0}
            title={
              genMode.mode === "llm"
                ? `Generate a cut with ${genMode.model} from your prompt + style`
                : "Assemble a baseline cut. Set OPENAI_API_KEY for AI generation."
            }
            style={{ width: "100%" }}
          >
            {generating ? "Generating…" : hasCut ? "Re-generate" : "Generate"}
          </Button>
        </div>
      </div>

      <div className="rail-section">
        <div className="rail-head">
          <Icon name="folder" size={16} />
          Clips
        </div>
        <div className="rail-body">
          <div
            className={`upload-area ${dragOver ? "drag" : ""}`}
            onClick={() => clipInput.current?.click()}
            onDragOver={(e: DragEvent<HTMLDivElement>) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={(e: DragEvent<HTMLDivElement>) => {
              e.preventDefault();
              setDragOver(false);
              if (e.dataTransfer.files.length) void importClips(e.dataTransfer.files);
            }}
          >
            <span className="upload-title">
              <Icon name="arrow-out-of-box" size={16} />
              Upload clips
            </span>
            <span className="upload-sub">{busy ?? "Drag and drop files here or click to upload"}</span>
            <span className="upload-formats">MP4, MOV, HEIC, WebM, JPEGs, PNGs</span>
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
          {clips.length > 0 && (
            <div className="clip-list">
              {clips.map((a) => (
                <div
                  key={a.id}
                  className="clip-row"
                  title={`${a.src} — drag onto the timeline`}
                  draggable
                  onDragStart={(e) =>
                    e.dataTransfer.setData(ASSET_MIME, JSON.stringify({ assetId: a.id, kind: a.kind }))
                  }
                >
                  <Icon name="multi-media" size={14} />
                  <span className="name">{a.src.replace(/^assets\//, "")}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="rail-section">
        <div className="rail-head">
          <Icon name="voice-high" size={16} />
          Audio
        </div>
        <div className="rail-body">
          <div
            className={`upload-area ${audioDragOver ? "drag" : ""}`}
            onClick={() => audioInput.current?.click()}
            onDragOver={(e: DragEvent<HTMLDivElement>) => {
              e.preventDefault();
              setAudioDragOver(true);
            }}
            onDragLeave={() => setAudioDragOver(false)}
            onDrop={(e: DragEvent<HTMLDivElement>) => {
              e.preventDefault();
              setAudioDragOver(false);
              if (e.dataTransfer.files.length) void importMusic(e.dataTransfer.files);
            }}
          >
            <span className="upload-title">
              <Icon name="arrow-out-of-box" size={16} />
              Upload audio
            </span>
            <span className="upload-sub">Drag and drop files here or click to upload</span>
            <span className="upload-formats">MP3, WAV, M4A, AAC, OGG</span>
          </div>
          <input
            ref={audioInput}
            type="file"
            accept="audio/*"
            multiple
            hidden
            onChange={(e) => {
              if (e.target.files) void importMusic(e.target.files);
              e.target.value = "";
            }}
          />
          <div className="url-row">
            <input
              className="url-input"
              type="text"
              placeholder="Paste a SoundCloud or audio URL"
              value={audioUrl}
              disabled={!!urlBusy}
              onChange={(e) => setAudioUrl(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && void importFromUrl()}
            />
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void importFromUrl()}
              disabled={!audioUrl.trim() || !!urlBusy}
              title="Fetch the track and add it as the music bed"
            >
              {urlBusy ? "Adding…" : "Add"}
            </Button>
          </div>
          {urlBusy && <span className="upload-sub">{urlBusy}</span>}
          <RecordButton setBusy={setBusy} onAdd={addVoiceover} />
          <div className="clip-list">
            {edl.assets
              .filter((a) => a.kind === "audio")
              .map((a) => (
                <div
                  key={a.id}
                  className="clip-row"
                  title={`${a.src} — drag onto an audio layer`}
                  draggable
                  onDragStart={(e) =>
                    e.dataTransfer.setData(ASSET_MIME, JSON.stringify({ assetId: a.id, kind: a.kind }))
                  }
                >
                  <Icon name="voice-high" size={14} />
                  <span className="name">{a.src.replace(/^assets\//, "")}</span>
                </div>
              ))}
          </div>
        </div>
      </div>
    </aside>
  );
}

function RecordButton({
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
    <Button
      variant="secondary"
      size="sm"
      icon="record"
      onClick={recording ? stop : start}
      style={recording ? { width: "100%", color: "#c0392b" } : { width: "100%" }}
      title="Record a voiceover — captions are transcribed automatically"
    >
      {recording ? "Stop recording" : "Record"}
    </Button>
  );
}
