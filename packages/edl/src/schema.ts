import { z } from "zod";

/**
 * The EDL (Edit Decision List) is the single source of truth for a video.
 * The agent writes it, the timeline editor edits it, the Remotion Player
 * previews it, and the renderer exports it. Keep every producer/consumer
 * honest by validating against these schemas.
 *
 * Project files are an interchange format (shared between people and written
 * by LLMs), so treat every field as untrusted: numerics are finite and
 * bounded (unbounded values hang the timeline/player), media paths must stay
 * inside the project folder, and colors must be real CSS color literals
 * (arbitrary strings would reach inline styles and can trigger network
 * fetches via url(...)).
 */

/** Upper bound for any timeline position/length, in seconds (4 hours). */
export const MAX_TIMELINE_SEC = 14_400;

/** Finite, non-negative number with a sane ceiling. */
const bounded = (max: number) => z.number().finite().nonnegative().max(max);
/** Finite, non-negative seconds capped at the timeline maximum. */
const seconds = () => bounded(MAX_TIMELINE_SEC);

/**
 * A path that must stay inside the project folder: relative, no `..`
 * segments, no drive letters / UNC prefixes / NUL.
 */
const RelativePathSchema = z
  .string()
  .min(1)
  .max(1024)
  .refine(
    (p) =>
      !p.startsWith("/") &&
      !/^[A-Za-z]:[\\/]/.test(p) &&
      !p.startsWith("\\\\") &&
      !p.includes("\0") &&
      !p.split(/[\\/]/).some((seg) => seg === ".."),
    { message: "must be a project-relative path without .. segments" },
  );

/**
 * A safe CSS color literal: hex, rgb()/hsl() with a numeric-only body, or a
 * bare color name. Excludes anything that could smuggle url()/expressions
 * into inline styles.
 */
const CssColorSchema = z
  .string()
  .max(64)
  .regex(/^(#[0-9a-fA-F]{3,8}|(rgb|rgba|hsl|hsla)\(\s*[\d.,%\s/-]*\)|[a-zA-Z]+)$/, {
    message: "must be a hex/rgb()/hsl() color or a color name",
  });

export const FormatSchema = z.object({
  width: z.number().int().positive().max(8192).default(1080),
  height: z.number().int().positive().max(8192).default(1920),
  fps: z.number().int().positive().max(240).default(30),
});

export const SafeMarginsSchema = z.object({
  top: bounded(4096).default(220),
  bottom: bounded(4096).default(320),
  left: bounded(4096).default(64),
  right: bounded(4096).default(64),
});

/**
 * A light color grade applied to video clips at render time (CSS filters, not a
 * footage-transformation pipeline). Neutral defaults = no visible change.
 */
export const GradeSchema = z.object({
  /** Multipliers around 1.0 (e.g. 1.1 = +10%). */
  brightness: z.number().finite().positive().max(10).default(1),
  contrast: z.number().finite().positive().max(10).default(1),
  saturation: bounded(10).default(1),
  /** Warm/cool tint, degrees of hue rotation (-30..30 typical, 0 = none). */
  temperature: z.number().finite().min(-180).max(180).default(0),
  /** Vignette strength 0..1 (0 = none). */
  vignette: z.number().min(0).max(1).default(0),
});

/** Default placement for text overlays within the safe area. */
export const TextAlignmentSchema = z.object({
  horizontal: z.enum(["left", "center", "right"]).default("center"),
  vertical: z.enum(["top", "center", "bottom"]).default("center"),
});

export const ThemeSchema = z.object({
  fontFamily: z.string().max(256).default("Inter"),
  palette: z.array(CssColorSchema).min(1).max(16).default(["#FAFAF9", "#0F0E0D", "#E8B04B"]),
  captionStyle: z.enum(["karaoke", "block", "word", "none"]).default("karaoke"),
  safeMargins: SafeMarginsSchema.default({}),
  /** Default text-overlay alignment (Design section in the editor). */
  textAlignment: TextAlignmentSchema.default({}),
  /** Id of the named visual-style preset this theme was seeded from (if any). */
  stylePreset: z.string().max(64).optional(),
  /** Optional color grade applied to all video clips. */
  grade: GradeSchema.optional(),
});

/** A scene transition between/over clips. `preset` maps to a Remotion presentation or a gl-transition name. */
export const TransitionSchema = z.object({
  preset: z.string().max(64),
  duration: z.number().finite().positive().max(30).default(0.4),
  direction: z.enum(["left", "right", "up", "down"]).optional(),
});

/** A text animation reference. `name` is an animate-text spec id; `from` is the catalog source. */
export const TextAnimSchema = z.object({
  name: z.string().max(64),
  from: z.string().max(64).default("animate-text"),
});

export const TransformSchema = z.object({
  scale: z.number().finite().min(0).max(100).default(1),
  x: z.number().finite().min(-10_000).max(10_000).default(0),
  y: z.number().finite().min(-10_000).max(10_000).default(0),
  rotation: z.number().finite().min(-3600).max(3600).default(0),
});

export const VideoClipSchema = z
  .object({
    id: z.string().max(256),
    assetId: z.string().max(256),
    /** Timeline position (seconds from composition start). */
    start: seconds(),
    /** Source in-point (seconds into the asset). */
    in: seconds().default(0),
    /** Source out-point (seconds into the asset). Must be > in. */
    out: z.number().finite().positive().max(MAX_TIMELINE_SEC),
    transform: TransformSchema.partial().optional(),
    transitionIn: TransitionSchema.optional(),
    transitionOut: TransitionSchema.optional(),
    volume: z.number().min(0).max(1).default(1),
  })
  .refine((c) => c.out > c.in, { message: "out must be > in", path: ["out"] });

export const TextClipSchema = z
  .object({
    id: z.string().max(256),
    start: seconds(),
    end: z.number().finite().positive().max(MAX_TIMELINE_SEC),
    text: z.string().max(2000),
    style: z.string().max(64).default("title"),
    anim: TextAnimSchema.optional(),
  })
  .refine((c) => c.end > c.start, { message: "end must be > start", path: ["end"] });

export const AudioClipSchema = z
  .object({
    id: z.string().max(256),
    assetId: z.string().max(256),
    start: seconds().default(0),
    in: seconds().default(0),
    out: z.number().finite().positive().max(MAX_TIMELINE_SEC),
    /** Gain in dB. */
    gain: z.number().finite().min(-60).max(12).default(0),
    duckUnderVoice: z.boolean().default(false),
    /** What this clip is: a music bed, a spoken voiceover, or a one-off sound effect. */
    role: z.enum(["music", "voiceover", "sfx"]).default("music"),
  })
  .refine((c) => c.out > c.in, { message: "out must be > in", path: ["out"] });

export const VideoTrackSchema = z.object({
  id: z.string().max(256),
  /** Optional display name for the timeline layer. */
  name: z.string().max(256).optional(),
  type: z.literal("video"),
  clips: z.array(VideoClipSchema).max(500).default([]),
});

export const TextTrackSchema = z.object({
  id: z.string().max(256),
  /** Optional display name for the timeline layer. */
  name: z.string().max(256).optional(),
  type: z.literal("text"),
  clips: z.array(TextClipSchema).max(500).default([]),
});

export const CaptionWordSchema = z
  .object({
    text: z.string().max(256),
    start: seconds(),
    end: seconds(),
  })
  .refine((w) => w.end >= w.start, { message: "end must be >= start", path: ["end"] });

export const CaptionTrackSchema = z.object({
  id: z.string().max(256),
  /** Optional display name for the timeline layer. */
  name: z.string().max(256).optional(),
  type: z.literal("caption"),
  /** Path (relative to project root) to a word-level transcript JSON. */
  source: RelativePathSchema.optional(),
  style: z.string().max(64).default("karaoke"),
  /** Word-level timings (written by the transcribe step or inline). */
  words: z.array(CaptionWordSchema).max(20_000).optional(),
});

export const AudioTrackSchema = z.object({
  id: z.string().max(256),
  /** Optional display name for the timeline layer. */
  name: z.string().max(256).optional(),
  type: z.literal("audio"),
  clips: z.array(AudioClipSchema).max(500).default([]),
});

export const TrackSchema = z.discriminatedUnion("type", [
  VideoTrackSchema,
  TextTrackSchema,
  CaptionTrackSchema,
  AudioTrackSchema,
]);

export const AssetSchema = z.object({
  id: z.string().max(256),
  kind: z.enum(["video", "audio", "image"]),
  /** Path relative to the project folder (e.g. "assets/clip01.mp4"). */
  src: RelativePathSchema,
  /** Optional lightweight H.264 proxy (relative path) used for smooth editor playback. */
  proxySrc: RelativePathSchema.optional(),
  durationSec: z.number().finite().positive().max(MAX_TIMELINE_SEC).optional(),
  width: z.number().int().positive().max(16_384).optional(),
  height: z.number().int().positive().max(16_384).optional(),
});

export const EdlSchema = z.object({
  version: z.literal(1).default(1),
  format: FormatSchema.default({}),
  theme: ThemeSchema.default({}),
  assets: z.array(AssetSchema).max(500).default([]),
  tracks: z.array(TrackSchema).max(50).default([]),
});

/**
 * Per-project metadata (projects/<slug>/meta.json). Distinct from the EDL: it
 * tracks the project's identity and where it is in the pipeline, not the cut.
 */
export const MetaSchema = z.object({
  title: z.string().max(512).default("Untitled"),
  createdAt: z.string().max(64).optional(),
  updatedAt: z.string().max(64).optional(),
  platform: z.enum(["reels", "tiktok", "shorts"]).default("reels"),
  status: z.enum(["draft", "generated", "critiqued", "exported"]).default("draft"),
  /** Id of the learned/selected style profile that seeds generation. */
  styleProfileId: z.string().max(64).optional(),
  /** Home-page album this project belongs to (registry lives at the projects root). */
  albumId: z.string().max(64).optional(),
});

/**
 * A compact, structural distillation of one reference video's edit — the
 * retrievable "exemplar" generation imitates (in-context learning).
 */
export const StyleExemplarSchema = z.object({
  source: z.string().max(512).optional(),
  hook: z.string().max(2000).optional(),
  beats: z.string().max(4000).optional(),
  captionStyle: z.string().max(64).optional(),
  textTreatment: z.string().max(2000).optional(),
  transitions: z.array(z.string().max(64)).max(32).default([]),
  gradeNote: z.string().max(2000).optional(),
  durationSec: seconds().optional(),
  cutsPer10s: bounded(1000).optional(),
});

/**
 * A learned (or selected) aesthetic profile. Lives either per-project
 * (projects/<slug>/style.json) or in the global library (styles/<id>/profile.json).
 * Generation reads it to bake in palette, grade, pacing, captions, and hook feel,
 * and retrieves `exemplars` to imitate concrete edit structure.
 */
export const StyleProfileSchema = z.object({
  id: z.string().max(64).default("custom"),
  name: z.string().max(256).default("My Style"),
  /** Colors are stamped into EDL themes and rendered as inline CSS — same allowlist as the EDL palette. */
  palette: z.array(CssColorSchema).max(16).default([]),
  fontFamily: z.string().max(256).optional(),
  captionStyle: z.enum(["karaoke", "block", "word", "none"]).optional(),
  grade: GradeSchema.optional(),
  pacing: z
    .object({
      cutsPer10s: bounded(1000).optional(),
      avgShotSec: z.number().finite().positive().max(MAX_TIMELINE_SEC).optional(),
    })
    .default({}),
  hookPattern: z.string().max(2000).optional(),
  hookSec: seconds().optional(),
  textTreatment: z.string().max(2000).optional(),
  transitions: z.array(z.string().max(64)).max(32).default([]),
  /** How generation should use the references: imitate closely vs vibe-match. */
  referenceMode: z.enum(["literal", "inspired"]).default("literal"),
  /** 0 = calm/cinematic, 1 = frenetic/high-energy. */
  energy: z.number().min(0).max(1).optional(),
  /** 0 = no music drive, 1 = tightly beat-synced. */
  musicEnergy: z.number().min(0).max(1).optional(),
  targetLengthSec: z.number().finite().positive().max(MAX_TIMELINE_SEC).optional(),
  /** Long-form prose style guide the model reads to imitate the look/feel (interpolated into prompts — capped). */
  styleGuide: z.string().max(20_000).optional(),
  /** Per-reference structural exemplars for in-context imitation. */
  exemplars: z.array(StyleExemplarSchema).max(50).default([]),
  do: z.array(z.string().max(500)).max(50).default([]),
  avoid: z.array(z.string().max(500)).max(50).default([]),
  notes: z.string().max(4000).optional(),
  /** Number of source clips analyzed + when. */
  source: z
    .object({ clips: z.number().int().nonnegative().max(100_000), generatedAt: z.string().max(64) })
    .partial()
    .optional(),
});

/** Finite metric value: benchmark stats feed z-score math where Infinity/NaN poison every subscore. */
const metricNumber = () => z.number().finite().min(-1e9).max(1e9);

/** Per-benchmark-video extracted features (one entry per file in benchmarks/). */
export const BenchmarkFeatureSchema = z.object({
  file: z.string().max(512),
  durationSec: seconds().optional(),
  cutsPer10s: bounded(1000).optional(),
  hookSec: seconds().optional(),
  captionWordsPerSec: bounded(100).optional(),
  textDensity: bounded(1000).optional(),
  loudnessLufs: z.number().finite().min(-120).max(20).optional(),
  views: z.number().finite().nonnegative().max(1e12).optional(),
  likes: z.number().finite().nonnegative().max(1e12).optional(),
});

/** Summary stats for a single metric across the benchmark set. */
export const BenchmarkMetricSchema = z.object({
  mean: metricNumber(),
  std: metricNumber(),
  min: metricNumber(),
  max: metricNumber(),
});

/**
 * Aggregated benchmark features (projects/<slug>/benchmarks.json) the critic
 * scores the current cut against, instead of fixed heuristic thresholds.
 */
export const BenchmarksSchema = z.object({
  generatedAt: z.string().max(64).optional(),
  count: z.number().int().nonnegative().max(100_000).default(0),
  videos: z.array(BenchmarkFeatureSchema).max(500).default([]),
  distribution: z
    .record(z.string().max(64), BenchmarkMetricSchema)
    .refine((d) => Object.keys(d).length <= 64, { message: "too many distribution keys" })
    .default({}),
});

/** A yours-vs-winners comparison attached to a critique subscore. */
export const BenchmarkCompareSchema = z.object({
  yours: metricNumber(),
  theirs: metricNumber(),
  unit: z.string().max(32),
});

/** One weighted dimension of a critique (hook, pacing, captions, ...). */
export const SubScoreSchema = z.object({
  key: z.string().max(64),
  label: z.string().max(128),
  score: z.number().finite().min(0).max(100),
  max: z.number().finite().positive().max(100),
  note: z.string().max(1000).default(""),
  benchmark: BenchmarkCompareSchema.optional(),
});

/**
 * The critic's output (projects/<slug>/critique.json). Written by
 * critique-llm.mjs / the renderer's heuristic critic and rendered by the
 * Critique panel — validated like every other shareable project file.
 */
export const CritiqueSchema = z.object({
  score: z.number().finite().min(0).max(100),
  subscores: z.array(SubScoreSchema).max(20).default([]),
  fixes: z
    .array(z.object({ issue: z.string().max(500), fix: z.string().max(2000) }))
    .max(50)
    .default([]),
  benchmarksUsed: z.boolean().optional(),
  summary: z.string().max(2000).optional(),
});
