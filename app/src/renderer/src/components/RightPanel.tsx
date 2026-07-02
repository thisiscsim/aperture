import { useEditor, type RightTab } from "../store";
import { Inspector } from "./Inspector";
import { DesignPanel } from "./DesignPanel";
import { StylePanel } from "./StylePanel";
import { CritiquePanel } from "./CritiquePanel";

const TABS: { id: RightTab; label: string }[] = [
  { id: "inspector", label: "Inspector" },
  { id: "style", label: "Style" },
  { id: "critique", label: "Critique" },
];

export function RightPanel(): JSX.Element {
  const tab = useEditor((s) => s.rightTab);
  const setTab = useEditor((s) => s.setRightTab);
  const selectedClipId = useEditor((s) => s.selectedClipId);

  return (
    <aside className="right-panel">
      <div className="rp-tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`rp-tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="rp-body">
        {/* Combined tab: project Design settings by default, the clip inspector
            when something is selected. The full subflow chrome (Back header,
            Design+Format restyle) lands in editor Phase 2. */}
        {tab === "inspector" && (selectedClipId ? <Inspector /> : <DesignPanel />)}
        {tab === "style" && <StylePanel />}
        {tab === "critique" && <CritiquePanel />}
      </div>
    </aside>
  );
}
