import { type CSSProperties, memo, useEffect } from "react";
import { EditorHeader } from "./components/EditorHeader";
import { LeftRail } from "./components/LeftRail";
import { PreviewStage } from "./components/PreviewStage";
import { RightPanel } from "./components/RightPanel";
import { Timeline } from "./components/Timeline";
import { ExportModal } from "./components/ExportModal";
import { Home } from "./components/Home";
import { cancelPendingSave, useEditor, type Notice, type PanelId } from "./store";

// The shell re-renders on panel resize, playback, notices, etc. These panels
// take no props and subscribe to the store themselves, so memoizing them keeps
// an App re-render (e.g. a per-pixel panel drag) from re-rendering all of them
// — most importantly the Remotion Player subtree inside PreviewStage.
const EditorHeaderM = memo(EditorHeader);
const LeftRailM = memo(LeftRail);
const PreviewStageM = memo(PreviewStage);
const RightPanelM = memo(RightPanel);
const TimelineM = memo(Timeline);

export function App(): JSX.Element {
  const view = useEditor((s) => s.view);
  const slug = useEditor((s) => s.slug);
  // Only the presence of an EDL matters here (the boot overlay); subscribing to
  // the whole object would re-render the shell on every keystroke.
  const hasEdl = useEditor((s) => s.edl !== null);
  const loadError = useEditor((s) => s.loadError);
  const notices = useEditor((s) => s.notices);
  const dismissNotice = useEditor((s) => s.dismissNotice);
  const setProject = useEditor((s) => s.setProject);
  const setLoadError = useEditor((s) => s.setLoadError);
  const setReload = useEditor((s) => s.setReload);
  const undoEdl = useEditor((s) => s.undoEdl);
  const redoEdl = useEditor((s) => s.redoEdl);
  const toggleTheme = useEditor((s) => s.toggleTheme);
  const panelSizes = useEditor((s) => s.panelSizes);
  const panelsHidden = useEditor((s) => s.panelsHidden);
  const togglePanels = useEditor((s) => s.togglePanels);
  const playerCtl = useEditor((s) => s.playerCtl);

  // Space toggles playback anywhere in the editor outside a text field —
  // including Cmd+\ focus mode, where the timeline (and its transport) is
  // unmounted.
  useEffect(() => {
    if (view !== "editor") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.code !== "Space") return;
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)
        return;
      e.preventDefault();
      playerCtl?.toggle();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, playerCtl]);

  // Cmd+\ — focus mode: hide rails + timeline, keep only the canvas (Figma-style).
  useEffect(() => {
    if (view !== "editor") return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "\\" && (e.metaKey || e.ctrlKey)) {
        e.preventDefault();
        togglePanels();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, togglePanels]);

  // 'T' toggles light/dark anywhere, unless the user is typing in a field.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key.toLowerCase() !== "t" || e.metaKey || e.ctrlKey || e.altKey || e.shiftKey) return;
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable)
        return;
      toggleTheme();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleTheme]);

  // Cmd+Z / Shift+Cmd+Z for EDL history. Text fields keep their native undo.
  useEffect(() => {
    if (view !== "editor") return;
    const onKey = (e: KeyboardEvent) => {
      if (!(e.metaKey || e.ctrlKey) || e.key.toLowerCase() !== "z") return;
      const t = e.target as HTMLElement;
      if (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable) return;
      e.preventDefault();
      if (e.shiftKey) redoEdl();
      else undoEdl();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [view, undoEdl, redoEdl]);

  // Load (and live-reload) the active project whenever we enter the editor.
  useEffect(() => {
    if (view !== "editor" || !slug) return;

    // Returns the load promise so busy flows (Generate/Auto-improve) can keep
    // their loading state up until the fresh cut is actually in the store.
    const load = () =>
      window.api
        ?.loadProject(slug)
        .then((res) => {
          if (res.ok && res.edl) {
            setProject({
              edl: res.edl,
              slug: res.slug,
              dir: res.dir,
              promptText: res.promptText,
              meta: res.meta,
            });
          } else {
            setLoadError((res.errors ?? ["unknown error"]).join("; "));
          }
        })
        .catch((err) => setLoadError(String(err)));
    setReload(load);
    // Home may have preloaded the project for a seamless view switch
    // (enterProject) — skip the redundant initial read in that case.
    const s = useEditor.getState();
    if (!(s.edl && s.slug === slug)) void load();

    void window.api?.watchProject(slug);
    const off = window.api?.onProjectChanged((changed) => {
      if (changed !== slug) return;
      // Drop any in-flight autosave immediately — before the async reload
      // lands — so it can't overwrite the newer file the agent just wrote.
      cancelPendingSave(slug);
      load();
    });
    return () => off?.();
  }, [view, slug, setProject, setLoadError, setReload]);

  return (
    <>
      {view === "home" ? (
        <Home />
      ) : (
        <div
          className={`editor-shell ${panelsHidden ? "panels-hidden" : ""}`}
          style={
            {
              "--left-rail-w": `${panelSizes.left}px`,
              "--right-panel-w": `${panelSizes.right}px`,
              "--tl-h": `${panelSizes.timeline}px`,
            } as CSSProperties
          }
        >
          <EditorHeaderM />
          <div className="editor-main">
            {!panelsHidden && (
              <>
                <LeftRailM />
                <PanelResizer panel="left" />
              </>
            )}
            <PreviewStageM />
            {!panelsHidden && (
              <>
                <PanelResizer panel="right" />
                <RightPanelM />
              </>
            )}
          </div>
          {!panelsHidden && (
            <>
              <PanelResizer panel="timeline" />
              <TimelineM />
            </>
          )}
          <ExportModal />
          {!hasEdl && (
            <div className="boot">
              {loadError ? `Could not load project: ${loadError}` : "Loading project…"}
            </div>
          )}
        </div>
      )}
      {notices.length > 0 && (
        <div className="toast-stack" role="region" aria-label="Notifications">
          {notices.map((n) => (
            <Toast key={n.id} notice={n} onClose={() => dismissNotice(n.id)} />
          ))}
        </div>
      )}
    </>
  );
}

/**
 * Slim drag handle between panels. Left/right resize widths, timeline resizes
 * height; all are clamped in the store (PANEL_LIMITS) and persisted.
 */
function PanelResizer({ panel }: { panel: PanelId }): JSX.Element {
  const setPanelSize = useEditor((s) => s.setPanelSize);
  const horizontal = panel === "timeline";

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    e.preventDefault();
    const startX = e.clientX;
    const startY = e.clientY;
    const start = useEditor.getState().panelSizes[panel];
    const el = e.currentTarget;
    el.classList.add("active");
    document.body.style.cursor = horizontal ? "row-resize" : "col-resize";

    // rAF-coalesce moves: a raw mousemove stream re-rendered the shell (and,
    // pre-memoization, every panel) plus wrote localStorage per pixel. Now at
    // most one store update per frame; localStorage is persisted once on mouseup.
    let raf = 0;
    let last = start;
    const apply = () => {
      raf = 0;
      setPanelSize(panel, last, false); // don't touch localStorage mid-drag
    };
    const onMove = (ev: MouseEvent) => {
      if (panel === "left") last = start + (ev.clientX - startX);
      else if (panel === "right") last = start - (ev.clientX - startX);
      else last = start - (ev.clientY - startY);
      if (!raf) raf = requestAnimationFrame(apply);
    };
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      if (raf) cancelAnimationFrame(raf);
      setPanelSize(panel, last); // persist once on release
      el.classList.remove("active");
      document.body.style.cursor = "";
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  return (
    <div
      className={`panel-resizer ${horizontal ? "horizontal" : "vertical"}`}
      onMouseDown={onMouseDown}
      role="separator"
      aria-orientation={horizontal ? "horizontal" : "vertical"}
    />
  );
}

function Toast({ notice, onClose }: { notice: Notice; onClose: () => void }): JSX.Element {
  // Errors persist until dismissed (they were vanishing after 8s with no
  // history); info auto-dismisses. Keyed on notice.id at the call site, so an
  // App re-render no longer restarts the timer (the old dismiss-never bug).
  useEffect(() => {
    if (notice.kind === "error") return;
    const t = setTimeout(onClose, 6000);
    return () => clearTimeout(t);
  }, [notice.kind, onClose]);
  return (
    <div className={`toast toast-${notice.kind}`} role={notice.kind === "error" ? "alert" : "status"}>
      <span className="toast-text">{notice.text}</span>
      <button className="toast-close" onClick={onClose} aria-label="Dismiss" title="Dismiss">
        ×
      </button>
    </div>
  );
}
