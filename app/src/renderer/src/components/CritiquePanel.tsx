import { useEffect, useRef, useState } from "react";
import type { Benchmarks } from "@reel/edl";
import { useEditor } from "../store";
import { critiqueEdl, type Critique } from "../lib/critique";

interface BenchItem {
  file: string;
  views?: number;
  likes?: number;
}

export function CritiquePanel(): JSX.Element {
  const edl = useEditor((s) => s.edl);
  const slug = useEditor((s) => s.slug);
  const [result, setResult] = useState<Critique | null>(null);
  const [source, setSource] = useState<"agent" | "heuristic">("heuristic");
  const [benchmarks, setBenchmarks] = useState<Benchmarks | null>(null);
  const [benchList, setBenchList] = useState<BenchItem[]>([]);
  const [phase, setPhase] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [trajectory, setTrajectory] = useState<{ iter: number; score: number; delta: string; change: string }[]>([]);
  const [aiMode, setAiMode] = useState<"llm" | "baseline">("baseline");
  const [critPhase, setCritPhase] = useState<string | null>(null);
  const benchInput = useRef<HTMLInputElement>(null);
  const autotuning = useEditor((s) => s.autotuning);
  const setAutotuning = useEditor((s) => s.setAutotuning);
  const reloadProject = useEditor((s) => s.reloadProject);
  const setNotice = useEditor((s) => s.setNotice);

  useEffect(() => {
    window.api?.generateMode().then((m) => setAiMode(m.mode)).catch(() => {});
  }, []);

  useEffect(() => {
    if (!slug) return;
    window.api?.loadCritique(slug).then((c) => {
      if (c && typeof c === "object" && "score" in c) {
        setResult(c as Critique);
        setSource("agent");
      }
    });
    window.api?.loadBenchmarks(slug).then(setBenchmarks).catch(() => {});
    window.api?.listBenchmarks(slug).then(setBenchList).catch(() => {});
    window.api?.autoTuneResults(slug).then(setTrajectory).catch(() => {});
  }, [slug]);

  // Refresh the trajectory when an auto-improve run finishes.
  useEffect(() => {
    if (!slug || autotuning) return;
    window.api?.autoTuneResults(slug).then(setTrajectory).catch(() => {});
  }, [slug, autotuning]);

  if (!edl) return <div />;

  const pathsFrom = (files: FileList): string[] =>
    Array.from(files)
      .map((f) => {
        try {
          return window.api.getPathForFile(f);
        } catch {
          return "";
        }
      })
      .filter(Boolean);

  const addBenchmarks = async (files: FileList) => {
    if (!slug) return;
    await window.api.importBenchmarks(slug, pathsFrom(files));
    window.api.listBenchmarks(slug).then(setBenchList);
  };

  const onAutoTune = async () => {
    if (!slug || autotuning) return;
    setAutotuning(true);
    setNotice(null);
    try {
      const res = await window.api.autoTune(slug);
      reloadProject();
      if (!res.ok) setNotice({ kind: "error", text: `Auto-improve failed: ${res.error ?? "unknown error"}` });
    } catch (err) {
      setNotice({ kind: "error", text: `Auto-improve failed: ${String(err)}` });
    } finally {
      setAutotuning(false);
    }
  };

  const runAiCritique = async () => {
    if (!slug || critPhase) return;
    setCritPhase("starting");
    const offPhase = window.api.onPhase("critique", setCritPhase);
    try {
      const res = await window.api.runCritique(slug);
      if (res.ok) {
        const c = await window.api.loadCritique(slug);
        if (c && typeof c === "object" && "score" in c) {
          setResult(c as Critique);
          setSource("agent");
        }
      }
    } finally {
      offPhase();
      setCritPhase(null);
    }
  };

  const analyze = async () => {
    if (!slug || phase) return;
    setProgress(0);
    setPhase("starting");
    const offPhase = window.api.onPhase("benchmarks", setPhase);
    const offProgress = window.api.onProgress("benchmarks", setProgress);
    try {
      await window.api.analyzeBenchmarks(slug);
      const b = await window.api.loadBenchmarks(slug);
      setBenchmarks(b);
    } finally {
      offPhase();
      offProgress();
      setPhase(null);
    }
  };

  return (
    <div className="pad">
      <div className="section-h">Benchmarks</div>
      <p className="muted small">
        Upload your own high-performing videos. The critique scores this cut against what actually works for you.
      </p>
      <div className="dropzone mt" onClick={() => benchInput.current?.click()}>
        <div className="dropzone-title">
          {benchList.length === 0 ? "Add benchmark videos" : `${benchList.length} benchmark${benchList.length === 1 ? "" : "s"}`}
        </div>
        <div className="dropzone-sub">Your best posts — click to add</div>
      </div>
      <input
        ref={benchInput}
        type="file"
        accept="video/*"
        multiple
        hidden
        onChange={(e) => {
          if (e.target.files) void addBenchmarks(e.target.files);
          e.target.value = "";
        }}
      />
      {benchList.length > 0 && (
        <button className="btn full mt" onClick={analyze} disabled={!!phase}>
          {phase ? `Analyzing… ${phase}` : benchmarks ? "Re-analyze benchmarks" : "Analyze benchmarks"}
        </button>
      )}
      {phase && (
        <div className="bar lg mt">
          <div className="bar-fill" style={{ width: `${progress}%` }} />
        </div>
      )}
      {benchmarks && benchmarks.count > 0 && (
        <p className="muted small mt">
          Calibrated on {benchmarks.count} of your videos — avg {benchmarks.distribution.durationSec?.mean ?? "?"}s,{" "}
          {benchmarks.distribution.cutsPer10s?.mean ?? "?"} cuts/10s.
        </p>
      )}

      <div className="section-h" style={{ marginTop: 18 }}>
        Score
      </div>
      <button
        className="btn btn-primary full"
        onClick={runAiCritique}
        disabled={aiMode !== "llm" || !!critPhase}
        title={
          aiMode === "llm"
            ? "Critique this cut with the LLM"
            : "Set OPENAI_API_KEY in app/.env.local to enable AI critique"
        }
      >
        {critPhase ? `Critiquing… ${critPhase}` : "AI critique"}
      </button>
      <button
        className="btn full mt"
        onClick={() => {
          setResult(critiqueEdl(edl, benchmarks));
          setSource("heuristic");
        }}
      >
        Quick heuristic
      </button>
      <button
        className="btn full mt"
        onClick={onAutoTune}
        disabled={autotuning}
        title="Iteratively improve the cut against best practices and your benchmarks"
      >
        {autotuning ? "Improving…" : "Auto-improve"}
      </button>

      {!result && (
        <p className="muted small mt">
          {aiMode === "llm"
            ? "AI critique reads your prompt, style, and benchmarks. Quick heuristic is instant and offline."
            : "Heuristic score (offline). Add OPENAI_API_KEY in app/.env.local for an LLM critique."}
        </p>
      )}

      {result && (
        <div className="critique">
          <div className="critique-head">
            <Ring score={result.score} />
            <div>
              <div className="critique-score-label">Overall</div>
              <div className="muted small">{verdict(result.score)}</div>
              <div className="muted small">
                {source === "agent" ? "Agent critique" : result.benchmarksUsed ? "Benchmark-calibrated" : "Heuristic"}
              </div>
            </div>
          </div>

          {result.summary && <p className="muted small">{result.summary}</p>}

          <div className="subscores">
            {result.subscores.map((s) => (
              <div key={s.key} className="subscore">
                <div className="subscore-top">
                  <span>{s.label}</span>
                  <span className="muted">
                    {s.score}/{s.max}
                  </span>
                </div>
                <div className="bar">
                  <div className="bar-fill" style={{ width: `${(s.score / s.max) * 100}%` }} />
                </div>
                {s.benchmark && (
                  <div className="bench-compare">
                    you {s.benchmark.yours} · your best {s.benchmark.theirs} {s.benchmark.unit}
                  </div>
                )}
              </div>
            ))}
          </div>

          {result.fixes.length > 0 && (
            <div className="fixes">
              <div className="section-h">Top fixes</div>
              <ul>
                {result.fixes.map((f, i) => (
                  <li key={i}>
                    <strong>{f.issue}.</strong> {f.fix}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {trajectory.length > 0 && (
        <div className="fixes mt">
          <div className="section-h">Auto-improve history</div>
          <ul>
            {trajectory.map((t) => (
              <li key={t.iter}>
                <strong>{t.score}</strong> {t.delta !== "0" && <span className="muted">({t.delta})</span>} — {t.change}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function verdict(score: number): string {
  if (score >= 85) return "Strong — ship it.";
  if (score >= 70) return "Solid, a few tweaks.";
  if (score >= 50) return "Needs work.";
  return "Early draft.";
}

function Ring({ score }: { score: number }): JSX.Element {
  const r = 30;
  const c = 2 * Math.PI * r;
  const offset = c * (1 - Math.max(0, Math.min(100, score)) / 100);
  return (
    <svg width={76} height={76} viewBox="0 0 76 76" className="ring">
      <circle cx={38} cy={38} r={r} className="ring-bg" />
      <circle
        cx={38}
        cy={38}
        r={r}
        className="ring-fg"
        strokeDasharray={c}
        strokeDashoffset={offset}
        transform="rotate(-90 38 38)"
      />
      <text x={38} y={44} textAnchor="middle" className="ring-num">
        {score}
      </text>
    </svg>
  );
}
