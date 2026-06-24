import { useEffect } from "react";
import { TopBar } from "./components/TopBar";
import { LeftPanel } from "./components/LeftPanel";
import { Preview } from "./components/Preview";
import { RightPanel } from "./components/RightPanel";
import { Timeline } from "./components/Timeline";
import { ExportModal } from "./components/ExportModal";
import { useEditor } from "./store";

const DEFAULT_SLUG = "japan-christmas";

export function App(): JSX.Element {
  const edl = useEditor((s) => s.edl);
  const loadError = useEditor((s) => s.loadError);
  const setProject = useEditor((s) => s.setProject);
  const setLoadError = useEditor((s) => s.setLoadError);
  const setReload = useEditor((s) => s.setReload);

  useEffect(() => {
    const load = () => {
      window.api
        ?.loadProject(DEFAULT_SLUG)
        .then((res) => {
          if (res.ok && res.edl) {
            setProject({ edl: res.edl, slug: res.slug, dir: res.dir, promptText: res.promptText });
          } else {
            setLoadError((res.errors ?? ["unknown error"]).join("; "));
          }
        })
        .catch((err) => setLoadError(String(err)));
    };
    setReload(load);
    load();
  }, [setProject, setLoadError, setReload]);

  return (
    <div className="editor">
      <TopBar />
      <LeftPanel />
      <Preview />
      <RightPanel />
      <Timeline />
      <ExportModal />
      {!edl && (
        <div className="boot">{loadError ? `Could not load project: ${loadError}` : "Loading project…"}</div>
      )}
    </div>
  );
}
