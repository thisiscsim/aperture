# Reel Studio

AI-assisted short-form video studio. You (the agent) turn a prompt + raw clips into a finished vertical social video by writing a declarative timeline (`edl.json`), which a local Electron editor previews and exports via Remotion.

## How it works

- The user creates a project under `projects/<slug>/`, drops clips into `assets/`, and writes intent in `prompt.md`.
- You generate the first cut by writing `projects/<slug>/edl.json` — the single source of truth for the video.
- The Electron editor watches `edl.json` and live-previews it. The user refines on the timeline; their edits write back to `edl.json`.
- You critique the result into `projects/<slug>/critique.json`.

## The contract: edl.json

`edl.json` is validated by the zod schema in `packages/edl` (`packages/edl/src/schema.ts`). Never write an `edl.json` that fails `EdlSchema`.

Shape: `format` (vertical 1080x1920, fps), `theme` (font, palette, captionStyle, safeMargins), `assets[]`, `tracks[]` where each track is `video | text | caption | audio`.

## Skills

- `/create-social-video <slug>` — analyze clips + prompt, write `edl.json` (first cut).
- `/critique-video <slug>` — score the cut and write `critique.json`.

## Boundaries

- Generated artifacts live under `projects/<slug>/`. Don't write outside a project folder except code changes you were explicitly asked to make.
- Vertical 1080x1920 @ 30fps is the default format.
- Keep the design system lightweight: font, palette, caption style, simple overlays — all driven by `theme`. Don't hardcode styling that belongs in `theme`.
- Only reference assets that actually exist in the project's `assets/` and are listed in `edl.assets`.
