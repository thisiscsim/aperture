---
name: create-social-video
description: Turn a prompt + uploaded clips into a first-cut short-form vertical video by writing a validated edl.json. Use when the user wants to generate or assemble a social video (Instagram / TikTok / Reels) from raw footage and an English description of intent.
---

# Create Social Video

End-to-end first-cut generator. Input: `projects/<slug>/prompt.md` plus clips in `projects/<slug>/assets/`. Output: a validated `projects/<slug>/edl.json` and word-level transcripts in `projects/<slug>/transcripts/`.

## Steps

1. Read the brief: `projects/<slug>/prompt.md` (intent, vibe, target length, platform).
2. Inventory + baseline assembly: run `node app/scripts/analyze.mjs --slug <slug>`. It probes every clip with `@remotion/media-parser` and writes a deterministic first-cut `edl.json` (clips overlapped for crossfades) you then refine.
3. Captions (optional, needs speech): run `node app/scripts/transcribe.mjs --slug <slug>` to extract audio + run whisper.cpp and write word-level `words[]` into the caption track.
4. Plan the edit from the intent: pick a hook clip for the first ~2s, reorder/trim clips, set pacing. Edit `edl.json` directly.
5. Add text overlays (title / subtitle) and pick transitions + text animations: `anim.name` is an animate-text spec (see `app/src/renderer/src/motion/animations.ts`); `transitionOut.preset` is `fade | slide | wipe`.
6. If music is provided, add it as an audio asset + an audio track; set `gain` and `duckUnderVoice`.
7. Every `edl.json` MUST pass `EdlSchema` from `packages/edl/src/schema.ts`. Preview via the editor (`npm run dev`), export via the Export button or `node app/scripts/render.mjs --slug <slug>`.

## Rules

- Format defaults to 1080x1920 @ 30fps.
- Respect `theme.safeMargins` — keep text/captions out of the platform UI zones.
- Make the first ~2 seconds a strong hook.
- Only reference assets that exist in `assets/` and are declared in `edl.assets`.
- Never emit an edl.json that fails schema validation.
