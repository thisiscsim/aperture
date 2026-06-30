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
  /** Id of the named visual-style preset this theme was seeded from (if any). */
  stylePreset: z.string().optional(),
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
  /** What this clip is: a music bed, a spoken voiceover, or a one-off sound effect. */
  role: z.enum(["music", "voiceover", "sfx"]).default("music"),
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

/**
 * Per-project metadata (projects/<slug>/meta.json). Distinct from the EDL: it
 * tracks the project's identity and where it is in the pipeline, not the cut.
 */
export const MetaSchema = z.object({
  title: z.string().default("Untitled"),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  platform: z.enum(["reels", "tiktok", "shorts"]).default("reels"),
  status: z.enum(["draft", "generated", "critiqued", "exported"]).default("draft"),
  /** Id of the learned/selected style profile that seeds generation. */
  styleProfileId: z.string().optional(),
});

/**
 * A learned (or selected) aesthetic profile (projects/<slug>/style.json). The
 * `learn-aesthetic` skill writes this from the creator's uploaded references;
 * generation reads it to bake in palette, pacing, captions, and hook feel.
 */
export const StyleProfileSchema = z.object({
  id: z.string().default("custom"),
  name: z.string().default("My Style"),
  palette: z.array(z.string()).default([]),
  fontFamily: z.string().optional(),
  captionStyle: z.enum(["karaoke", "block", "word", "none"]).optional(),
  pacing: z
    .object({
      cutsPer10s: z.number().nonnegative().optional(),
      avgShotSec: z.number().positive().optional(),
    })
    .default({}),
  hookPattern: z.string().optional(),
  /** 0 = calm/cinematic, 1 = frenetic/high-energy. */
  energy: z.number().min(0).max(1).optional(),
  targetLengthSec: z.number().positive().optional(),
  do: z.array(z.string()).default([]),
  avoid: z.array(z.string()).default([]),
  notes: z.string().optional(),
});

/** Per-benchmark-video extracted features (one entry per file in benchmarks/). */
export const BenchmarkFeatureSchema = z.object({
  file: z.string(),
  durationSec: z.number().optional(),
  cutsPer10s: z.number().optional(),
  hookSec: z.number().optional(),
  captionWordsPerSec: z.number().optional(),
  textDensity: z.number().optional(),
  loudnessLufs: z.number().optional(),
  views: z.number().optional(),
  likes: z.number().optional(),
});

/** Summary stats for a single metric across the benchmark set. */
export const BenchmarkMetricSchema = z.object({
  mean: z.number(),
  std: z.number(),
  min: z.number(),
  max: z.number(),
});

/**
 * Aggregated benchmark features (projects/<slug>/benchmarks.json) the critic
 * scores the current cut against, instead of fixed heuristic thresholds.
 */
export const BenchmarksSchema = z.object({
  generatedAt: z.string().optional(),
  count: z.number().default(0),
  videos: z.array(BenchmarkFeatureSchema).default([]),
  distribution: z.record(z.string(), BenchmarkMetricSchema).default({}),
});
