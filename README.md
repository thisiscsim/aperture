# Reel Studio

AI-assisted short-form video studio. Describe a post in plain English, drop in your clips, let an agent assemble a first cut, refine it on a timeline, get it graded, and export a vertical MP4 — all locally.

## Architecture (V1)

Two halves bridged by one file:

- **Electron editor** (`app/`) — timeline UI + live preview (Remotion Player) + export (Remotion renderer).
- **Claude Code harness** (`.claude/skills/`, `AGENTS.md`) — the agent that generates the first cut and critiques it.
- **The bridge** — each video is a folder under `projects/<slug>/` whose `edl.json` is the single source of truth. The agent writes it; the editor previews/edits it; the renderer exports it.

```
reel-studio/
  app/                  Electron + Vite + React editor
  packages/edl/         Shared EDL schema (zod) + types
  .claude/skills/       create-social-video, critique-video
  projects/<slug>/      prompt.md, assets/, edl.json, transcripts/, renders/
  AGENTS.md             Agent operating manual
```

## Develop

```bash
npm install        # install workspaces
npm run dev        # launch the Electron editor (electron-vite)
npm run typecheck  # type-check all workspaces
```

## Status

V1 in progress. Milestones: M0 scaffold (done), M1 render spine, M2 timeline editor, M3 export, M4 agent first-cut, M5 motion-graphics package, M6 critic.
