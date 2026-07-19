import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseEdl } from "@reel/edl";
import { _dropPendingSave, useEditor } from "./store";

const edl = parseEdl({ tracks: [{ id: "v", type: "video", clips: [] }] }).edl!;

beforeEach(() => {
  vi.clearAllMocks();
  _dropPendingSave();
  useEditor.setState({ view: "home", slug: null, edl: null, dirty: false, saveError: null, notice: null });
});
afterEach(() => {
  vi.useRealTimers();
});

describe("view routing", () => {
  it("openProject enters the editor; goHome returns home", () => {
    useEditor.getState().openProject("demo");
    expect(useEditor.getState()).toMatchObject({ view: "editor", slug: "demo" });
    useEditor.getState().goHome();
    expect(useEditor.getState().view).toBe("home");
  });

  it("enterProject switches view with data loaded and editor state reset", () => {
    useEditor.setState({
      selectedClipId: "x",
      currentFrame: 42,
      edlPast: [edl],
      rightTab: "critique",
    });
    useEditor.getState().enterProject({ edl, slug: "demo", promptText: "hi" });
    expect(useEditor.getState()).toMatchObject({
      view: "editor",
      slug: "demo",
      promptText: "hi",
      selectedClipId: null,
      currentFrame: 0,
      rightTab: "inspector",
    });
    expect(useEditor.getState().edl).toBe(edl);
    expect(useEditor.getState().edlPast).toHaveLength(0);
  });
});

describe("theme", () => {
  it("toggleTheme flips the theme, sets the DOM attribute, and persists", () => {
    useEditor.setState({ theme: "dark" });
    useEditor.getState().toggleTheme();
    expect(useEditor.getState().theme).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("aperture:theme")).toBe("light");
  });
});

describe("edl history", () => {
  it("undo/redo walk the edit stack and persist each step", () => {
    vi.useFakeTimers();
    useEditor.setState({ edl, slug: "demo", edlPast: [], edlFuture: [] });
    const s = () => useEditor.getState();

    s().updateEdl((d) => (d.theme.fontFamily = "First"));
    s().updateEdl((d) => (d.theme.fontFamily = "Second"));
    expect(s().edl?.theme.fontFamily).toBe("Second");
    expect(s().edlPast).toHaveLength(2);

    s().undoEdl();
    expect(s().edl?.theme.fontFamily).toBe("First");
    s().undoEdl();
    expect(s().edl?.theme.fontFamily).toBe(edl.theme.fontFamily);
    expect(s().edlPast).toHaveLength(0);
    expect(s().edlFuture).toHaveLength(2);

    s().redoEdl();
    expect(s().edl?.theme.fontFamily).toBe("First");
    vi.advanceTimersByTime(400);
    expect(window.api.saveEdl).toHaveBeenCalled();
  });

  it("a new edit clears the redo stack; external load resets history", () => {
    useEditor.setState({ edl, slug: "demo", edlPast: [], edlFuture: [] });
    const s = () => useEditor.getState();
    s().updateEdl((d) => (d.theme.fontFamily = "A"));
    s().undoEdl();
    expect(s().edlFuture).toHaveLength(1);
    s().updateEdl((d) => (d.theme.fontFamily = "B"));
    expect(s().edlFuture).toHaveLength(0);

    s().setProject({ edl, slug: "demo" });
    expect(s().edlPast).toHaveLength(0);
    expect(s().edlFuture).toHaveLength(0);
  });
});

describe("panel layout", () => {
  it("clamps panel sizes to their limits and persists them", () => {
    const s = () => useEditor.getState();
    s().setPanelSize("left", 10_000);
    expect(s().panelSizes.left).toBe(440);
    s().setPanelSize("timeline", 10);
    expect(s().panelSizes.timeline).toBe(160);
    expect(JSON.parse(localStorage.getItem("aperture:panel-layout")!)).toMatchObject({
      left: 440,
      timeline: 160,
    });
  });

  it("togglePanels flips focus mode", () => {
    const s = () => useEditor.getState();
    const before = s().panelsHidden;
    s().togglePanels();
    expect(s().panelsHidden).toBe(!before);
    s().togglePanels();
    expect(s().panelsHidden).toBe(before);
  });
});

describe("autosave", () => {
  it("debounces a save to disk after updateEdl", () => {
    vi.useFakeTimers();
    useEditor.setState({ edl, slug: "demo" });
    useEditor.getState().updateEdl((d) => (d.theme.fontFamily = "Inter"));
    expect(window.api.saveEdl).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(window.api.saveEdl).toHaveBeenCalledTimes(1);
    expect(window.api.saveEdl).toHaveBeenCalledWith(
      "demo",
      expect.objectContaining({ theme: expect.any(Object) }),
    );
  });

  it("does not save when there is no slug", () => {
    vi.useFakeTimers();
    useEditor.setState({ edl, slug: null });
    useEditor.getState().updateEdl((d) => (d.theme.fontFamily = "Mono"));
    vi.advanceTimersByTime(400);
    expect(window.api.saveEdl).not.toHaveBeenCalled();
  });

  it("flushes the pending save when switching projects (no lost edit)", () => {
    vi.useFakeTimers();
    useEditor.setState({ edl, slug: "demo", view: "editor" });
    useEditor.getState().updateEdl((d) => (d.theme.fontFamily = "Edited"));
    // Switch before the 400 ms debounce fires: the edit must be written, not dropped.
    useEditor.getState().openProject("other");
    expect(window.api.saveEdl).toHaveBeenCalledTimes(1);
    expect(window.api.saveEdl).toHaveBeenCalledWith(
      "demo",
      expect.objectContaining({ theme: expect.objectContaining({ fontFamily: "Edited" }) }),
    );
  });

  it("goHome flushes the pending save", () => {
    vi.useFakeTimers();
    useEditor.setState({ edl, slug: "demo", view: "editor" });
    useEditor.getState().updateEdl((d) => (d.theme.fontFamily = "Edited"));
    useEditor.getState().goHome();
    expect(window.api.saveEdl).toHaveBeenCalledTimes(1);
  });

  it("drops the pending save when an external reload replaces the same project", () => {
    vi.useFakeTimers();
    useEditor.setState({ edl, slug: "demo", view: "editor" });
    useEditor.getState().updateEdl((d) => (d.theme.fontFamily = "Stale"));
    // Agent wrote edl.json; the watcher reload lands before the debounce fires.
    // The stale save must NOT overwrite the newer file.
    useEditor.getState().setProject({ edl, slug: "demo" });
    vi.advanceTimersByTime(1000);
    expect(window.api.saveEdl).not.toHaveBeenCalled();
    expect(useEditor.getState().dirty).toBe(false);
  });

  it("a failed save keeps the dirty flag and surfaces a persistent error", async () => {
    vi.useFakeTimers();
    vi.mocked(window.api.saveEdl).mockResolvedValueOnce({ ok: false, error: "disk full" });
    useEditor.setState({ edl, slug: "demo", view: "editor" });
    useEditor.getState().updateEdl((d) => (d.theme.fontFamily = "Unsaved"));
    expect(useEditor.getState().dirty).toBe(true);
    await vi.advanceTimersByTimeAsync(400);
    expect(useEditor.getState().dirty).toBe(true);
    expect(useEditor.getState().saveError).toBe("disk full");
    expect(useEditor.getState().notice?.kind).toBe("error");
  });

  it("a successful save clears the dirty flag", async () => {
    vi.useFakeTimers();
    vi.mocked(window.api.saveEdl).mockResolvedValueOnce({ ok: true });
    useEditor.setState({ edl, slug: "demo", view: "editor" });
    useEditor.getState().updateEdl((d) => (d.theme.fontFamily = "Saved"));
    await vi.advanceTimersByTimeAsync(400);
    expect(useEditor.getState().dirty).toBe(false);
    expect(useEditor.getState().saveError).toBeNull();
  });
});
