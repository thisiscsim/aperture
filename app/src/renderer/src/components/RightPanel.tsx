import { useEditor, type RightTab } from "../store";
import { Inspector } from "./Inspector";
import { DesignPanel } from "./DesignPanel";
import { CritiquePanel } from "./CritiquePanel";

const TABS: { id: RightTab; label: string }[] = [
  { id: "inspector", label: "Inspector" },
  { id: "design", label: "Design" },
  { id: "critique", label: "Critique" },
];

export function RightPanel(): JSX.Element {
  const tab = useEditor((s) => s.rightTab);
  const setTab = useEditor((s) => s.setRightTab);

  return (
    <aside className="panel right">
      <div className="tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            className={`tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      <div className="tab-body">
        {tab === "inspector" && <Inspector />}
        {tab === "design" && <DesignPanel />}
        {tab === "critique" && <CritiquePanel />}
      </div>
    </aside>
  );
}
