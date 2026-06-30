import { useEffect, useState } from "react";
import { useEditor } from "../store";
import { ThemeToggle } from "./ThemeToggle";

export function TopBar(): JSX.Element {
  const [genMode, setGenMode] = useState<{ mode: "llm" | "baseline"; provider: string; model: string }>({
    mode: "baseline",
    provider: "openai",
    model: "gpt-5.5",
  });
  useEffect(() => {
    window.api?.generateMode().then(setGenMode).catch(() => {});
  }, []);

  const edl = useEditor((s) => s.edl);
  const slug = useEditor((s) => s.slug);
  const exporting = useEditor((s) => s.exporting);
  const generating = useEditor((s) => s.generating);
  const setRightTab = useEditor((s) => s.setRightTab);
  const startExport = useEditor((s) => s.startExport);
  const setExportProgress = useEditor((s) => s.setExportProgress);
  const setExportPhase = useEditor((s) => s.setExportPhase);
  const finishExport = useEditor((s) => s.finishExport);
  const setGenerating = useEditor((s) => s.setGenerating);
  const autotuning = useEditor((s) => s.autotuning);
  const setAutotuning = useEditor((s) => s.setAutotuning);
  const reloadProject = useEditor((s) => s.reloadProject);
  const goHome = useEditor((s) => s.goHome);
  const setNotice = useEditor((s) => s.setNotice);

  const onGenerate = async () => {
    if (!slug || generating) return;
    setGenerating(true);
    setNotice(null);
    try {
      const res = await window.api.generateProject(slug);
      reloadProject();
      if (res.ok) {
        setNotice({ kind: "info", text: genMode.mode === "llm" ? `Generated with ${genMode.model}.` : "Assembled a baseline cut." });
      } else {
        setNotice({ kind: "error", text: `Generate failed: ${res.error ?? "unknown error"}` });
      }
    } catch (err) {
      setNotice({ kind: "error", text: `Generate failed: ${String(err)}` });
    } finally {
      setGenerating(false);
    }
  };

  const onAutoTune = async () => {
    if (!slug || autotuning) return;
    setAutotuning(true);
    setNotice(null);
    try {
      const res = await window.api.autoTune(slug);
      reloadProject();
      setRightTab("critique");
      if (!res.ok) setNotice({ kind: "error", text: `Auto-improve failed: ${res.error ?? "unknown error"}` });
    } catch (err) {
      setNotice({ kind: "error", text: `Auto-improve failed: ${String(err)}` });
    } finally {
      setAutotuning(false);
    }
  };

  const onExport = async () => {
    if (!slug || exporting) return;
    startExport();
    const offProgress = window.api.onExportProgress(setExportProgress);
    const offPhase = window.api.onExportPhase(setExportPhase);
    try {
      const res = await window.api.exportProject(slug);
      finishExport(res);
    } finally {
      offProgress();
      offPhase();
    }
  };

  return (
    <header className="topbar">
      <div className="topbar-left">
        <button className="logo logo-btn" onClick={goHome} title="Back to projects">
          Aperture
        </button>
        {slug && (
          <>
            <span className="dot" />
            <span className="proj">{slug}</span>
          </>
        )}
        {edl && (
          <span className="badge">
            {edl.format.width}&times;{edl.format.height} &middot; {edl.format.fps}fps
          </span>
        )}
      </div>
      <div className="topbar-right">
        <ThemeToggle />
        <button
          className="btn"
          onClick={onGenerate}
          disabled={generating || !edl}
          title={
            genMode.mode === "llm"
              ? `Generate a real cut with ${genMode.model} from your prompt + style`
              : "Assemble a baseline cut. Set OPENAI_API_KEY for AI-driven generation."
          }
        >
          {generating ? "Generating…" : genMode.mode === "llm" ? `Generate (${shortModel(genMode.model)})` : "Generate"}
        </button>
        <button
          className="btn"
          onClick={onAutoTune}
          disabled={autotuning || !edl}
          title="Iteratively improve the cut against best practices and your benchmarks"
        >
          {autotuning ? "Improving…" : "Auto-improve"}
        </button>
        <button className="btn" onClick={() => setRightTab("critique")}>
          Critique
        </button>
        <button className="btn btn-primary" onClick={onExport} disabled={exporting || !edl}>
          {exporting ? "Exporting…" : "Export"}
        </button>
      </div>
    </header>
  );
}

// Keep the button compact: "gpt-5.5" -> "GPT-5.5", strip long deployment names.
function shortModel(model: string): string {
  const base = model.split("/").pop() ?? model;
  return base.length > 14 ? "AI" : base.toUpperCase();
}
