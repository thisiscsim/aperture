import { type DragEvent, useRef, useState } from "react";
import { useDragDropMonitor } from "@dnd-kit/react";
import { isSortable, useSortable } from "@dnd-kit/react/sortable";
import { SortableKeyboardPlugin } from "@dnd-kit/dom/sortable";
import type { Asset } from "@reel/edl";
import { useEditor } from "../../store";
import { addAssets, addAudioClip, reorderAssets } from "../../lib/edl-edit";
import { pathsFrom } from "../../lib/files";
import { Icon, Menu, MenuHeader, MenuItem, MenuSection } from "../ui";

/** Sortable groups; also the discriminator for the reorder-commit handler. */
const CLIP_GROUP = "panel-clips";
const AUDIO_GROUP = "panel-audio";

/**
 * Sortable plugins WITHOUT OptimisticSortingPlugin. The optimistic plugin
 * physically shuffles sibling DOM nodes whenever the pointer crosses another
 * cell — but the common gesture here is dragging a cell *out* of the grid
 * toward the timeline, which sweeps across siblings, and the plugin only
 * restores its DOM mutations on *canceled* drags (not on drops that land
 * elsewhere, like a lane). Without it, React state stays the single source of
 * order: reorders commit once, on drop.
 */
const PANEL_SORT_PLUGINS = [SortableKeyboardPlugin];

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

  // Commits panel reorders. Drops onto the timeline never reach this branch
  // (a lane isn't sortable), and the Timeline's own monitor ignores sortable
  // targets (no trackId) — the two dragend handlers are disjoint by
  // construction. Ids come from drag data and are re-resolved against the
  // freshest EDL inside updateEdl, so a mid-drag live reload can't misplace.
  useDragDropMonitor({
    onDragEnd(event) {
      if (event.canceled) return;
      const { source, target } = event.operation;
      if (!source || !target || !isSortable(source) || !isSortable(target)) return;
      if (source.group !== target.group) return;
      if (source.group !== CLIP_GROUP && source.group !== AUDIO_GROUP) return;
      const src = (source.data as { assetId?: string } | undefined)?.assetId;
      const tgt = (target.data as { assetId?: string } | undefined)?.assetId;
      if (!src || !tgt || src === tgt) return;
      const family = source.group === AUDIO_GROUP ? "audio" : "clip";
      useEditor.getState().updateEdl((d) => reorderAssets(d, family, src, tgt));
    },
  });

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
          {clips.map((a, i) => (
            <SortableClipCell key={a.id} asset={a} index={i} slug={slug} />
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
            {audio.map((a, i) => (
              <SortableAudioRow key={a.id} asset={a} index={i} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Sortable drag source: a clip cell. Reorders within the grid (drop on a
 * sibling) and doubles as the drag source the timeline's video lanes accept —
 * `type`/`data` are what the lane `accept` rules and drop handler read.
 */
function SortableClipCell({
  asset,
  index,
  slug,
}: {
  asset: Asset;
  index: number;
  slug: string | null;
}): JSX.Element {
  const { ref, isDragging, isDropTarget } = useSortable({
    id: `asset-${asset.id}`,
    index,
    group: CLIP_GROUP,
    type: asset.kind,
    accept: ["video", "image"],
    data: { assetId: asset.id, kind: asset.kind },
    plugins: PANEL_SORT_PLUGINS,
  });
  return (
    <div
      ref={ref}
      className={`panel-cell ${isDragging ? "dragging" : ""} ${isDropTarget ? "drop-target" : ""}`}
      title={`${asset.src} — drag onto the timeline, or over a sibling to reorder`}
    >
      {slug &&
        (asset.kind === "image" ? (
          <img src={`reel-asset://${slug}/${asset.src}`} alt="" />
        ) : (
          <video src={`reel-asset://${slug}/${asset.proxySrc ?? asset.src}`} muted preload="metadata" />
        ))}
      <span className="panel-cell-name">{asset.src.replace(/^assets\//, "")}</span>
    </div>
  );
}

/** Sortable drag source: an audio row; the timeline's audio lanes accept it. */
function SortableAudioRow({ asset, index }: { asset: Asset; index: number }): JSX.Element {
  const { ref, isDragging, isDropTarget } = useSortable({
    id: `asset-${asset.id}`,
    index,
    group: AUDIO_GROUP,
    type: asset.kind,
    accept: ["audio"],
    data: { assetId: asset.id, kind: asset.kind },
    plugins: PANEL_SORT_PLUGINS,
  });
  return (
    <div
      ref={ref}
      className={`panel-row ${isDragging ? "dragging" : ""} ${isDropTarget ? "drop-target" : ""}`}
      title={`${asset.src} — drag onto an audio layer, or over a sibling to reorder`}
    >
      <Icon name="voice-high" size={14} />
      <span className="panel-row-name">{asset.src.replace(/^assets\//, "")}</span>
    </div>
  );
}
