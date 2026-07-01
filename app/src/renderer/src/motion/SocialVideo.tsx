import type { CSSProperties, FC } from "react";
import {
  AbsoluteFill,
  Audio,
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
  const videoTrack = edl.tracks.find((t): t is VideoTrack => t.type === "video");
  const captionTrack = edl.tracks.find((t): t is CaptionTrack => t.type === "caption");

  return (
    <AbsoluteFill style={{ backgroundColor: base, fontFamily: edl.theme.fontFamily }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(120% 80% at 50% 0%, ${hexToRgba(accent, 0.16)} 0%, transparent 45%), radial-gradient(120% 100% at 50% 100%, rgba(0,0,0,0.55) 0%, transparent 60%)`,
        }}
      />

      {videoTrack && videoTrack.clips.length > 0 && (
        <VideoTrackView track={videoTrack} edl={edl} assetBaseUrl={assetBaseUrl} preview={preview} />
      )}

      {edl.tracks.map((track) =>
        track.type === "text"
          ? track.clips.map((clip) => <TextClipView key={clip.id} clip={clip} edl={edl} />)
          : null,
      )}

      {edl.tracks.map((track) =>
        track.type === "audio" && track.clips.length > 0 ? (
          <AudioTrackView key={track.id} track={track} edl={edl} assetBaseUrl={assetBaseUrl} />
        ) : null,
      )}

      {captionTrack?.words && captionTrack.words.length > 0 && edl.theme.captionStyle !== "none" && (
        <CaptionView track={captionTrack} edl={edl} />
      )}

      <ProgressBar color={accent} margin={edl.theme.safeMargins.left} bottom={edl.theme.safeMargins.bottom} />
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
  return (
    <>
      {track.clips.map((clip) => {
        const from = Math.round(clip.start * fps);
        const durationInFrames = Math.max(1, Math.round((clip.out - clip.in) * fps));
        return (
          <Sequence key={clip.id} from={from} durationInFrames={durationInFrames}>
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
  return (
    <AbsoluteFill style={style}>
      <OffthreadVideo
        src={src}
        trimBefore={Math.round(clip.in * fps)}
        trimAfter={Math.round(clip.out * fps)}
        volume={clip.volume ?? 1}
        style={{ width: "100%", height: "100%", objectFit: "cover", filter: gradeFilter(grade) }}
      />
      {grade && grade.vignette > 0 && (
        <AbsoluteFill
          style={{
            background: `radial-gradient(120% 120% at 50% 50%, transparent 55%, rgba(0,0,0,${grade.vignette}) 100%)`,
          }}
        />
      )}
    </AbsoluteFill>
  );
}

// Light color grade as a CSS filter (no footage-transformation pipeline).
function gradeFilter(grade: Edl["theme"]["grade"]): string | undefined {
  if (!grade) return undefined;
  const parts: string[] = [];
  if (grade.brightness !== 1) parts.push(`brightness(${grade.brightness})`);
  if (grade.contrast !== 1) parts.push(`contrast(${grade.contrast})`);
  if (grade.saturation !== 1) parts.push(`saturate(${grade.saturation})`);
  if (grade.temperature) parts.push(`hue-rotate(${grade.temperature}deg)`);
  return parts.length ? parts.join(" ") : undefined;
};

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

const AudioTrackView: FC<{ track: AudioTrack; edl: Edl; assetBaseUrl?: string }> = ({
  track,
  edl,
  assetBaseUrl,
}) => {
  const { fps } = useVideoConfig();

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
          <Sequence key={clip.id} from={from} durationInFrames={durationInFrames}>
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

const AnimatedText: FC<{ clip: TextClip; edl: Edl }> = ({ clip, edl }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const spec = getSpec(clip.anim?.name);
  const color = edl.theme.palette[0] ?? "#FAF6EE";
  const isTitle = clip.style === "title";
  const m = edl.theme.safeMargins;

  const container: CSSProperties = {
    justifyContent: "center",
    alignItems: "center",
    textAlign: "center",
    paddingTop: m.top,
    paddingBottom: m.bottom,
    paddingLeft: m.left,
    paddingRight: m.right,
  };
  const textStyle: CSSProperties = {
    color,
    fontSize: isTitle ? 104 : 52,
    fontWeight: isTitle ? 600 : 500,
    letterSpacing: isTitle ? "-0.02em" : "0.01em",
    lineHeight: 1.12,
    maxWidth: "85%",
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
                  <span key={ci} style={{ display: "inline-block", ...unitStyle(spec, frame, fps, charIdx++) }}>
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
            <span
              key={i}
              style={{ display: isLine ? "block" : "inline-block", whiteSpace: "pre", ...style }}
            >
              {u}
            </span>
          );
        })}
      </div>
    </AbsoluteFill>
  );
};

const CaptionView: FC<{ track: CaptionTrack; edl: Edl }> = ({ track, edl }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const active = (track.words ?? []).find((w) => t >= w.start && t < w.end);
  if (!active) return null;
  const m = edl.theme.safeMargins;
  const color = edl.theme.palette[0] ?? "#FAF6EE";
  const accent = edl.theme.palette[2] ?? "#E8B04B";
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
        {active.text.toUpperCase()}
      </span>
    </div>
  );
};

const ProgressBar: FC<{ color: string; margin: number; bottom: number }> = ({ color, margin, bottom }) => {
  const frame = useCurrentFrame();
  const { durationInFrames } = useVideoConfig();
  const p = interpolate(frame, [0, Math.max(1, durationInFrames - 1)], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  return (
    <div
      style={{
        position: "absolute",
        left: margin,
        right: margin,
        bottom: Math.max(48, bottom * 0.45),
        height: 8,
        borderRadius: 999,
        background: "rgba(255,255,255,0.14)",
        overflow: "hidden",
      }}
    >
      <div style={{ height: "100%", width: `${p * 100}%`, background: color, borderRadius: 999 }} />
    </div>
  );
};

function hexToRgba(hex: string, alpha: number): string {
  const m = hex.replace("#", "");
  const full = m.length === 3 ? m.split("").map((c) => c + c).join("") : m;
  const n = Number.parseInt(full, 16);
  return `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${alpha})`;
}
