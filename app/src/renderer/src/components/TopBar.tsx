import { useEditor } from "../store";

export function TopBar(): JSX.Element {
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
  const reloadProject = useEditor((s) => s.reloadProject);

  const onGenerate = async () => {
    if (!slug || generating) return;
    setGenerating(true);
    try {
      const res = await window.api.generateProject(slug);
      if (res.ok) reloadProject();
    } finally {
      setGenerating(false);
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
        <span className="logo">Reel Studio</span>
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
        <button
          className="btn"
          onClick={onGenerate}
          disabled={generating || !edl}
          title="Assemble a first cut from the clips in this project"
        >
          {generating ? "Generating…" : "Generate"}
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
