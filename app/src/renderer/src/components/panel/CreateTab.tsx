import { useEffect, useRef, useState } from "react";
import type { SessionAttachment, SessionItem, SessionTurn } from "@reel/edl";
import { useEditor } from "../../store";
import { DEFAULT_COMPOSER_SETTINGS, type ComposerSettings } from "../../lib/composer";
import { pathsFrom } from "../../lib/files";
import { Composer, type ComposerReference } from "../composer/Composer";
import { Button, Icon, ShaderOrb, Thumbnail, type IconName } from "../ui";

const STATUS_ICONS: Record<string, IconName> = {
  thinking: "slide-add",
  generated: "clapboard-sparkle",
  critiqued: "checkmark",
  benchmarks: "multi-media",
  error: "circle-questionmark",
};

/**
 * The Create tab (Figma "Generated the first cut" / critique flow frames):
 * the per-project conversation with the agent. Turns live in session.json via
 * the store; the composer routes each submit into a generation or critique run.
 */
export function CreateTab(): JSX.Element {
  const slug = useEditor((s) => s.slug);
  const session = useEditor((s) => s.session);
  const sessionBusy = useEditor((s) => s.sessionBusy);
  const loadSession = useEditor((s) => s.loadSession);
  const submitCreate = useEditor((s) => s.submitCreate);
  const pushNotice = useEditor((s) => s.pushNotice);
  const promptText = useEditor((s) => s.promptText);
  const hasClips = useEditor((s) =>
    Boolean(s.edl?.assets.some((a) => a.kind === "video" || a.kind === "image")),
  );
  const [text, setText] = useState("");
  const [settings, setSettings] = useState<ComposerSettings>(DEFAULT_COMPOSER_SETTINGS);
  const [references, setReferences] = useState<string[]>([]);
  /** Benchmark files imported while composing the next critique turn. */
  const [pendingBenchmarks, setPendingBenchmarks] = useState<string[]>([]);
  const [benchBusy, setBenchBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (session === null) void loadSession();
  }, [session, loadSession]);

  // Seed the composer with prompt.md on a fresh project (no turns yet), so the
  // zero-state prompt (or a hand-written prompt.md) is one Enter away.
  useEffect(() => {
    if (session && session.turns.length === 0 && promptText && text === "") setText(promptText);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- seed once per session load
  }, [session]);

  const refreshReferences = () => {
    if (!slug) return;
    window.api
      .listReferences(slug)
      .then(setReferences)
      .catch(() => {});
  };
  useEffect(refreshReferences, [slug]);

  // Auto-stick to the newest turn while a run streams.
  useEffect(() => {
    const el = logRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [session, sessionBusy]);

  const addReferences = async (files: File[]) => {
    if (!slug) return;
    const paths = pathsFrom(files);
    if (paths.length === 0) return;
    await window.api.importReferences(slug, paths);
    refreshReferences();
    // References auto-attach to the prompt as @mentions.
    setText((prev) => {
      const mentions = files.map((f) => `@${f.name}`).join(" ");
      return prev.trim() ? `${prev.trimEnd()} ${mentions}` : mentions;
    });
  };

  const addBenchmarks = async (files: File[]) => {
    if (!slug || benchBusy) return;
    const paths = pathsFrom(files);
    if (paths.length === 0) return;
    setBenchBusy(true);
    try {
      const res = await window.api.importBenchmarks(slug, paths);
      if (res.ok && res.files.length > 0) {
        setPendingBenchmarks((prev) => [...prev, ...res.files.filter((f) => !prev.includes(f))]);
        // Feature extraction so the critique scores against these immediately.
        await window.api.analyzeBenchmarks(slug);
      } else if (!res.ok) {
        pushNotice("error", `Couldn't import benchmarks: ${res.error ?? "unknown error"}`);
      }
    } finally {
      setBenchBusy(false);
    }
  };

  const fetchBenchmarkUrl = async (url: string) => {
    if (!slug || benchBusy) return;
    setBenchBusy(true);
    try {
      const res = await window.api.benchmarkFromUrl(slug, url);
      if (res.ok && res.files.length > 0) {
        setPendingBenchmarks((prev) => [...prev, ...res.files.filter((f) => !prev.includes(f))]);
        await window.api.analyzeBenchmarks(slug);
      } else {
        pushNotice("error", `Couldn't fetch the video: ${res.error ?? "unknown error"}`);
      }
    } finally {
      setBenchBusy(false);
    }
  };

  const submit = () => {
    if (!text.trim() || sessionBusy || benchBusy) return;
    const trimmed = text.trim();
    // In critique mode a pasted link fetches the benchmark video instead of
    // running a turn — "paste a link and Aperture finds the related video".
    if (settings.mode === "critique" && /^https?:\/\/\S+$/i.test(trimmed)) {
      void fetchBenchmarkUrl(trimmed);
      setText("");
      return;
    }
    const attachments: SessionAttachment[] = [
      ...references.map((file): SessionAttachment => ({
        kind: "reference",
        name: file,
        src: `references/${file}`,
      })),
      ...pendingBenchmarks.map((file): SessionAttachment => ({
        kind: "benchmark",
        name: file,
        src: `benchmarks/${file}`,
      })),
    ];
    void submitCreate({ text: trimmed, settings, attachments });
    setText("");
    setPendingBenchmarks([]);
  };

  const composerRefs: ComposerReference[] = references.map((file) => ({
    id: file,
    name: file,
    thumb: null,
  }));

  // "X has joined the session" separators fire when the acting agent changes.
  const agentBefore = (index: number): "generation" | "critique" | null => {
    for (let i = index - 1; i >= 0; i--) {
      const t = session?.turns[i];
      if (t?.role === "assistant") return t.agent;
    }
    return null;
  };

  return (
    <div className="create-tab">
      <div className="create-log" ref={logRef}>
        {session?.turns.length === 0 && (
          <p className="create-empty">
            Describe the video you want — the agent builds the first cut from your clips, prompt, and
            references.
          </p>
        )}
        {session?.turns.map((turn, i) => (
          <Turn
            key={i}
            turn={turn}
            turnIndex={i}
            slug={slug}
            joined={
              turn.role === "assistant" && agentBefore(i) !== null && agentBefore(i) !== turn.agent
                ? turn.agent
                : null
            }
          />
        ))}
      </div>
      <div className="create-composer">
        {benchBusy && (
          <div className="create-status" style={{ padding: "0 4px 8px" }}>
            <ShaderOrb type="critique" size={14} spinning />
            <span>Fetching benchmark…</span>
          </div>
        )}
        <Composer
          value={text}
          onValueChange={setText}
          settings={settings}
          onSettingsChange={setSettings}
          references={composerRefs}
          onAddReferences={(files) => void addReferences(files)}
          onRemoveReference={(id) => {
            if (!slug) return;
            void window.api.removeReference(slug, id).then(refreshReferences);
          }}
          onAddBenchmarks={(files) => void addBenchmarks(files)}
          onSubmit={submit}
          busy={sessionBusy}
          canSubmit={text.trim().length > 0 && (settings.mode === "critique" || hasClips)}
          placeholder={hasClips ? "Describe the video you want to make…" : "Add clips first (Assets tab)…"}
        />
      </div>
    </div>
  );
}

function Turn({
  turn,
  turnIndex,
  slug,
  joined,
}: {
  turn: SessionTurn;
  turnIndex: number;
  slug: string | null;
  joined: "generation" | "critique" | null;
}): JSX.Element {
  if (turn.role === "user") {
    return (
      <div className="create-user">
        <div className="create-bubble">{turn.text}</div>
        {turn.attachments.length > 0 && (
          <div className="create-thumbs create-thumbs-user">
            {turn.attachments.map((a) => (
              <Thumbnail
                key={a.name}
                src={slug && a.src ? `reel-asset://${slug}/${a.src}` : null}
                size={48}
              />
            ))}
          </div>
        )}
      </div>
    );
  }
  return (
    <>
      {joined && (
        <div className="create-joined">
          <span className="create-joined-line" />
          <span className="create-joined-label">
            <ShaderOrb type={joined} size={12} />
            {joined === "critique" ? "Critique has joined the session" : "Generation has joined the session"}
          </span>
          <span className="create-joined-line" />
        </div>
      )}
      <div className="create-assistant">
        {turn.items.map((item, i) => (
          <TurnItem key={i} item={item} itemIndex={i} turnIndex={turnIndex} slug={slug} />
        ))}
        {turn.pending && turn.items.length === 0 && (
          <div className="create-status">
            <ShaderOrb type={turn.agent} size={16} spinning />
            <span>Thinking…</span>
          </div>
        )}
      </div>
    </>
  );
}

function TurnItem({
  item,
  itemIndex,
  turnIndex,
  slug,
}: {
  item: SessionItem;
  itemIndex: number;
  turnIndex: number;
  slug: string | null;
}): JSX.Element | null {
  const sessionBusy = useEditor((s) => s.sessionBusy);
  const applyCritiqueFixes = useEditor((s) => s.applyCritiqueFixes);
  switch (item.type) {
    case "text":
      return <p className="create-text">{item.text}</p>;
    case "status":
      return (
        <div className={`create-status ${item.icon === "error" ? "error" : ""}`}>
          <Icon name={STATUS_ICONS[item.icon] ?? "slide-add"} size={16} />
          <span>{item.label}</span>
        </div>
      );
    case "thumbnails":
      return (
        <div className="create-thumbs">
          {item.srcs.map((src) => (
            <Thumbnail key={src} src={slug ? `reel-asset://${slug}/${src}` : null} size={64} />
          ))}
        </div>
      );
    case "critique-card":
      return (
        <div className="create-critique">
          <div className="create-critique-head">
            <span className="create-critique-score">{Math.round(item.score)}</span>
            <span className="create-critique-verdict">{item.verdict || "Critique complete."}</span>
          </div>
          {item.subscores.length > 0 && (
            <div className="create-critique-bars">
              {item.subscores.map((sub) => (
                <div key={sub.label} className="create-critique-bar">
                  <div className="create-critique-bar-meta">
                    <span>{sub.label}</span>
                    <span>{Math.round(sub.value)}%</span>
                  </div>
                  <div className="create-critique-track">
                    <div className="create-critique-fill" style={{ width: `${sub.value}%` }} />
                  </div>
                </div>
              ))}
            </div>
          )}
          {item.fixes.length > 0 && (
            <ul className="create-critique-fixes">
              {item.fixes.slice(0, 5).map((fix, i) => (
                <li key={i}>{fix}</li>
              ))}
            </ul>
          )}
          {item.fixes.length > 0 && (
            <div className="create-critique-apply">
              <span className="create-critique-apply-title">Apply the suggested changes</span>
              <span className="create-critique-apply-sub">
                Auto-tune re-edits the cut around the top fixes and logs the result.
              </span>
              <Button
                variant="primary"
                size="md"
                disabled={sessionBusy || item.applied}
                onClick={() => void applyCritiqueFixes(turnIndex, itemIndex)}
                style={{ width: "100%" }}
              >
                {item.applied ? "Changes applied" : "Apply changes"}
              </Button>
            </div>
          )}
        </div>
      );
    default: {
      const exhaustive: never = item;
      return exhaustive;
    }
  }
}
