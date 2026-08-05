import { type DragEvent, useRef, useState } from "react";
import { useEditor } from "../../store";
import { addAssets, addAudioClip } from "../../lib/edl-edit";
import { ASSET_MIME } from "../../lib/timeline-geometry";
import { pathsFrom } from "../../lib/files";
import { Icon, Menu, MenuHeader, MenuItem, MenuSection } from "../ui";

/**
 * Assets tab: everything imported into the project — clips (draggable onto
 * the timeline) and audio. Upload here replaces the old left rail's Clips +
 * Audio sections.
 */
export function AssetsTab(): JSX.Element {
  const slug = useEditor((s) => s.slug);
  const edl = useEditor((s) => s.edl);
  const updateEdl = useEditor((s) => s.updateEdl);
  const pushNotice = useEditor((s) => s.pushNotice);
  const [busy, setBusy] = useState<string | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const clipInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);

  if (!edl) return <div />;

  const clips = edl.assets.filter((a) => a.kind !== "audio");
  const audio = edl.assets.filter((a) => a.kind === "audio");

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

  const importAudioUrl = async () => {
    if (!slug) return;
    const url = window.prompt("Paste a SoundCloud or direct audio URL");
    if (!url?.trim()) return;
    setBusy("Fetching audio…");
    const offPhase = window.api.onPhase("audiourl", (p) => setBusy(`${p}…`));
    try {
      const res = await window.api.importAudioFromUrl(slug, url.trim());
      if (res.ok && res.assets.length > 0) {
        updateEdl((d) => {
          for (const asset of res.assets) {
            addAssets(d, [asset]);
            addAudioClip(d, asset.id, "music", asset.durationSec);
          }
        });
      } else {
        pushNotice("error", `Couldn't fetch audio: ${res.error ?? "unknown error"}`);
      }
    } catch (err) {
      pushNotice("error", `Couldn't fetch audio: ${String(err)}`);
    } finally {
      offPhase();
      setBusy(null);
    }
  };

  return (
    <div className="panel-tab">
      <div
        className={`panel-upload ${dragOver ? "drag" : ""}`}
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
          if (e.dataTransfer.files.length) void importClips(e.dataTransfer.files);
        }}
      >
        <span className="panel-upload-title">
          <Icon name="arrow-out-of-box" size={16} />
          Upload clips
        </span>
        <span className="panel-upload-sub">{busy ?? "Drag and drop here or click to upload"}</span>
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
        <div className="panel-grid">
          {clips.map((a) => (
            <div
              key={a.id}
              className="panel-cell"
              title={`${a.src} — drag onto the timeline`}
              draggable
              onDragStart={(e) =>
                e.dataTransfer.setData(ASSET_MIME, JSON.stringify({ assetId: a.id, kind: a.kind }))
              }
            >
              {slug &&
                (a.kind === "image" ? (
                  <img src={`reel-asset://${slug}/${a.src}`} alt="" />
                ) : (
                  <video src={`reel-asset://${slug}/${a.proxySrc ?? a.src}`} muted preload="metadata" />
                ))}
              <span className="panel-cell-name">{a.src.replace(/^assets\//, "")}</span>
            </div>
          ))}
        </div>
      )}

      <div className="panel-section">
        <div className="panel-section-row">
          <span className="panel-section-title">Audio</span>
          <Menu
            popClassName="panel-add-pop"
            trigger={(toggle) => (
              <button className="panel-add-btn" onClick={toggle} disabled={!!busy}>
                <Icon name="plus-large" size={14} />
                Add
              </button>
            )}
          >
            <MenuSection>
              <MenuHeader>Add audio</MenuHeader>
              <MenuItem icon="arrow-out-of-box" onSelect={() => audioInput.current?.click()}>
                Upload file…
              </MenuItem>
              <MenuItem icon="multi-media" onSelect={() => void importAudioUrl()}>
                From URL…
              </MenuItem>
            </MenuSection>
          </Menu>
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
        {audio.length === 0 ? (
          <p className="panel-hint">No audio yet — add a music bed, or record a voiceover in Settings.</p>
        ) : (
          <div className="panel-list">
            {audio.map((a) => (
              <div
                key={a.id}
                className="panel-row"
                title={`${a.src} — drag onto an audio layer`}
                draggable
                onDragStart={(e) =>
                  e.dataTransfer.setData(ASSET_MIME, JSON.stringify({ assetId: a.id, kind: a.kind }))
                }
              >
                <Icon name="voice-high" size={14} />
                <span className="panel-row-name">{a.src.replace(/^assets\//, "")}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
