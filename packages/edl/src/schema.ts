import { z } from "zod";

/**
 * The EDL (Edit Decision List) is the single source of truth for a video.
 * The agent writes it, the timeline editor edits it, the Remotion Player
 * previews it, and the renderer exports it. Keep every producer/consumer
 * honest by validating against these schemas.
 */

export const FormatSchema = z.object({
  width: z.number().int().positive().default(1080),
  height: z.number().int().positive().default(1920),
  fps: z.number().int().positive().default(30),
});

export const SafeMarginsSchema = z.object({
  top: z.number().nonnegative().default(220),
  bottom: z.number().nonnegative().default(320),
  left: z.number().nonnegative().default(64),
  right: z.number().nonnegative().default(64),
});

export const ThemeSchema = z.object({
  fontFamily: z.string().default("Inter"),
  palette: z.array(z.string()).min(1).default(["#FAFAF9", "#0F0E0D", "#E8B04B"]),
  captionStyle: z.enum(["karaoke", "block", "word", "none"]).default("karaoke"),
  safeMargins: SafeMarginsSchema.default({}),
});

/** A scene transition between/over clips. `preset` maps to a Remotion presentation or a gl-transition name. */
export const TransitionSchema = z.object({
  preset: z.string(),
  duration: z.number().positive().default(0.4),
  direction: z.enum(["left", "right", "up", "down"]).optional(),
});

/** A text animation reference. `name` is an animate-text spec id; `from` is the catalog source. */
export const TextAnimSchema = z.object({
  name: z.string(),
  from: z.string().default("animate-text"),
});

export const TransformSchema = z.object({
  scale: z.number().default(1),
  x: z.number().default(0),
  y: z.number().default(0),
  rotation: z.number().default(0),
});

export const VideoClipSchema = z.object({
  id: z.string(),
  assetId: z.string(),
  /** Timeline position (seconds from composition start). */
  start: z.number().nonnegative(),
  /** Source in-point (seconds into the asset). */
  in: z.number().nonnegative().default(0),
  /** Source out-point (seconds into the asset). Must be > in. */
  out: z.number().positive(),
  transform: TransformSchema.partial().optional(),
  transitionIn: TransitionSchema.optional(),
  transitionOut: TransitionSchema.optional(),
  volume: z.number().min(0).max(1).default(1),
});

export const TextClipSchema = z.object({
  id: z.string(),
  start: z.number().nonnegative(),
  end: z.number().positive(),
  text: z.string(),
  style: z.string().default("title"),
  anim: TextAnimSchema.optional(),
});

export const AudioClipSchema = z.object({
  id: z.string(),
  assetId: z.string(),
  start: z.number().nonnegative().default(0),
  in: z.number().nonnegative().default(0),
  out: z.number().positive(),
  /** Gain in dB. */
  gain: z.number().default(0),
  duckUnderVoice: z.boolean().default(false),
});

export const VideoTrackSchema = z.object({
  id: z.string(),
  type: z.literal("video"),
  clips: z.array(VideoClipSchema).default([]),
});

export const TextTrackSchema = z.object({
  id: z.string(),
  type: z.literal("text"),
  clips: z.array(TextClipSchema).default([]),
});

export const CaptionWordSchema = z.object({
  text: z.string(),
  start: z.number().nonnegative(),
  end: z.number().nonnegative(),
});

export const CaptionTrackSchema = z.object({
  id: z.string(),
  type: z.literal("caption"),
  /** Path (relative to project root) to a word-level transcript JSON. */
  source: z.string().optional(),
  style: z.string().default("karaoke"),
  /** Word-level timings (written by the transcribe step or inline). */
  words: z.array(CaptionWordSchema).optional(),
});

export const AudioTrackSchema = z.object({
  id: z.string(),
  type: z.literal("audio"),
  clips: z.array(AudioClipSchema).default([]),
});

export const TrackSchema = z.discriminatedUnion("type", [
  VideoTrackSchema,
  TextTrackSchema,
  CaptionTrackSchema,
  AudioTrackSchema,
]);

export const AssetSchema = z.object({
  id: z.string(),
  kind: z.enum(["video", "audio", "image"]),
  /** Path relative to the project folder (e.g. "assets/clip01.mp4"). */
  src: z.string(),
  durationSec: z.number().positive().optional(),
  width: z.number().int().positive().optional(),
  height: z.number().int().positive().optional(),
});

export const EdlSchema = z.object({
  version: z.literal(1).default(1),
  format: FormatSchema.default({}),
  theme: ThemeSchema.default({}),
  assets: z.array(AssetSchema).default([]),
  tracks: z.array(TrackSchema).default([]),
});
