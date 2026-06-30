# Aperture

AI-assisted short-form video studio. Create a project, drop in your clips, write what you want, let it learn your aesthetic, generate a first cut, refine it on a timeline, critique it against your own best posts, auto-improve it, and export a vertical MP4.

Aperture is **local-first, not local-only**: your media, editing, transcription, and export all run on your machine, but the AI steps (generate, critique, auto-improve) call a configurable LLM API (OpenAI GPT-5.5 by default). If no model is configured, those steps fall back to fully-offline deterministic versions.

## The end-to-end flow

1. **Home** — a project dashboard. Create a project (name + prompt + platform) or open/delete an existing one.
2. **Input** — upload clips (drag/drop), edit the prompt, attach music, and upload or record a voiceover (auto-transcribed to word-level captions; music ducks under voice).
3. **Learn aesthetic** (optional) — upload your own past videos; Aperture studies their palette and pacing into a reusable `style.json` profile. You can also apply one of the built-in named style presets.
4. **Generate** — produces a real first cut (hook, reordering, titles, transitions) from your prompt + style. LLM-powered when configured; deterministic baseline otherwise.
5. **Refine** — a timeline editor with live Remotion preview. Every edit autosaves to `edl.json`; external writes live-reload.
6. **Critique** — score the cut, calibrated against your own uploaded high-performers ("you vs your best"). LLM critique or instant offline heuristic.
7. **Auto-improve** — a generate → critique → improve loop that iterates the edit and logs the score trajectory.
8. **Export** — render a vertical 1080×1920 MP4 locally via Remotion.

## Architecture

Three layers, bridged by one file per project:

- **Electron editor** (`app/`) — homepage + timeline UI + live preview (Remotion Player) + export (Remotion renderer).
- **Node scripts** (`app/scripts/`) — the engine: clip probing/assembly, transcription, frame/style/benchmark analysis, the LLM generate/critique/auto-improve calls, and rendering.
- **Agent skills** (`.claude/skills/`, `AGENTS.md`) — the richest path: skills run from a Claude/Cursor harness that read/write the same project files.

**The contract:** each video is a folder under `projects/<slug>/` whose `edl.json` (validated by the zod schema in `packages/edl`) is the single source of truth. Generators write it; the editor previews/edits/autosaves it; the renderer exports it.

Every "smart" step exists at three tiers and the app picks the best available: deterministic script (offline, free) → single LLM call (cost-predictable) → agent skill (richest).

```
aperture/
  app/
    src/                  Electron main + preload + React renderer
    scripts/              analyze, transcribe, render, extract-frames,
                          analyze-style, analyze-benchmarks,
                          generate-llm, critique-llm, autotune(-llm), llm
    resources/            app icon, bundled music
  packages/edl/           Shared EDL + meta/style/benchmark schemas (zod)
  .claude/skills/         create-social-video, learn-aesthetic,
                          critique-video, auto-tune
  projects/<slug>/        meta.json, prompt.md, assets/, edl.json,
                          style.json, references/, benchmarks/,
                          benchmarks.json, transcripts/, critique.json, renders/
  AGENTS.md               Agent operating manual
```

## AI configuration

The AI steps use the Vercel AI SDK behind a provider-agnostic layer (`app/scripts/llm.mjs`). Configure it with a local, gitignored env file — copy `app/.env.local.example` to `app/.env.local`:

```bash
# app/.env.local  (default: OpenAI GPT-5.5)
OPENAI_API_KEY=sk-...
```

The main process loads this at startup, so spawned scripts inherit it (no shell exporting needed). Restart `npm run dev` after changing it.

Escape hatch — rotate models/providers with no code change:

```bash
APERTURE_LLM_PROVIDER=openai            # openai | anthropic | openai-compatible
APERTURE_LLM_MODEL=gpt-5.5
APERTURE_LLM_BASE_URL=                  # e.g. http://localhost:11434/v1 for a self-hosted model
APERTURE_LLM_API_KEY=                   # generic; overrides the provider-specific key
```

With no key set, Generate falls back to the deterministic baseline assembly and the Critique panel uses the offline heuristic; Auto-improve uses the deterministic fix loop.

### What leaves your machine

Only the AI steps make network calls, and they send **text**, not media: the `edl.json` edit plan, your `prompt.md`, `style.json`, and benchmark feature stats. Your actual video/audio files are never uploaded. Clip probing, frame sampling, transcription (whisper.cpp), preview, and export all run locally.

## Develop

```bash
npm install        # install workspaces
npm run dev        # launch the Electron editor (electron-vite)
npm run typecheck  # type-check all workspaces
npm run build      # production build
```

## Status

V1. The full creator pipeline (homepage → input → aesthetic learning → generate → refine → benchmark critique → auto-improve → export) is implemented, with deterministic offline fallbacks and an LLM path for generation, critique, and auto-improvement.
