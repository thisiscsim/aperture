import { useEffect } from "react";
import { TopBar } from "./components/TopBar";
import { LeftPanel } from "./components/LeftPanel";
import { Preview } from "./components/Preview";
import { RightPanel } from "./components/RightPanel";
import { Timeline } from "./components/Timeline";
import { ExportModal } from "./components/ExportModal";
import { Home } from "./components/Home";
import { useEditor } from "./store";

export function App(): JSX.Element {
  const view = useEditor((s) => s.view);
  const slug = useEditor((s) => s.slug);
  const edl = useEditor((s) => s.edl);
  const loadError = useEditor((s) => s.loadError);
  const notice = useEditor((s) => s.notice);
  const setNotice = useEditor((s) => s.setNotice);
  const setProject = useEditor((s) => s.setProject);
  const setLoadError = useEditor((s) => s.setLoadError);
  const setReload = useEditor((s) => s.setReload);

  // Load (and live-reload) the active project whenever we enter the editor.
  useEffect(() => {
    if (view !== "editor" || !slug) return;

    const load = () => {
      window.api
        ?.loadProject(slug)
        .then((res) => {
          if (res.ok && res.edl) {
            setProject({ edl: res.edl, slug: res.slug, dir: res.dir, promptText: res.promptText, meta: res.meta });
          } else {
            setLoadError((res.errors ?? ["unknown error"]).join("; "));
          }
        })
        .catch((err) => setLoadError(String(err)));
    };
    setReload(load);
    load();

    void window.api?.watchProject(slug);
    const off = window.api?.onProjectChanged((changed) => {
      if (changed === slug) load();
    });
    return () => off?.();
  }, [view, slug, setProject, setLoadError, setReload]);

  return (
    <>
      {view === "home" ? (
        <Home />
      ) : (
        <div className="editor">
          <TopBar />
          <LeftPanel />
          <Preview />
          <RightPanel />
          <Timeline />
          <ExportModal />
          {!edl && (
            <div className="boot">
              {loadError ? `Could not load project: ${loadError}` : "Loading project…"}
            </div>
          )}
        </div>
      )}
      {notice && <Toast notice={notice} onClose={() => setNotice(null)} />}
    </>
  );
}

function Toast({
  notice,
  onClose,
}: {
  notice: { kind: "error" | "info"; text: string };
  onClose: () => void;
}): JSX.Element {
  useEffect(() => {
    const t = setTimeout(onClose, 8000);
    return () => clearTimeout(t);
  }, [onClose]);
  return (
    <div className={`toast toast-${notice.kind}`} onClick={onClose}>
      {notice.text}
    </div>
  );
}
