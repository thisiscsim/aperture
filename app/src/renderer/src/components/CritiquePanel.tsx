import { useEffect, useState } from "react";
import { useEditor } from "../store";
import { critiqueEdl, type Critique } from "../lib/critique";

export function CritiquePanel(): JSX.Element {
  const edl = useEditor((s) => s.edl);
  const slug = useEditor((s) => s.slug);
  const [result, setResult] = useState<Critique | null>(null);
  const [source, setSource] = useState<"agent" | "heuristic">("heuristic");

  // Prefer an agent-authored critique.json (written by the /critique-video skill).
  useEffect(() => {
    if (!slug) return;
    window.api
      ?.loadCritique(slug)
      .then((c) => {
        if (c && typeof c === "object" && "score" in c) {
          setResult(c as Critique);
          setSource("agent");
        }
      })
      .catch(() => {});
  }, [slug]);

  if (!edl) return <div />;

  return (
    <div className="pad">
      <button
        className="btn btn-primary full"
        onClick={() => {
          setResult(critiqueEdl(edl));
          setSource("heuristic");
        }}
      >
        {result ? "Re-run heuristic" : "Run critique"}
      </button>

      {!result && (
        <p className="muted small mt">
          Heuristic best-practices score &mdash; not a virality prediction. For a richer read, the
          agent writes <code>critique.json</code> via the <code>/critique-video</code> skill.
        </p>
      )}

      {result && (
        <div className="critique">
          <div className="critique-head">
            <Ring score={result.score} />
            <div>
              <div className="critique-score-label">Overall</div>
              <div className="muted small">{verdict(result.score)}</div>
              <div className="muted small">{source === "agent" ? "Agent critique" : "Heuristic"}</div>
            </div>
          </div>

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
