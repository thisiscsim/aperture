import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseEdl } from "@reel/edl";
import { _dropPendingSave, useEditor } from "./store";

const edl = parseEdl({ tracks: [{ id: "v", type: "video", clips: [] }] }).edl!;

beforeEach(() => {
  vi.clearAllMocks();
  _dropPendingSave();
  useEditor.setState({ view: "home", slug: null, edl: null, dirty: false, saveError: null, notices: [] });
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
      panelTab: "assets",
      session: { version: 1, turns: [] },
    });
    useEditor.getState().enterProject({ edl, slug: "demo", promptText: "hi" });
    expect(useEditor.getState()).toMatchObject({
      view: "editor",
      slug: "demo",
      promptText: "hi",
      selectedClipId: null,
      currentFrame: 0,
      panelTab: "create",
      session: null,
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
    const ns = useEditor.getState().notices;
    expect(ns[ns.length - 1]?.kind).toBe("error");
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

describe("submitCreate (session orchestration)", () => {
  const settings = {
    mode: "generation" as const,
    effort: "high" as const,
    fastMode: false,
    aspect: "9:16" as const,
    durationSec: 12,
    referenceMode: "literal" as const,
  };

  it("logs user + assistant turns, runs generation, and completes the turn", async () => {
    vi.mocked(window.api.generateProject).mockResolvedValue({ ok: true });
    vi.mocked(window.api.saveSession).mockResolvedValue({ ok: true });
    useEditor.setState({
      edl,
      slug: "demo",
      view: "editor",
      session: { version: 1, turns: [] },
      sessionBusy: false,
      reloadProject: () => {},
    });

    await useEditor.getState().submitCreate({ text: "make it dreamy", settings });

    const { session, sessionBusy, generating } = useEditor.getState();
    expect(sessionBusy).toBe(false);
    expect(generating).toBe(false);
    expect(session?.turns).toHaveLength(2);
    expect(session?.turns[0]).toMatchObject({ role: "user", text: "make it dreamy" });
    const assistant = session?.turns[1];
    expect(assistant?.role === "assistant" && assistant.pending).toBe(false);
    // The empty EDL has no cut, so the first run is a fresh build (no adjust).
    expect(window.api.generateProject).toHaveBeenCalledWith(
      "demo",
      expect.objectContaining({ durationSec: 12, effort: "high" }),
    );
    expect(vi.mocked(window.api.generateProject).mock.calls[0][1]?.adjust).toBeUndefined();
    expect(window.api.saveSession).toHaveBeenCalled();
  });

  it("records a failed run as an error status on the assistant turn", async () => {
    vi.mocked(window.api.generateProject).mockResolvedValue({ ok: false, error: "no clips" });
    vi.mocked(window.api.saveSession).mockResolvedValue({ ok: true });
    useEditor.setState({
      edl,
      slug: "demo",
      view: "editor",
      session: { version: 1, turns: [] },
      sessionBusy: false,
      reloadProject: () => {},
    });

    await useEditor.getState().submitCreate({ text: "go", settings });

    const assistant = useEditor.getState().session?.turns[1];
    if (assistant?.role !== "assistant") throw new Error("expected assistant turn");
    expect(assistant.pending).toBe(false);
    expect(assistant.items.at(-1)).toMatchObject({ type: "status", icon: "error", label: "no clips" });
  });

  it("passes adjust + notes when a cut already exists", async () => {
    const cutEdl = parseEdl({
      tracks: [{ id: "v", type: "video", clips: [{ id: "c1", assetId: "a", start: 0, in: 0, out: 4 }] }],
    }).edl!;
    vi.mocked(window.api.generateProject).mockResolvedValue({ ok: true });
    vi.mocked(window.api.saveSession).mockResolvedValue({ ok: true });
    useEditor.setState({
      edl: cutEdl,
      slug: "demo",
      view: "editor",
      session: { version: 1, turns: [] },
      sessionBusy: false,
      reloadProject: () => {},
    });

    await useEditor.getState().submitCreate({ text: "tighter hook", settings });

    expect(window.api.generateProject).toHaveBeenCalledWith(
      "demo",
      expect.objectContaining({ adjust: true, notes: "tighter hook" }),
    );
  });
});
