import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { parseEdl } from "@reel/edl";
import { HomeZero } from "./HomeZero";
import { useEditor } from "../store";

function freshEdl() {
  return parseEdl({ tracks: [{ id: "v", type: "video", clips: [] }] }).edl!;
}

beforeEach(() => {
  // jsdom has no object URLs; the zero state uses them for clip previews.
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
  useEditor.setState({ view: "home", projects: [] });
});

afterEach(() => {
  cleanup();
  vi.mocked(window.api.getPathForFile).mockReset();
  vi.mocked(window.api.createProject).mockReset();
  vi.mocked(window.api.importAssets).mockReset();
  vi.mocked(window.api.loadProject).mockReset();
  vi.mocked(window.api.saveEdl).mockReset();
  vi.mocked(window.api.generateProject).mockReset();
});

function stageClip(container: HTMLElement, name = "beach.mp4") {
  const input = container.querySelector<HTMLInputElement>('input[accept="video/*,image/*"]')!;
  fireEvent.change(input, { target: { files: [new File(["x"], name, { type: "video/mp4" })] } });
}

describe("HomeZero", () => {
  it("swaps the dropzone for the staged-clips grid after upload", async () => {
    vi.mocked(window.api.getPathForFile).mockImplementation((f: File) => `/picked/${f.name}`);
    const { container } = render(<HomeZero onCreated={() => {}} />);

    expect(screen.getByText("Drag and drop files here or click to upload")).toBeInTheDocument();
    stageClip(container);

    await waitFor(() =>
      expect(screen.queryByText("Drag and drop files here or click to upload")).not.toBeInTheDocument(),
    );
    expect(screen.getByLabelText("Remove beach.mp4")).toBeInTheDocument();
  });

  it("submit scaffolds the project, imports clips, stamps the aspect, and starts generation", async () => {
    vi.mocked(window.api.getPathForFile).mockImplementation((f: File) => `/picked/${f.name}`);
    vi.mocked(window.api.createProject).mockResolvedValue({ ok: true, slug: "napa" });
    vi.mocked(window.api.importAssets).mockResolvedValue({
      ok: true,
      assets: [{ id: "beach", kind: "video", src: "assets/beach.mp4" }],
    });
    vi.mocked(window.api.loadProject).mockResolvedValue({
      ok: true,
      slug: "napa",
      dir: "/tmp/napa",
      edl: freshEdl(),
      promptText: "",
      meta: { status: "draft", title: "A day trip through Napa Valley", platform: "reels" },
    });
    vi.mocked(window.api.saveEdl).mockResolvedValue({ ok: true });
    vi.mocked(window.api.generateProject).mockResolvedValue({ ok: true });
    const onCreated = vi.fn();
    const { container } = render(<HomeZero onCreated={onCreated} />);

    stageClip(container);
    // The submit arrow stays disabled until both clips and a prompt exist.
    const submitBtn = screen.getByLabelText("Generate");
    expect(submitBtn).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/Create a 45-second/i), {
      target: { value: "A day trip through Napa Valley. Make it dreamy." },
    });
    expect(submitBtn).toBeEnabled();
    fireEvent.click(submitBtn);

    await waitFor(() =>
      expect(window.api.createProject).toHaveBeenCalledWith({
        title: "A day trip through Napa Valley",
        prompt: "A day trip through Napa Valley. Make it dreamy.",
      }),
    );
    await waitFor(() => expect(window.api.importAssets).toHaveBeenCalledWith("napa", ["/picked/beach.mp4"]));
    await waitFor(() => expect(window.api.saveEdl).toHaveBeenCalled());

    // Default aspect is vertical 9:16 → 1080x1920, and the imported clip is registered.
    const savedEdl = vi.mocked(window.api.saveEdl).mock.calls[0][1];
    expect(savedEdl.format).toMatchObject({ width: 1080, height: 1920 });
    expect(savedEdl.assets.map((a: { id: string }) => a.id)).toContain("beach");

    // The first generation runs as the session's opening turn with composer args.
    await waitFor(() =>
      expect(window.api.generateProject).toHaveBeenCalledWith(
        "napa",
        expect.objectContaining({ durationSec: 12, effort: "high", referenceMode: "literal" }),
      ),
    );
    expect(onCreated).toHaveBeenCalled();
    expect(useEditor.getState().view).toBe("editor");
    // The submitted prompt is logged as the session's first user turn.
    await waitFor(() => {
      const session = useEditor.getState().session;
      expect(session?.turns[0]).toMatchObject({
        role: "user",
        text: "A day trip through Napa Valley. Make it dreamy.",
      });
    });
  });
});
