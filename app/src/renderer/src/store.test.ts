import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { parseEdl } from "@reel/edl";
import { useEditor } from "./store";

const edl = parseEdl({ tracks: [{ id: "v", type: "video", clips: [] }] }).edl!;

beforeEach(() => {
  vi.clearAllMocks();
  useEditor.setState({ view: "home", slug: null, edl: null });
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

describe("autosave", () => {
  it("debounces a save to disk after updateEdl", () => {
    vi.useFakeTimers();
    useEditor.setState({ edl, slug: "demo" });
    useEditor.getState().updateEdl((d) => (d.theme.fontFamily = "Inter"));
    expect(window.api.saveEdl).not.toHaveBeenCalled();
    vi.advanceTimersByTime(400);
    expect(window.api.saveEdl).toHaveBeenCalledTimes(1);
    expect(window.api.saveEdl).toHaveBeenCalledWith("demo", expect.objectContaining({ theme: expect.any(Object) }));
  });

  it("does not save when there is no slug", () => {
    vi.useFakeTimers();
    useEditor.setState({ edl, slug: null });
    useEditor.getState().updateEdl((d) => (d.theme.fontFamily = "Mono"));
    vi.advanceTimersByTime(400);
    expect(window.api.saveEdl).not.toHaveBeenCalled();
  });
});
