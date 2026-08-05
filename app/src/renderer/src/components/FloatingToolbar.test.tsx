import { afterEach, describe, expect, it } from "vitest";
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
import { parseEdl, type Edl } from "@reel/edl";
import { FloatingToolbar } from "./FloatingToolbar";
import { useEditor } from "../store";

afterEach(cleanup);

describe("FloatingToolbar", () => {
  it("renders the four theme tools when nothing is selected", () => {
    const edl = parseEdl({ tracks: [{ id: "v", type: "video", clips: [] }] }).edl!;
    useEditor.setState({ edl, slug: "demo", selectedClipId: null });
    render(<FloatingToolbar />);
    for (const label of ["Alignment", "Typeface", "Padding", "Color"]) {
      expect(screen.getByLabelText(label)).toBeInTheDocument();
    }
  });

  // Regression: an EDL parsed by an older schema (no theme.textAlignment, e.g.
  // a stale main process across a renderer hot-reload) must not crash the app.
  it("tolerates an EDL without theme.textAlignment", () => {
    const edl = parseEdl({ tracks: [{ id: "v", type: "video", clips: [] }] }).edl!;
    delete (edl.theme as Partial<Edl["theme"]>).textAlignment;
    useEditor.setState({ edl, slug: "demo", selectedClipId: null });
    render(<FloatingToolbar />);
    fireEvent.click(screen.getByLabelText("Alignment"));
    expect(screen.getByText("Alignment", { selector: ".ftb-pop-title" })).toBeInTheDocument();
  });

  it("hex color field is typeable and commits only a complete hex on blur", () => {
    const edl = parseEdl({ tracks: [{ id: "v", type: "video", clips: [] }] }).edl!;
    useEditor.setState({ edl, slug: "demo", selectedClipId: null });
    render(<FloatingToolbar />);
    fireEvent.click(screen.getByLabelText("Color"));
    const input = screen.getByLabelText("Text color") as HTMLInputElement;

    // Intermediate keystrokes stay in the field (old behavior reverted them).
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "#E8" } });
    expect(input.value).toBe("#E8");
    // Incomplete hex on blur reverts, no store write.
    fireEvent.blur(input);
    expect(useEditor.getState().edl?.theme.palette[0]).toBe(edl.theme.palette[0]);

    // A complete hex commits on blur.
    fireEvent.focus(input);
    fireEvent.change(input, { target: { value: "#123456" } });
    fireEvent.blur(input);
    expect(useEditor.getState().edl?.theme.palette[0]).toBe("#123456");
  });

  it("selecting a text clip swaps to clip tools; number field commits on blur only", () => {
    const edl = parseEdl({
      tracks: [{ id: "t", type: "text", clips: [{ id: "t1", start: 1, end: 3, text: "hi" }] }],
    }).edl!;
    act(() => useEditor.setState({ edl, slug: "demo", selectedClipId: "t1" }));
    render(<FloatingToolbar />);

    expect(screen.getByLabelText("Back to project design")).toBeInTheDocument();
    fireEvent.click(screen.getByLabelText("Timing"));
    const start = screen.getByLabelText("Start (s)") as HTMLInputElement;

    // Clearing the field must not write 0 to the clip.
    fireEvent.focus(start);
    fireEvent.change(start, { target: { value: "" } });
    expect(findStart()).toBe(1);
    // Blur with empty reverts to the prior value.
    fireEvent.blur(start);
    expect(findStart()).toBe(1);

    // A real value commits on blur.
    fireEvent.focus(start);
    fireEvent.change(start, { target: { value: "2.5" } });
    fireEvent.blur(start);
    expect(findStart()).toBe(2.5);

    function findStart(): number | undefined {
      const t = useEditor.getState().edl?.tracks.find((tr) => tr.type === "text");
      return t?.type === "text" ? t.clips[0]?.start : undefined;
    }
  });

  it("the deselect button returns to the theme scope", () => {
    const edl = parseEdl({
      tracks: [{ id: "t", type: "text", clips: [{ id: "t1", start: 1, end: 3, text: "hi" }] }],
    }).edl!;
    act(() => useEditor.setState({ edl, slug: "demo", selectedClipId: "t1" }));
    render(<FloatingToolbar />);
    fireEvent.click(screen.getByLabelText("Back to project design"));
    expect(useEditor.getState().selectedClipId).toBeNull();
  });
});
