import { type MouseEvent, type ReactNode, useRef, useState } from "react";
import { useDragDropMonitor, useDroppable } from "@dnd-kit/react";
import { durationSeconds, MAX_TIMELINE_SEC, type Asset, type Track } from "@reel/edl";
import { useEditor } from "../store";
import { addAssets, addTrack, renameTrack } from "../lib/edl-edit";
import { pathsFrom } from "../lib/files";
import {
  assetDurationFor,
  clipsOf,
  commit,
  computePreview,
  type DragMode,
  type DragState,
  emptyHint,
  geomFor,
  LABEL_W,
  labelOf,
  type LaneTrack,
  type AnyClip,
  type MediaLike,
  placeAudioOnTrack,
  type Preview,
  PX_PER_SEC,
  round,
  type TextLike,
} from "../lib/timeline-geometry";
import { Icon, IconButton, Menu, MenuItem, type IconName } from "./ui";

const ZOOM_MIN = 0.4;
const ZOOM_MAX = 3;

export function Timeline(): JSX.Element {
  const edl = useEditor((s) => s.edl);
  const slug = useEditor((s) => s.slug);
  const seek = useEditor((s) => s.seek);
  const selectedClipId = useEditor((s) => s.selectedClipId);
  const select = useEditor((s) => s.select);
  const updateEdl = useEditor((s) => s.updateEdl);
  const playing = useEditor((s) => s.playing);
  const muted = useEditor((s) => s.muted);
  const playerCtl = useEditor((s) => s.playerCtl);
  const toggleMuted = useEditor((s) => s.toggleMuted);
  const canUndo = useEditor((s) => s.edlPast.length > 0);
  const canRedo = useEditor((s) => s.edlFuture.length > 0);
  const undoEdl = useEditor((s) => s.undoEdl);
  const redoEdl = useEditor((s) => s.redoEdl);

  const [drag, setDrag] = useState<DragState | null>(null);
  const [ghost, setGhost] = useState<{ trackId: string; start: number; dur: number } | null>(null);
  const [zoom, setZoom] = useState(1);
  const dragging = useRef(false);
  const videoInput = useRef<HTMLInputElement>(null);
  const audioInput = useRef<HTMLInputElement>(null);
  const pendingSec = useRef<{ trackId: string; sec: number } | null>(null);

  // NOTE: the Space play/pause shortcut lives in App.tsx (editor-level), not
  // here — this component unmounts in Cmd+\ focus mode.

  const pxPerSec = PX_PER_SEC * zoom;

  // Drops from the Assets tab (dnd-kit). The monitor registers once with a
  // stable callback; the ref keeps the handler's closures (zoom, store) fresh
  // across renders. Reads go through getState so a stale EDL can't be used.
  const dropAssetAt = (assetId: string, kind: string, trackId: string, sec: number) => {
    const s = useEditor.getState();
    const asset = s.edl?.assets.find((a) => a.id === assetId);
    if (!asset) return;
    const at = round(sec);
    if (kind === "video") {
      s.updateEdl((d) => {
        const t = d.tracks.find((x) => x.id === trackId);
        if (t?.type === "video") {
          t.clips.push({
            id: `c-${assetId}-${Date.now().toString(36)}`,
            assetId,
            start: at,
            in: 0,
            out: round(asset.durationSec ?? 3),
            volume: 1,
          });
        }
      });
    } else if (kind === "audio") {
      s.updateEdl((d) => placeAudioOnTrack(d, trackId, assetId, asset.durationSec, at));
    }
  };
  const dropRef = useRef(dropAssetAt);
  dropRef.current = dropAssetAt;
  const pxPerSecRef = useRef(pxPerSec);
  pxPerSecRef.current = pxPerSec;

  useDragDropMonitor({
    onDragEnd(event) {
      if (event.canceled) return;
      const { source, target, position } = event.operation;
      if (!source || !target) return;
      const data = source.data as { assetId?: string; kind?: string } | undefined;
      const lane = target.data as { trackId?: string } | undefined;
      if (!data?.assetId || !data.kind || !lane?.trackId) return;
      const rect = (target as { element?: Element }).element?.getBoundingClientRect();
      const sec = rect ? Math.max(0, (position.current.x - rect.left) / pxPerSecRef.current) : 0;
      dropRef.current(data.assetId, data.kind, lane.trackId, sec);
    },
  });

  if (!edl) return <section className="tl" />;

  const fps = edl.format.fps;
  // Clamp so a corrupt/hostile EDL can never drive the tick loop or lane width
  // unbounded (schema bounds timings too; this is belt-and-braces).
  const dur = Math.min(Math.max(durationSeconds(edl), 6), MAX_TIMELINE_SEC);
  const lanePx = dur * pxPerSec;
  const tracks = edl.tracks.filter((t): t is LaneTrack => t.type !== "caption");

  /* ---------- scrub / drag (unchanged mechanics) ---------- */

  const startScrub = (e: MouseEvent<HTMLDivElement>) => {
    if (dragging.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const seekAt = (clientX: number) => {
      const x = clientX - rect.left - LABEL_W;
      const sec = Math.min(dur, Math.max(0, x / pxPerSec));
      seek(Math.round(sec * fps));
    };
    seekAt(e.clientX);
    let raf = 0;
    let lastX = e.clientX;
    const onMove = (ev: globalThis.MouseEvent) => {
      lastX = ev.clientX;
      if (!raf) {
        raf = requestAnimationFrame(() => {
          raf = 0;
          seekAt(lastX);
        });
      }
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (raf) cancelAnimationFrame(raf);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const startDrag = (e: MouseEvent<HTMLDivElement>, clip: AnyClip, track: Track, mode: DragMode) => {
    e.stopPropagation();
    select(clip.id);
    dragging.current = true;
    const startX = e.clientX;
    const assetDur = assetDurationFor(edl, clip);
    const orig: Preview =
      track.type === "text"
        ? { start: clip.start, end: (clip as TextLike).end }
        : { start: clip.start, in: (clip as MediaLike).in, out: (clip as MediaLike).out };
    let preview = orig;

    let moved = false;
    // rAF-coalesce the preview state updates (matches the ruler scrub handler):
    // a raw mousemove stream drove one setDrag per event, re-rendering the lane
    // repeatedly per frame.
    let raf = 0;
    let lastX = e.clientX;
    const apply = () => {
      raf = 0;
      const dSec = (lastX - startX) / pxPerSec;
      if (dSec !== 0) moved = true;
      preview = computePreview(track.type, mode, orig, dSec, assetDur);
      setDrag({ clipId: clip.id, trackType: track.type, preview });
    };
    const onMove = (ev: globalThis.MouseEvent) => {
      lastX = ev.clientX;
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (raf) cancelAnimationFrame(raf);
      // A plain click (no movement) is just a selection — committing would
      // push an identical EDL onto the undo stack and schedule a disk write.
      if (moved) commit(updateEdl, clip.id, track.type, preview);
      setDrag(null);
      setTimeout(() => (dragging.current = false), 0);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  /* ---------- empty-lane + drop interactions ---------- */

  const laneSec = (e: { clientX: number; currentTarget: EventTarget & HTMLElement }): number => {
    const rect = e.currentTarget.getBoundingClientRect();
    return Math.max(0, (e.clientX - rect.left) / pxPerSec);
  };

  // Drag on an empty text lane sketches a new text clip.
  const sketchText = (e: MouseEvent<HTMLDivElement>, track: LaneTrack) => {
    if (dragging.current || e.button !== 0) return;
    if ((e.target as HTMLElement).closest(".tl-chip")) return;
    e.stopPropagation();
    dragging.current = true;
    const lane = e.currentTarget;
    const anchor = laneSec({ clientX: e.clientX, currentTarget: lane });
    let a = anchor;
    let b = anchor;
    setGhost({ trackId: track.id, start: anchor, dur: 0 });
    const onMove = (ev: globalThis.MouseEvent) => {
      const sec = laneSec({ clientX: ev.clientX, currentTarget: lane });
      a = Math.min(anchor, sec);
      b = Math.max(anchor, sec);
      setGhost({ trackId: track.id, start: a, dur: b - a });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      setGhost(null);
      // A plain click (no meaningful drag) just clears the selection.
      if ((b - a) * pxPerSec < 4) {
        select(null);
        setTimeout(() => (dragging.current = false), 0);
        return;
      }
      const start = round(a);
      const end = round(Math.max(b, a + 1));
      const id = `t-${Date.now().toString(36)}`;
      updateEdl((d) => {
        const target = d.tracks.find((t) => t.id === track.id);
        if (target?.type === "text") {
          target.clips.push({ id, start, end, text: "New text", style: "subtitle" });
        }
      });
      select(id);
      setTimeout(() => (dragging.current = false), 0);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  // Click on an empty media lane opens the right picker; the file lands there.
  // Clicking blank space in a populated lane just clears the selection.
  const pickForLane = (e: MouseEvent<HTMLDivElement>, track: LaneTrack) => {
    if (dragging.current) return;
    if ((e.target as HTMLElement).closest(".tl-chip")) return;
    if (track.clips.length > 0) {
      select(null);
      return;
    }
    pendingSec.current = { trackId: track.id, sec: round(laneSec(e)) };
    (track.type === "video" ? videoInput : audioInput).current?.click();
  };

  const importAt = async (files: FileList, kind: "video" | "audio") => {
    const target = pendingSec.current;
    pendingSec.current = null;
    if (!slug || !target) return;
    const paths = pathsFrom(files);
    if (paths.length === 0) return;
    const res = await window.api.importAssets(slug, paths);
    if (!res.ok || res.assets.length === 0) return;
    updateEdl((d) => {
      addAssets(d, res.assets);
      let at = target.sec;
      for (const asset of res.assets) {
        if (kind === "video" && asset.kind === "video") {
          const track = d.tracks.find((t) => t.id === target.trackId);
          if (track?.type === "video") {
            const len = asset.durationSec ?? 3;
            track.clips.push({
              id: `c-${asset.id}`,
              assetId: asset.id,
              start: round(at),
              in: 0,
              out: round(len),
              volume: 1,
            });
            at += len;
          }
        } else if (kind === "audio" && asset.kind === "audio") {
          placeAudioOnTrack(d, target.trackId, asset.id, asset.durationSec, at);
          at += asset.durationSec ?? 1;
        }
      }
    });
  };

  const ticks: number[] = [];
  for (let s = 0; s <= Math.ceil(dur); s += 2) ticks.push(s);

  const zoomBy = (factor: number) =>
    setZoom((z) => Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, Math.round(z * factor * 100) / 100)));

  return (
    <section className="tl">
      <div className="tl-bar">
        <div className="tl-bar-side">
          <IconButton
            icon="step-back"
            label="Undo (⌘Z)"
            onClick={undoEdl}
            disabled={!canUndo}
            className="tl-bar-btn"
          />
          <IconButton
            icon="step-forwards"
            label="Redo (⇧⌘Z)"
            onClick={redoEdl}
            disabled={!canRedo}
            className="tl-bar-btn"
          />
          <span className="tl-bar-divider" />
          <IconButton
            icon="volume-full"
            label={muted ? "Unmute" : "Mute"}
            onClick={toggleMuted}
            className="tl-bar-btn"
            style={muted ? { opacity: 0.35 } : undefined}
          />
        </div>
        <div className="tl-bar-center">
          <button
            className="ui-icon-btn tl-play"
            onClick={() => playerCtl?.toggle()}
            title={playing ? "Pause (Space)" : "Play (Space)"}
            aria-label={playing ? "Pause" : "Play"}
          >
            {playing ? <PauseGlyph /> : <Icon name="play" size={20} />}
          </button>
          <span className="tl-time">
            <TimeReadout fps={fps} dur={dur} />
          </span>
        </div>
        <div className="tl-bar-side tl-bar-right">
          <IconButton
            icon="zoom-in"
            label="Zoom in"
            onClick={() => zoomBy(1.25)}
            disabled={zoom >= ZOOM_MAX}
            className="tl-bar-btn"
          />
          <IconButton
            icon="zoom-out"
            label="Zoom out"
            onClick={() => zoomBy(1 / 1.25)}
            disabled={zoom <= ZOOM_MIN}
            className="tl-bar-btn"
          />
        </div>
      </div>

      <div className="tl-scroll">
        <div className="tl-content" style={{ width: LABEL_W + lanePx }}>
          <div className="tl-ruler" onMouseDown={startScrub}>
            <div className="tl-ruler-gutter" />
            <div className="tl-ruler-ticks" style={{ width: lanePx }}>
              {ticks.map((s) => (
                <div key={s} className="tl-tick" style={{ left: s * pxPerSec }}>
                  <span>{String(s).padStart(2, "0")}</span>
                </div>
              ))}
              {ticks.slice(0, -1).map((s) => (
                <span key={`d-${s}`} className="tl-tick-divider" style={{ left: (s + 1) * pxPerSec }} />
              ))}
            </div>
          </div>

          {tracks.map((track) => (
            <div key={track.id} className={`tl-row tl-row-${track.type}`}>
              <TrackGutter
                track={track}
                onRename={(name) => updateEdl((d) => renameTrack(d, track.id, name))}
                onDelete={
                  track.clips.length === 0 && tracks.length > 1
                    ? () => updateEdl((d) => (d.tracks = d.tracks.filter((t) => t.id !== track.id)))
                    : undefined
                }
              />
              <DroppableLane
                track={track}
                lanePx={lanePx}
                onMouseDown={(e) => {
                  if (track.type === "text") sketchText(e, track);
                }}
                onClick={(e) => {
                  if (track.type !== "text") pickForLane(e, track);
                }}
              >
                {clipsOf(track).map((clip) => {
                  const geom = geomFor(track.type, clip, drag);
                  const selected = selectedClipId === clip.id;
                  return (
                    <div
                      key={clip.id}
                      className={`tl-chip tl-chip-${track.type} ${selected ? "selected" : ""}`}
                      style={{ left: geom.start * pxPerSec, width: Math.max(18, geom.dur * pxPerSec) }}
                      onMouseDown={(e) => startDrag(e, clip, track, "move")}
                      role="button"
                      tabIndex={0}
                      aria-label={`${track.type} clip: ${labelOf(track.type, clip)}`}
                      aria-pressed={selected}
                      onKeyDown={(e) => {
                        // Keyboard users can at least select/deselect a clip
                        // (drag/trim stays pointer-driven).
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          select(clip.id);
                        } else if (e.key === "Escape") {
                          select(null);
                        }
                      }}
                      title={labelOf(track.type, clip)}
                    >
                      <div
                        className="tl-chip-handle left"
                        onMouseDown={(e) => startDrag(e, clip, track, "left")}
                      />
                      <ChipBody track={track} clip={clip} slug={slug} />
                      <div
                        className="tl-chip-handle right"
                        onMouseDown={(e) => startDrag(e, clip, track, "right")}
                      />
                    </div>
                  );
                })}
                {ghost && ghost.trackId === track.id && (
                  <div
                    className="tl-chip tl-chip-text ghost"
                    style={{ left: ghost.start * pxPerSec, width: Math.max(8, ghost.dur * pxPerSec) }}
                  />
                )}
                {track.clips.length === 0 && !ghost && (
                  <div className="tl-lane-hint">{emptyHint(track.type)}</div>
                )}
              </DroppableLane>
            </div>
          ))}

          <div className="tl-row tl-row-add">
            <div className="tl-row-gutter">
              <AddTrackButton onAdd={(type) => updateEdl((d) => addTrack(d, type, undefined))} />
            </div>
          </div>

          <Playhead fps={fps} pxPerSec={pxPerSec} />
        </div>
      </div>

      <input
        ref={videoInput}
        type="file"
        accept="video/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void importAt(e.target.files, "video");
          e.target.value = "";
        }}
      />
      <input
        ref={audioInput}
        type="file"
        accept="audio/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void importAt(e.target.files, "audio");
          e.target.value = "";
        }}
      />
    </section>
  );
}

/* ---------- droppable lane (dnd-kit target for Assets-tab drags) ---------- */

function DroppableLane({
  track,
  lanePx,
  onMouseDown,
  onClick,
  children,
}: {
  track: LaneTrack;
  lanePx: number;
  onMouseDown: (e: MouseEvent<HTMLDivElement>) => void;
  onClick: (e: MouseEvent<HTMLDivElement>) => void;
  children: ReactNode;
}): JSX.Element {
  const { ref, isDropTarget } = useDroppable({
    id: `lane-${track.id}`,
    // Type-based acceptance: video lanes take video assets, audio lanes take
    // audio; text lanes accept nothing (their clips are sketched, not dropped).
    accept: track.type === "video" ? ["video"] : track.type === "audio" ? ["audio"] : [],
    data: { trackId: track.id },
  });
  return (
    <div
      ref={ref}
      className={`tl-lane tl-lane-${track.type} ${isDropTarget ? "drop-target" : ""}`}
      style={{ width: lanePx }}
      onMouseDown={onMouseDown}
      onClick={onClick}
    >
      {children}
    </div>
  );
}

/* ---------- chip content per track type ---------- */

function ChipBody({
  track,
  clip,
  slug,
}: {
  track: LaneTrack;
  clip: AnyClip;
  slug: string | null;
}): JSX.Element {
  if (track.type === "video") {
    const edl = useEditor.getState().edl;
    const asset = edl?.assets.find((a) => a.id === (clip as MediaLike & { assetId?: string }).assetId);
    return <VideoChipMedia asset={asset} slug={slug} />;
  }
  if (track.type === "text") {
    return <span className="tl-chip-label">{labelOf(track.type, clip)}</span>;
  }
  // Audio: decorative waveform bars (real peaks are a follow-up); the label
  // stays for identification.
  return (
    <>
      <span className="tl-chip-wave" aria-hidden />
      <span className="tl-chip-label">{labelOf(track.type, clip)}</span>
    </>
  );
}

/** First-frame preview inside a video chip (proxy first when available). */
function VideoChipMedia({ asset, slug }: { asset: Asset | undefined; slug: string | null }): JSX.Element {
  if (!asset || !slug) return <span className="tl-chip-media tl-chip-media-empty" />;
  if (asset.kind === "image") {
    return <img className="tl-chip-media" src={`reel-asset://${slug}/${asset.src}`} alt="" />;
  }
  return (
    <video
      className="tl-chip-media"
      src={`reel-asset://${slug}/${asset.proxySrc ?? asset.src}`}
      muted
      playsInline
      preload="metadata"
    />
  );
}

// Leaf components that subscribe to currentFrame themselves, so playback (a
// per-frame store write at 30fps) re-renders only the playhead + time readout
// instead of the entire Timeline (every lane, chip, and tick).
function Playhead({ fps, pxPerSec }: { fps: number; pxPerSec: number }): JSX.Element {
  const currentSec = useEditor((s) => s.currentFrame) / fps;
  return (
    <div className="tl-playhead" style={{ left: LABEL_W + currentSec * pxPerSec }}>
      <div className="tl-playhead-head" />
    </div>
  );
}

function TimeReadout({ fps, dur }: { fps: number; dur: number }): JSX.Element {
  const currentSec = useEditor((s) => s.currentFrame) / fps;
  return (
    <>
      {currentSec.toFixed(2)}s <span className="muted">/ {dur.toFixed(1)}s</span>
    </>
  );
}

/* ---------- add-track button (the gutter's "+" row) ---------- */

function AddTrackButton({ onAdd }: { onAdd: (type: "video" | "text" | "audio") => void }): JSX.Element {
  const items: { type: "video" | "text" | "audio"; icon: IconName; label: string }[] = [
    { type: "video", icon: "video-2", label: "Video layer" },
    { type: "text", icon: "text-motion", label: "Text layer" },
    { type: "audio", icon: "voice-high", label: "Audio layer" },
  ];

  return (
    <Menu
      popClassName="tl-layer-menu"
      trigger={(toggle) => (
        <button className="tl-gutter-btn" onClick={toggle} title="Add layer" aria-label="Add layer">
          <Icon name="plus-medium" size={20} />
        </button>
      )}
    >
      {items.map((i) => (
        <MenuItem key={i.type} icon={i.icon} onSelect={() => onAdd(i.type)}>
          {i.label}
        </MenuItem>
      ))}
    </Menu>
  );
}

/* ---------- track gutter (icon per lane) ---------- */

function TrackGutter({
  track,
  onRename,
  onDelete,
}: {
  track: Track;
  onRename: (name: string) => void;
  onDelete?: () => void;
}): JSX.Element {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState("");

  const name = track.name ?? defaultName(track);

  const commitName = () => {
    setEditing(false);
    if (draft.trim() && draft.trim() !== name) onRename(draft.trim());
  };

  return (
    <div
      className="tl-row-gutter"
      title={`${name} — double-click to rename`}
      onDoubleClick={() => {
        setDraft(name);
        setEditing(true);
      }}
    >
      <span className="tl-gutter-btn" aria-label={name}>
        <Icon name={chipIcon(track.type)} size={20} />
      </span>
      {editing && (
        <input
          className="tl-rename"
          value={draft}
          autoFocus
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commitName}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitName();
            if (e.key === "Escape") setEditing(false);
          }}
        />
      )}
      {onDelete && !editing && (
        <button
          className="tl-row-delete"
          onClick={onDelete}
          title="Remove empty layer"
          aria-label="Remove layer"
        >
          <Icon name="trash-can" size={12} />
        </button>
      )}
    </div>
  );
}

function defaultName(track: Track): string {
  if (track.type === "video") return "Video";
  if (track.type === "text") return "Text";
  if (track.type === "audio") return track.id === "vo" ? "Voiceover" : "Music";
  return "Captions";
}

function chipIcon(type: Track["type"]): IconName {
  if (type === "video") return "video-2";
  if (type === "text") return "text-motion";
  return "voice-high";
}

function PauseGlyph(): JSX.Element {
  return (
    <svg width={20} height={20} viewBox="0 0 20 20" fill="none" aria-hidden>
      <rect x="4.5" y="3.5" width="4" height="13" rx="1.5" fill="currentColor" />
      <rect x="11.5" y="3.5" width="4" height="13" rx="1.5" fill="currentColor" />
    </svg>
  );
}
