# Aperture

AI-assisted short-form video studio. You (the agent) turn a prompt + raw clips into a finished vertical social video by writing a declarative timeline (`edl.json`), which a local Electron editor previews and exports via Remotion.

## How it works

The full creator journey (front to back, v1.5):

1. **First run (zero state)**: with an empty library the homepage becomes a guided surface — drop clips, describe the video in the agent composer (mode, reasoning effort, aspect, duration, references with literal/inspired handling), and submit. That scaffolds `projects/<slug>/` (`meta.json`, `prompt.md`, `edl.json`, `assets/ references/ benchmarks/ transcripts/ renders/`), imports everything, and starts the first generation. With existing projects, "New project" is a name-only dialog and the same composer lives in the editor.
2. **The editor's Create tab** is a per-project conversation with the agent, persisted to `session.json`. Each submit routes to a generation run (first cut, or adjust-with-notes when a cut exists) or a critique run; script progress streams in as status items. References and Assets tabs hold the project's media; uploads into References auto-attach as `@mentions` in the composer.
3. Optionally the creator teaches you their look: reference videos in `references/` feed aesthetic learning (References tab → `style.json` + `aesthetic.md`).
4. You generate the cut by writing `projects/<slug>/edl.json` — the single source of truth — conditioned on `prompt.md` and `style.json`.
5. The Electron editor live-previews `edl.json` and live-reloads it when you (or the user) change it. The user refines on the timeline and the floating toolbar (theme + per-clip tools); their edits autosave back to `edl.json`.
6. Critique runs from the composer's Critique mode (benchmark videos upload or arrive by pasted link) into `critique.json`, calibrated against `benchmarks.json` when present; the in-chat card's "Apply changes" runs the auto-tune loop (generate -> critique -> fix, logging `results.tsv`).

## The contract: edl.json (+ sidecar files)

`edl.json` is validated by the zod schema in `packages/edl` (`packages/edl/src/schema.ts`). Never write an `edl.json` that fails `EdlSchema`.

Shape: `format` (vertical 1080x1920, fps), `theme` (font, palette, captionStyle, safeMargins, optional `stylePreset`), `assets[]`, `tracks[]` where each track is `video | text | caption | audio`. Audio clips carry a `role` (`music | voiceover | sfx`); music with `duckUnderVoice` is attenuated under voiceover.

Per-project sidecar files (each has its own schema + `parse*` helper in `packages/edl`):

- `meta.json` (`MetaSchema`) — title, platform, status, `styleProfileId`.
- `style.json` (`StyleProfileSchema`) — learned/selected aesthetic: palette, font, captions, pacing, hook, energy, do/avoid.
- `benchmarks.json` (`BenchmarksSchema`) — feature distribution of the creator's high-performers, for benchmark-relative critique.
- `session.json` (`SessionSchema`) — the Create tab's conversation log. App-owned: the editor writes it; don't author it as an external agent (your contract stays `edl.json` + the sidecars above).

## Skills

- `/create-social-video <slug>` — analyze clips + prompt (+ `style.json`), write `edl.json` (first cut).
- `/learn-aesthetic <slug>` — study the creator's `references/`, write `style.json` + `aesthetic.md`.
- `/critique-video <slug>` — score the cut (vs `benchmarks.json` when present), write `critique.json`.
- `/auto-tune <slug>` — loop generate/adjust -> critique -> fix, logging `results.tsv`.

## Helper scripts (`app/scripts/`)

`analyze.mjs` (baseline assembly), `transcribe.mjs` (captions, prefers the voiceover clip), `render.mjs` (export), `extract-frames.mjs` + `analyze-style.mjs` (aesthetic baseline), `analyze-benchmarks.mjs` (benchmark features), `autotune.mjs` (deterministic auto-improve).

## Scoped conventions

Area-specific rules live in `.cursor/rules/` (IPC/main-process, renderer design system, engine scripts, EDL schema, delivery workflow). They activate by file glob in Cursor; other agents should skim the relevant file before working in that area.

## Boundaries

- Generated artifacts live under `projects/<slug>/`. In the app these resolve to the user's Aperture home (`~/Documents/Aperture/projects/`, configurable); the scripts honor `APERTURE_PROJECTS_DIR` and fall back to the repo's `projects/` in dev. Don't write outside a project folder except code changes you were explicitly asked to make.
- Vertical 1080x1920 @ 30fps is the default format.
- Keep the design system lightweight: font, palette, caption style, simple overlays — all driven by `theme`. Don't hardcode styling that belongs in `theme`.
- Only reference assets that actually exist in the project's `assets/` and are listed in `edl.assets`.
