# Changelog

All notable changes to Aperture are documented here. The format is based on
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/); the project is
pre-release, so everything lives under "Unreleased" until we start tagging
versions.

## [Unreleased]

### Added

- **Testing foundation** — Vitest with two projects (Node for `packages/edl` +
  `app/scripts`, jsdom for the renderer), covering the EDL schema, the
  `sanitizeEdl`/`enforceStyle`/`metrics` helpers, critique scoring, EDL edits,
  text animations, the store (autosave/routing/theme), and a `LeftPanel` render
  regression guard for the rules-of-hooks crash. `npm test` / `npm run test:watch`.
- **CI** — GitHub Actions workflow running `npm ci`, build, typecheck, and tests
  on every pull request and push to `main`.
- **Repo hygiene** — this changelog and a pull request template.
- **Style Library** — a reusable, creator-level look: bulk-import a folder of
  reference videos (native picker), analyze once (`analyze-collection.mjs`,
  GPT-5.5 vision distills a style guide + per-reference exemplars, with a
  deterministic fallback), and reuse across projects; per-project `references/`
  override when present.
- **Color grade** — `theme.grade` (brightness/contrast/saturation/temperature/
  vignette) rendered as a CSS filter on clips in preview and export.
- **LLM everywhere** — provider-agnostic layer (Vercel AI SDK, default OpenAI
  GPT-5.5, env-configurable) powering Generate, Critique, and Auto-improve, each
  with an offline deterministic fallback. Local, gitignored `app/.env.local`.
- **Creator pipeline** — project homepage (create/open/delete, thumbnails),
  clip upload, editable prompt, music attach + bundled library, voiceover
  upload/record with auto-transcribed captions and music ducking, per-project
  aesthetic learning, named style presets, and benchmark-aware critique.
- **Editor/platform** — `edl.json` autosave + file-watch live reload, light/dark
  theme, root error boundary, and toasts.

### Changed

- Rebranded **Reel Studio -> Aperture** (window title, macOS app/dock name, icon,
  docs).
- Generation is style-faithful: injects the style guide + top exemplars and
  deterministically stamps palette/font/captions/grade.
- EDL package: added `meta`, `style`, and `benchmark` schemas; audio-clip `role`;
  `theme.stylePreset` and `theme.grade`; fixed the ESM build so the schema
  imports cleanly from Node scripts.

### Fixed

- Rules-of-hooks crash that blanked the editor when a project loaded.
- Generation silently falling back to the baseline when the model omitted a
  required `anim.name` (now repaired by `sanitizeEdl`).
- Reasoning-model incompatibility (dropped unsupported `temperature`).

## [0.1.0] - Initial commit

- Scaffold: Electron + Vite + React editor, shared `packages/edl` schema,
  Remotion preview/export spine, and the `create-social-video` /
  `critique-video` Claude Code skills.
