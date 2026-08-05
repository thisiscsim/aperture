import { useEditor } from "../store";
import { SettingsButton } from "./SettingsModal";
import { Button, Icon } from "./ui";

export function EditorHeader(): JSX.Element {
  const edl = useEditor((s) => s.edl);
  const slug = useEditor((s) => s.slug);
  const meta = useEditor((s) => s.meta);
  const exporting = useEditor((s) => s.exporting);
  const startExport = useEditor((s) => s.startExport);
  const setExportProgress = useEditor((s) => s.setExportProgress);
  const setExportPhase = useEditor((s) => s.setExportPhase);
  const finishExport = useEditor((s) => s.finishExport);
  const goHome = useEditor((s) => s.goHome);
  const saveError = useEditor((s) => s.saveError);

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

  const title = meta?.title || slug || "Untitled";

  return (
    <header className="editor-header">
      <div className="editor-header-left">
        <button className="brand" onClick={goHome} title="Back to projects">
          <Icon name="aperture-logomark" size={20} />
          <span className="home-wordmark">Aperture</span>
        </button>
      </div>

      <div className="editor-header-title">
        <span>
          {title}
          <span className="ext">.aperture</span>
        </span>
        {saveError && (
          <span className="save-state error" title={saveError} role="status">
            Not saved
          </span>
        )}
      </div>

      <div className="editor-header-actions">
        <SettingsButton labeled />
        <span className="editor-divider" />
        <Button variant="tertiary" size="md" icon="share-os" onClick={onExport} disabled={exporting || !edl}>
          {exporting ? "Exporting…" : "Share"}
        </Button>
      </div>
    </header>
  );
}
