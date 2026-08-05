import { useEditor, type PanelTab } from "../../store";
import { AssetsTab } from "./AssetsTab";
import { CreateTab } from "./CreateTab";
import { ReferencesTab } from "./ReferencesTab";

const TABS: { id: PanelTab; label: string }[] = [
  { id: "create", label: "Create" },
  { id: "references", label: "References" },
  { id: "assets", label: "Assets" },
];

/** v1.5 right panel: the agent chat plus the project's media libraries. */
export function EditorPanel(): JSX.Element {
  const tab = useEditor((s) => s.panelTab);
  const setTab = useEditor((s) => s.setPanelTab);

  return (
    <aside className="right-panel">
      <div className="rp-tabs" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            role="tab"
            aria-selected={tab === t.id}
            className={`rp-tab ${tab === t.id ? "active" : ""}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>
      {tab === "create" ? (
        // CreateTab owns its scroll region (log scrolls, composer pins).
        <CreateTab />
      ) : (
        <div className="rp-body">
          {tab === "references" && <ReferencesTab />}
          {tab === "assets" && <AssetsTab />}
        </div>
      )}
    </aside>
  );
}
