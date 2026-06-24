import { type MouseEvent, useRef, useState } from "react";
import { durationSeconds, type Edl, type Track } from "@reel/edl";
import { useEditor } from "../store";

const GUTTER = 96;
const PX_PER_SEC = 60;
const MIN_DUR = 0.2;

type DragMode = "move" | "left" | "right";
interface Preview {
  start: number;
  end?: number;
  in?: number;
  out?: number;
}
interface DragState {
  clipId: string;
  trackType: Track["type"];
  preview: Preview;
}

export function Timeline(): JSX.Element {
  const edl = useEditor((s) => s.edl);
  const currentFrame = useEditor((s) => s.currentFrame);
  const seek = useEditor((s) => s.seek);
  const selectedClipId = useEditor((s) => s.selectedClipId);
  const select = useEditor((s) => s.select);
  const updateEdl = useEditor((s) => s.updateEdl);
  const [drag, setDrag] = useState<DragState | null>(null);
  const dragging = useRef(false);

  if (!edl) return <section className="timeline" />;

  const fps = edl.format.fps;
  const dur = Math.max(durationSeconds(edl), 6);
  const currentSec = currentFrame / fps;
  const lanePx = dur * PX_PER_SEC;

  const scrub = (e: MouseEvent<HTMLDivElement>) => {
    if (dragging.current) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - GUTTER;
    const sec = Math.min(dur, Math.max(0, x / PX_PER_SEC));
    seek(Math.round(sec * fps));
  };

  const startDrag = (
    e: MouseEvent<HTMLDivElement>,
    clip: AnyClip,
    track: Track,
    mode: DragMode,
  ) => {
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

    const onMove = (ev: globalThis.MouseEvent) => {
      const dSec = (ev.clientX - startX) / PX_PER_SEC;
      preview = computePreview(track.type, mode, orig, dSec, assetDur);
      setDrag({ clipId: clip.id, trackType: track.type, preview });
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      commit(updateEdl, clip.id, track.type, preview);
      setDrag(null);
      // defer clearing so the trailing click doesn't scrub
      setTimeout(() => (dragging.current = false), 0);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const ticks: number[] = [];
  for (let s = 0; s <= Math.ceil(dur); s++) ticks.push(s);

  return (
    <section className="timeline">
      <div className="timeline-toolbar">
        <span className="tl-label">Timeline</span>
        <span className="tl-time">
          {currentSec.toFixed(2)}s <span className="muted">/ {dur.toFixed(1)}s</span>
        </span>
      </div>
      <div className="timeline-scroll">
        <div className="timeline-content" style={{ width: GUTTER + lanePx }} onMouseDown={scrub}>
          <div className="ruler">
            <div className="ruler-gutter" />
            <div className="ruler-ticks" style={{ width: lanePx }}>
              {ticks.map((s) => (
                <div key={s} className="tick" style={{ left: s * PX_PER_SEC }}>
                  <span>{s}s</span>
                </div>
              ))}
            </div>
          </div>

          {edl.tracks.map((track) => (
            <div key={track.id} className={`track track-${track.type}`}>
              <div className="track-label">
                <span className={`track-dot ${track.type}`} />
                {track.type}
              </div>
              <div className="track-lane">
                {clipsOf(track).map((clip) => {
                  const geom = geomFor(track.type, clip, drag);
                  const selected = selectedClipId === clip.id;
                  const movable = track.type !== "caption";
                  return (
                    <div
                      key={clip.id}
                      className={`clip ${selected ? "selected" : ""}`}
                      style={{ left: geom.start * PX_PER_SEC, width: Math.max(10, geom.dur * PX_PER_SEC) }}
                      onMouseDown={(e) => movable && startDrag(e, clip, track, "move")}
                      title={labelOf(track.type, clip)}
                    >
                      {movable && (
                        <div
                          className="clip-handle left"
                          onMouseDown={(e) => startDrag(e, clip, track, "left")}
                        />
                      )}
                      <span className="clip-label">{labelOf(track.type, clip)}</span>
                      {movable && (
                        <div
                          className="clip-handle right"
                          onMouseDown={(e) => startDrag(e, clip, track, "right")}
                        />
                      )}
                    </div>
                  );
                })}
                {isEmpty(track) && <div className="lane-empty">{emptyHint(track.type)}</div>}
              </div>
            </div>
          ))}

          <div className="playhead" style={{ left: GUTTER + currentSec * PX_PER_SEC }}>
            <div className="playhead-head" />
          </div>
        </div>
      </div>
    </section>
  );
}

// ---- clip helpers ----
interface MediaLike {
  id: string;
  start: number;
  in: number;
  out: number;
  assetId: string;
}
interface TextLike {
  id: string;
  start: number;
  end: number;
  text: string;
}
type AnyClip = (MediaLike | TextLike) & { id: string; start: number };

function clipsOf(track: Track): AnyClip[] {
  if (track.type === "caption") return [];
  return track.clips as AnyClip[];
}

function labelOf(type: Track["type"], clip: AnyClip): string {
  if (type === "text") return (clip as TextLike).text;
  return (clip as MediaLike).assetId;
}

function assetDurationFor(edl: Edl, clip: AnyClip): number | undefined {
  const assetId = (clip as MediaLike).assetId;
  if (!assetId) return undefined;
  return edl.assets.find((a) => a.id === assetId)?.durationSec;
}

function geomFor(
  type: Track["type"],
  clip: AnyClip,
  drag: DragState | null,
): { start: number; dur: number } {
  const p = drag && drag.clipId === clip.id ? drag.preview : null;
  if (type === "text") {
    const start = p?.start ?? clip.start;
    const end = p?.end ?? (clip as TextLike).end;
    return { start, dur: Math.max(MIN_DUR, end - start) };
  }
  const start = p?.start ?? clip.start;
  const inP = p?.in ?? (clip as MediaLike).in;
  const outP = p?.out ?? (clip as MediaLike).out;
  return { start, dur: Math.max(MIN_DUR, outP - inP) };
}

function computePreview(
  type: Track["type"],
  mode: DragMode,
  orig: Preview,
  dSec: number,
  assetDur: number | undefined,
): Preview {
  if (type === "text") {
    const end = orig.end ?? orig.start + 1;
    if (mode === "move") {
      const start = Math.max(0, orig.start + dSec);
      return { start, end: end + (start - orig.start) };
    }
    if (mode === "left") {
      return { start: clamp(orig.start + dSec, 0, end - MIN_DUR), end };
    }
    return { start: orig.start, end: Math.max(orig.start + MIN_DUR, end + dSec) };
  }

  const inV = orig.in ?? 0;
  const outV = orig.out ?? 1;
  if (mode === "move") {
    return { start: Math.max(0, orig.start + dSec), in: inV, out: outV };
  }
  if (mode === "left") {
    const newIn = clamp(inV + dSec, 0, outV - MIN_DUR);
    return { start: Math.max(0, orig.start + (newIn - inV)), in: newIn, out: outV };
  }
  const maxOut = assetDur ?? Number.POSITIVE_INFINITY;
  return { start: orig.start, in: inV, out: clamp(outV + dSec, inV + MIN_DUR, maxOut) };
}

function commit(
  updateEdl: (fn: (edl: Edl) => void) => void,
  id: string,
  type: Track["type"],
  preview: Preview,
): void {
  updateEdl((d) => {
    for (const track of d.tracks) {
      if (track.type === "caption") continue;
      const clip = track.clips.find((c) => c.id === id);
      if (!clip) continue;
      clip.start = round(preview.start);
      if (track.type === "text" && preview.end != null) {
        (clip as TextLike).end = round(preview.end);
      } else if (track.type !== "text") {
        if (preview.in != null) (clip as MediaLike).in = round(preview.in);
        if (preview.out != null) (clip as MediaLike).out = round(preview.out);
      }
      return;
    }
  });
}

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));
const round = (n: number) => Math.round(n * 100) / 100;

function isEmpty(track: Track): boolean {
  if (track.type === "caption") return !track.source && (track.words?.length ?? 0) === 0;
  return track.clips.length === 0;
}

function emptyHint(type: Track["type"]): string {
  switch (type) {
    case "video":
      return "Drop video clips here";
    case "audio":
      return "Add music or voiceover";
    case "caption":
      return "Captions generate from audio";
    default:
      return "";
  }
}
