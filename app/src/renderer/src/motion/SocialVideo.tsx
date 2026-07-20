import type { CSSProperties, FC } from "react";
import {
  AbsoluteFill,
  Audio,
  Img,
  interpolate,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import type { AudioTrack, CaptionTrack, Edl, TextClip, VideoClip, VideoTrack } from "@reel/edl";
import { getSpec, splitUnits, unitStyle } from "./animations";

/**
 * The single Remotion composition that interprets an EDL. Shared by the live
 * preview (@remotion/player) and export (@remotion/renderer).
 *
 * M5: data-driven text animations (animate-text adapter), scene transitions
 * (TransitionSeries), and word-level captions.
 */
export const SocialVideo: FC<{ edl: Edl; assetBaseUrl?: string; preview?: boolean }> = ({
  edl,
  assetBaseUrl,
  preview,
}) => {
  const base = edl.theme.palette[1] ?? "#171410";
  const accent = edl.theme.palette[2] ?? "#E8B04B";
  const captionTrack = edl.tracks.find((t): t is CaptionTrack => t.type === "caption");

  return (
    <AbsoluteFill style={{ backgroundColor: base, fontFamily: edl.theme.fontFamily }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(120% 80% at 50% 0%, ${hexToRgba(accent, 0.16)} 0%, transparent 45%), radial-gradient(120% 100% at 50% 100%, rgba(0,0,0,0.55) 0%, transparent 60%)`,
        }}
      />

      {/* All video tracks render in EDL order; later layers stack on top. */}
      {edl.tracks.map((track) =>
        track.type === "video" && track.clips.length > 0 ? (
          <VideoTrackView
            key={track.id}
            track={track}
            edl={edl}
            assetBaseUrl={assetBaseUrl}
            preview={preview}
          />
        ) : null,
      )}

      {edl.tracks.map((track) =>
        track.type === "text"
          ? track.clips.map((clip) => <TextClipView key={clip.id} clip={clip} edl={edl} />)
          : null,
      )}

      {edl.tracks.map((track) =>
        track.type === "audio" && track.clips.length > 0 ? (
          <AudioTrackView
            key={track.id}
            track={track}
            edl={edl}
            assetBaseUrl={assetBaseUrl}
            preview={preview}
          />
        ) : null,
      )}

      {captionTrack?.words && captionTrack.words.length > 0 && edl.theme.captionStyle !== "none" && (
        <CaptionView track={captionTrack} edl={edl} />
      )}
    </AbsoluteFill>
  );
};

// Each clip sits at its absolute EDL position; overlapping neighbors crossfade
// via opacity. This keeps the video on the same timeline as text/captions
// (no compression), so overlays stay in sync.
const VideoTrackView: FC<{ track: VideoTrack; edl: Edl; assetBaseUrl?: string; preview?: boolean }> = ({
  track,
  edl,
  assetBaseUrl,
  preview,
}) => {
  const { fps } = useVideoConfig();
  // Preview only: mount each clip's <video> ~2s early so it has loaded and
  // seeked before its sequence begins. Without this the Player hits its
  // buffering pause exactly when a transition overlap mounts the next clip —
  // the "freezes for half a second at every cut" bug. Export renders
  // frame-exactly and needs no premount.
  const premountFor = preview ? Math.round(2 * fps) : 0;
  return (
    <>
      {track.clips.map((clip) => {
        const from = Math.round(clip.start * fps);
        const durationInFrames = Math.max(1, Math.round((clip.out - clip.in) * fps));
        return (
          <Sequence key={clip.id} from={from} durationInFrames={durationInFrames} premountFor={premountFor}>
            <CrossfadeVideo
              clip={clip}
              edl={edl}
              assetBaseUrl={assetBaseUrl}
              durationInFrames={durationInFrames}
              preview={preview}
            />
          </Sequence>
        );
      })}
    </>
  );
};

const CrossfadeVideo: FC<{
  clip: VideoClip;
  edl: Edl;
  assetBaseUrl?: string;
  durationInFrames: number;
  preview?: boolean;
}> = ({ clip, edl, assetBaseUrl, durationInFrames, preview }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const asset = edl.assets.find((a) => a.id === clip.assetId);
  if (!asset) return null;
  // In the editor, prefer the lightweight proxy for smooth playback; export uses the original.
  const rel = preview && asset.proxySrc ? asset.proxySrc : asset.src;
  const src = assetBaseUrl ? `${assetBaseUrl}/${rel}` : staticFile(rel);

  const inF = clip.transitionIn ? Math.round(clip.transitionIn.duration * fps) : 0;
  const outF = clip.transitionOut ? Math.round(clip.transitionOut.duration * fps) : 0;

  let style: CSSProperties = {};
  if (inF > 0 && frame < inF) {
    const p = interpolate(frame, [0, inF], [0, 1], { extrapolateRight: "clamp" });
    style = enterStyle(clip.transitionIn?.preset ?? "fade", p);
  } else if (outF > 0 && frame > durationInFrames - outF) {
    const p = interpolate(frame, [durationInFrames - outF, durationInFrames], [0, 1], {
      extrapolateLeft: "clamp",
    });
    style = exitStyle(clip.transitionOut?.preset ?? "fade", p);
  }

  const grade = edl.theme.grade;
  const mediaStyle: CSSProperties = {
    width: "100%",
    height: "100%",
    objectFit: "cover",
    filter: gradeFilter(grade),
  };
  return (
    <AbsoluteFill style={style}>
      {asset.kind === "image" ? (
        <Img src={src} style={mediaStyle} />
      ) : (
        <OffthreadVideo
          src={src}
          trimBefore={Math.round(clip.in * fps)}
          trimAfter={Math.round(clip.out * fps)}
          volume={clip.volume ?? 1}
          style={mediaStyle}
        />
      )}
      {grade && grade.vignette > 0 && (
        <AbsoluteFill
          style={{
            background: `radial-gradient(120% 120% at 50% 50%, transparent 55%, rgba(0,0,0,${grade.vignette}) 100%)`,
          }}
        />
      )}
    </AbsoluteFill>
  );
};

// Light color grade as a CSS filter (no footage-transformation pipeline).
function gradeFilter(grade: Edl["theme"]["grade"]): string | undefined {
  if (!grade) return undefined;
  const parts: string[] = [];
  if (grade.brightness !== 1) parts.push(`brightness(${grade.brightness})`);
  if (grade.contrast !== 1) parts.push(`contrast(${grade.contrast})`);
  if (grade.saturation !== 1) parts.push(`saturate(${grade.saturation})`);
  if (grade.temperature) parts.push(`hue-rotate(${grade.temperature}deg)`);
  return parts.length ? parts.join(" ") : undefined;
}

// p goes 0 -> 1 as the clip enters.
function enterStyle(preset: string, p: number): CSSProperties {
  switch (preset) {
    case "slide":
      return { transform: `translateX(${(1 - p) * 100}%)` };
    case "wipe":
      return { clipPath: `inset(0 ${(1 - p) * 100}% 0 0)` };
    default:
      return { opacity: p };
  }
}

// p goes 0 -> 1 as the clip exits.
function exitStyle(preset: string, p: number): CSSProperties {
  switch (preset) {
    case "slide":
      return { transform: `translateX(${-p * 100}%)` };
    case "wipe":
      return { clipPath: `inset(0 0 0 ${p * 100}%)` };
    default:
      return { opacity: 1 - p };
  }
}

const AudioTrackView: FC<{ track: AudioTrack; edl: Edl; assetBaseUrl?: string; preview?: boolean }> = ({
  track,
  edl,
  assetBaseUrl,
  preview,
}) => {
  const { fps } = useVideoConfig();
  // Same preview premount as video: an audio clip starting mid-timeline
  // (voiceover, late music) would otherwise buffer-pause the Player on mount.
  const premountFor = preview ? Math.round(2 * fps) : 0;

  // Voiceover intervals (across all audio tracks) so music can duck under them.
  const voIntervals: [number, number][] = edl.tracks
    .filter((t): t is AudioTrack => t.type === "audio")
    .flatMap((t) => t.clips)
    .filter((c) => c.role === "voiceover")
    .map((c) => [c.start, c.start + (c.out - c.in)]);
  const DUCK = 0.28;

  return (
    <>
      {track.clips.map((clip) => {
        const asset = edl.assets.find((a) => a.id === clip.assetId);
        if (!asset) return null;
        const src = assetBaseUrl ? `${assetBaseUrl}/${asset.src}` : staticFile(asset.src);
        const from = Math.round(clip.start * fps);
        const durationInFrames = Math.max(1, Math.round((clip.out - clip.in) * fps));
        const base = Math.min(1, 10 ** ((clip.gain ?? 0) / 20));
        const shouldDuck = clip.role === "music" && clip.duckUnderVoice && voIntervals.length > 0;
        const volume = shouldDuck
          ? (f: number) => {
              const t = clip.start + f / fps;
              return voIntervals.some(([a, b]) => t >= a && t < b) ? base * DUCK : base;
            }
          : base;
        return (
          <Sequence key={clip.id} from={from} durationInFrames={durationInFrames} premountFor={premountFor}>
            <Audio
              src={src}
              trimBefore={Math.round(clip.in * fps)}
              trimAfter={Math.round(clip.out * fps)}
              volume={volume}
            />
          </Sequence>
        );
      })}
    </>
  );
};

const TextClipView: FC<{ clip: TextClip; edl: Edl }> = ({ clip, edl }) => {
  const { fps } = useVideoConfig();
  const from = Math.round(clip.start * fps);
  const durationInFrames = Math.max(1, Math.round((clip.end - clip.start) * fps));
  return (
    <Sequence from={from} durationInFrames={durationInFrames}>
      <AnimatedText clip={clip} edl={edl} />
    </Sequence>
  );
};

// Per-unit (character/word) animation creates one styled span per unit with
// per-frame style work. Past this length, fall back to whole-text animation so
// a huge text clip can't balloon the DOM.
const MAX_ANIMATED_UNITS = 400;

const AnimatedText: FC<{ clip: TextClip; edl: Edl }> = ({ clip, edl }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  let spec = getSpec(clip.anim?.name);
  if (spec.target !== "whole" && clip.text.length > MAX_ANIMATED_UNITS) {
    spec = { ...spec, target: "whole" };
  }
  const color = edl.theme.palette[0] ?? "#FAF6EE";
  const isTitle = clip.style === "title";
  const m = edl.theme.safeMargins;

  // theme.textAlignment places overlays within the safe area (AbsoluteFill is a
  // flex column: vertical = justifyContent, horizontal = alignItems).
  const align = edl.theme.textAlignment ?? { horizontal: "center", vertical: "center" };
  const V: Record<string, CSSProperties["justifyContent"]> = {
    top: "flex-start",
    center: "center",
    bottom: "flex-end",
  };
  const H: Record<string, CSSProperties["alignItems"]> = {
    left: "flex-start",
    center: "center",
    right: "flex-end",
  };
  const container: CSSProperties = {
    justifyContent: V[align.vertical] ?? "center",
    alignItems: H[align.horizontal] ?? "center",
    textAlign: align.horizontal as CSSProperties["textAlign"],
    paddingTop: m.top,
    paddingBottom: m.bottom,
    paddingLeft: m.left,
    paddingRight: m.right,
    // AbsoluteFill sets width/height 100%; without border-box the safe-margin
    // padding pushes the content box past the canvas edge and text escapes
    // the safe area.
    boxSizing: "border-box",
  };
  const textStyle: CSSProperties = {
    color,
    fontSize: isTitle ? 104 : 52,
    fontWeight: isTitle ? 600 : 500,
    letterSpacing: isTitle ? "-0.02em" : "0.01em",
    lineHeight: 1.12,
    maxWidth: "85%",
    // Flex items refuse to shrink below their content (min-width: auto), so
    // long words could overflow the safe area instead of wrapping.
    minWidth: 0,
    overflowWrap: "break-word",
    textShadow: "0 4px 40px rgba(0,0,0,0.5)",
  };

  if (spec.target === "whole") {
    return (
      <AbsoluteFill style={container}>
        <div style={{ ...textStyle, ...unitStyle(spec, frame, fps, 0) }}>{clip.text}</div>
      </AbsoluteFill>
    );
  }

  // Per-character: group characters by word (nowrap) so wrapping happens at
  // word boundaries, never mid-word.
  if (spec.target === "per-character") {
    let charIdx = 0;
    return (
      <AbsoluteFill style={container}>
        <div style={textStyle}>
          {clip.text.split(/(\s+)/).map((word, wi) =>
            /^\s+$/.test(word) ? (
              <span key={wi} style={{ whiteSpace: "pre" }}>
                {word}
              </span>
            ) : (
              <span key={wi} style={{ display: "inline-block", whiteSpace: "nowrap" }}>
                {[...word].map((ch, ci) => (
                  <span
                    key={ci}
                    style={{ display: "inline-block", ...unitStyle(spec, frame, fps, charIdx++) }}
                  >
                    {ch}
                  </span>
                ))}
              </span>
            ),
          )}
        </div>
      </AbsoluteFill>
    );
  }

  const isLine = spec.target === "per-line";
  const units = splitUnits(clip.text, spec.target);
  let unitIdx = 0;
  return (
    <AbsoluteFill style={container}>
      <div style={textStyle}>
        {units.map((u, i) => {
          const isSpace = /^\s+$/.test(u);
          if (spec.target === "per-word" && isSpace) {
            return (
              <span key={i} style={{ whiteSpace: "pre" }}>
                {u}
              </span>
            );
          }
          const style = unitStyle(spec, frame, fps, unitIdx++);
          return (
            <span key={i} style={{ display: isLine ? "block" : "inline-block", whiteSpace: "pre", ...style }}>
              {u}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

type CaptionWordT = NonNullable<CaptionTrack["words"]>[number];

// Word timings are sorted and non-overlapping, so binary-search the active word
// index instead of a linear scan — a caption track can hold up to 20k words and
// this runs every frame. Exported for unit testing.
export function activeWordIndexAt(words: CaptionWordT[], t: number): number {
  let lo = 0;
  let hi = words.length - 1;
  while (lo <= hi) {
    const mid = (lo + hi) >> 1;
    const w = words[mid];
    if (t < w.start) hi = mid - 1;
    else if (t >= w.end) lo = mid + 1;
    else return mid;
  }
  return -1;
}

/**
 * The line (phrase) of caption words the active word belongs to, plus the
 * active index within it. Lines break on a speech pause (gap > 0.6s) or a
 * length cap so `karaoke`/`block` styles read as a phrase, not the whole track.
 * Returns null when no word is active. Exported for unit testing.
 */
export function captionLineAt(
  words: CaptionWordT[],
  t: number,
): { line: CaptionWordT[]; activeIndex: number } | null {
  const active = activeWordIndexAt(words, t);
  if (active < 0) return null;
  const GAP = 0.6;
  const MAX = 7;
  let start = active;
  while (start > 0 && active - start < MAX - 1 && words[start].start - words[start - 1].end <= GAP) {
    start--;
  }
  let end = active;
  while (end < words.length - 1 && end - start < MAX - 1 && words[end + 1].start - words[end].end <= GAP) {
    end++;
  }
  return { line: words.slice(start, end + 1), activeIndex: active - start };
}

const CaptionView: FC<{ track: CaptionTrack; edl: Edl }> = ({ track, edl }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const words = track.words ?? [];
  const style = edl.theme.captionStyle;

  const color = edl.theme.palette[0] ?? "#FAF6EE";
  const accent = edl.theme.palette[2] ?? "#E8B04B";
  const m = edl.theme.safeMargins;

  // "word" shows only the currently-spoken word; "block"/"karaoke" show the
  // whole current phrase, with karaoke highlighting the active word.
  let content: JSX.Element | null = null;
  if (style === "word") {
    const idx = activeWordIndexAt(words, t);
    if (idx < 0) return null;
    content = <>{words[idx].text.toUpperCase()}</>;
  } else {
    const phrase = captionLineAt(words, t);
    if (!phrase) return null;
    content = (
      <>
        {phrase.line.map((w, i) => (
          <span
            key={i}
            style={{
              color: style === "karaoke" && i === phrase.activeIndex ? accent : color,
              marginRight: i < phrase.line.length - 1 ? "0.3em" : 0,
            }}
          >
            {w.text.toUpperCase()}
          </span>
        ))}
      </>
    );
  }

  return (
    <div
      style={{
        position: "absolute",
        left: m.left,
        right: m.right,
        bottom: Math.max(120, m.bottom * 0.8),
        textAlign: "center",
      }}
    >
      <span
        style={{
          display: "inline-block",
          background: "rgba(0,0,0,0.55)",
          color,
          padding: "10px 22px",
          borderRadius: 14,
          fontSize: 56,
          fontWeight: 700,
          letterSpacing: "-0.01em",
          boxShadow: `0 0 0 3px ${accent}`,
        }}
      >
        {content}
      </span>
    </div>
  );
};

// The palette allows any CSS color literal (rgb()/hsl()/names), but this only
// understands #hex. For a non-hex accent, fall back to a neutral tint instead
// of emitting `rgba(NaN, NaN, NaN, a)` (which the gradient would silently drop).
function hexToRgba(hex: string, alpha: number): string {
  const m = hex.replace("#", "");
  if (!/^([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(m)) return `rgba(232, 176, 75, ${alpha})`;
  const full =
    m.length === 3
      ? m
          .split("")
          .map((c) => c + c)
          .join("")
      : m;
  const n = Number.parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
