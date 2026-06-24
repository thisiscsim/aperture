---
name: critique-video
description: Score a short-form video cut against short-form best practices and write critique.json with a 0-100 score and specific fixes. Use after a first cut exists, when the user wants feedback or a quality read on a video.
---

# Critique Video

Reads `projects/<slug>/edl.json` (and optional rendered stills) and writes `projects/<slug>/critique.json`.

## Rubric (0-100, weighted)

- Hook strength (first ~2s) — 25
- Pacing / cut frequency — 15
- Caption coverage + legibility — 15
- Vertical safe-area compliance — 10
- Length vs platform norm — 10
- Audio presence / quality — 15
- Ending / payoff — 10

## Output: critique.json

```json
{
  "score": 0,
  "subscores": { "hook": 0, "pacing": 0, "captions": 0, "safeArea": 0, "length": 0, "audio": 0, "ending": 0 },
  "fixes": [{ "issue": "", "why": "", "fix": "" }]
}
```

## Honesty

This is a best-practices score, not a virality prediction. If `references/benchmarks.json` exists (the user's own past-post metrics), calibrate against it; otherwise score on heuristics only and say so in the summary.
