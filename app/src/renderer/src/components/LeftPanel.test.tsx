import { afterEach, describe, expect, it } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { parseEdl } from "@reel/edl";
import { LeftPanel } from "./LeftPanel";
import { useEditor } from "../store";

afterEach(cleanup);

describe("LeftPanel", () => {
  it("renders an empty aside before a project loads", () => {
    useEditor.setState({ edl: null, slug: null });
    const { container } = render(<LeftPanel />);
    expect(container.querySelector(".panel.left")).toBeInTheDocument();
  });

  // Regression guard for the rules-of-hooks crash: rendering with a loaded EDL
  // (edl null -> set) must not throw or blank the app.
  it("mounts without crashing once an EDL is loaded", () => {
    const edl = parseEdl({ tracks: [{ id: "v", type: "video", clips: [] }] }).edl!;
    useEditor.setState({ edl, slug: "demo", promptText: "" });
    render(<LeftPanel />);
    expect(screen.getByPlaceholderText(/Describe the video you want/i)).toBeInTheDocument();
    expect(screen.getByText("Clips")).toBeInTheDocument();
  });
});
