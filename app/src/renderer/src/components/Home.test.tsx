import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Home } from "./Home";
import { useEditor } from "../store";

afterEach(() => {
  cleanup();
  vi.mocked(window.api.getPathForFile).mockReset();
  vi.mocked(window.api.listProjects).mockReset().mockResolvedValue([]);
  vi.mocked(window.api.listAlbums).mockReset().mockResolvedValue([]);
});

function openDialog() {
  useEditor.setState({ view: "home", projects: [] });
  const utils = render(<Home />);
  fireEvent.click(screen.getAllByText("New project")[0]);
  return utils;
}

describe("Home albums", () => {
  it("shows album tiles and moves a project into an album from the card menu", async () => {
    vi.mocked(window.api.listProjects).mockResolvedValue([
      {
        slug: "napa",
        title: "Birthday in Napa Valley",
        platform: "reels",
        status: "draft",
        durationSec: 24.9,
        assetCount: 3,
        updatedAt: "2026-07-18T00:00:00Z",
      },
    ]);
    vi.mocked(window.api.listAlbums).mockResolvedValue([
      { id: "nyc", name: "New York City", createdAt: "2026-07-01T00:00:00Z" },
    ]);
    vi.mocked(window.api.setProjectAlbum).mockResolvedValue({ ok: true });
    useEditor.setState({ view: "home", projects: [] });
    render(<Home />);

    expect(await screen.findByText("Birthday in Napa Valley")).toBeInTheDocument();
    expect(screen.getByText("New York City")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Options for Birthday in Napa Valley"));
    fireEvent.click(screen.getByText("Move to album"));
    fireEvent.click(await screen.findByText("New York City", { selector: ".menu-item-label" }));
    await waitFor(() => expect(window.api.setProjectAlbum).toHaveBeenCalledWith("napa", "nyc"));
  });

  it("New album opens a naming dialog and creates + moves on confirm", async () => {
    vi.mocked(window.api.listProjects).mockResolvedValue([
      {
        slug: "napa",
        title: "Birthday in Napa Valley",
        platform: "reels",
        status: "draft",
        durationSec: 24.9,
        assetCount: 3,
        updatedAt: "2026-07-18T00:00:00Z",
      },
    ]);
    vi.mocked(window.api.createAlbum).mockResolvedValue({
      ok: true,
      id: "wine-country",
      name: "Wine Country",
    });
    vi.mocked(window.api.setProjectAlbum).mockResolvedValue({ ok: true });
    useEditor.setState({ view: "home", projects: [] });
    render(<Home />);

    fireEvent.click(await screen.findByLabelText("Options for Birthday in Napa Valley"));
    fireEvent.click(screen.getByText("Move to album"));
    fireEvent.click(await screen.findByText("New album"));

    // No album is created until the dialog is confirmed with a name.
    expect(window.api.createAlbum).not.toHaveBeenCalled();
    fireEvent.change(screen.getByPlaceholderText(/New York City/i), { target: { value: "Wine Country" } });
    fireEvent.click(screen.getByText("Create album"));

    await waitFor(() => expect(window.api.createAlbum).toHaveBeenCalledWith("Wine Country"));
    await waitFor(() => expect(window.api.setProjectAlbum).toHaveBeenCalledWith("napa", "wine-country"));
  });

  it("Rename project opens the dialog and saves the new title", async () => {
    vi.mocked(window.api.listProjects).mockResolvedValue([
      {
        slug: "napa",
        title: "Birthday in Napa Valley",
        platform: "reels",
        status: "draft",
        durationSec: 24.9,
        assetCount: 3,
        updatedAt: "2026-07-18T00:00:00Z",
      },
    ]);
    vi.mocked(window.api.saveMeta).mockResolvedValue({ ok: true });
    useEditor.setState({ view: "home", projects: [] });
    render(<Home />);

    fireEvent.click(await screen.findByLabelText("Options for Birthday in Napa Valley"));
    fireEvent.click(screen.getByText("Rename project"));
    const input = screen.getByDisplayValue("Birthday in Napa Valley");
    fireEvent.change(input, { target: { value: "Napa, day one" } });
    fireEvent.click(screen.getByText("Save"));
    await waitFor(() => expect(window.api.saveMeta).toHaveBeenCalledWith("napa", { title: "Napa, day one" }));
  });

  it("shows a centered empty state on the Albums tab", async () => {
    vi.mocked(window.api.listProjects).mockResolvedValue([]);
    vi.mocked(window.api.listAlbums).mockResolvedValue([]);
    useEditor.setState({ view: "home", projects: [] });
    render(<Home />);
    fireEvent.click(await screen.findByRole("tab", { name: "Albums" }));
    expect(screen.getByText("No albums yet")).toBeInTheDocument();
  });

  it("filters tiles by search query", async () => {
    vi.mocked(window.api.listProjects).mockResolvedValue([
      {
        slug: "napa",
        title: "Birthday in Napa Valley",
        platform: "reels",
        status: "draft",
        durationSec: 24.9,
        assetCount: 3,
        updatedAt: "2026-07-18T00:00:00Z",
      },
      {
        slug: "sur",
        title: "Day trip to Big Sur",
        platform: "reels",
        status: "draft",
        durationSec: 12,
        assetCount: 2,
        updatedAt: "2026-07-17T00:00:00Z",
      },
    ]);
    vi.mocked(window.api.listAlbums).mockResolvedValue([]);
    useEditor.setState({ view: "home", projects: [] });
    render(<Home />);

    await screen.findByText("Day trip to Big Sur");
    fireEvent.change(screen.getByPlaceholderText("Search..."), { target: { value: "napa" } });
    expect(screen.getByText("Birthday in Napa Valley")).toBeInTheDocument();
    expect(screen.queryByText("Day trip to Big Sur")).not.toBeInTheDocument();
  });
});

describe("NewProjectModal clips staging", () => {
  it("stages picked files as removable rows (snapshot survives the input reset)", async () => {
    vi.mocked(window.api.getPathForFile).mockImplementation((f: File) => `/picked/${f.name}`);
    const { container } = openDialog();

    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File(["x"], "beach.mp4", { type: "video/mp4" })] } });

    expect(await screen.findByText("beach.mp4")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Remove beach.mp4"));
    expect(screen.queryByText("beach.mp4")).not.toBeInTheDocument();
  });

  it("creates without a platform and imports the staged clips", async () => {
    vi.mocked(window.api.getPathForFile).mockImplementation((f: File) => `/picked/${f.name}`);
    vi.mocked(window.api.createProject).mockResolvedValue({ ok: true, slug: "demo" });
    vi.mocked(window.api.importAssets).mockResolvedValue({ ok: true, assets: [] });
    const { container } = openDialog();

    fireEvent.change(screen.getByPlaceholderText(/Day in the life/i), { target: { value: "My cut" } });
    const input = container.querySelector<HTMLInputElement>('input[type="file"]')!;
    fireEvent.change(input, { target: { files: [new File(["x"], "beach.mp4", { type: "video/mp4" })] } });
    await screen.findByText("beach.mp4");

    fireEvent.click(screen.getByText("Create"));

    await waitFor(() => expect(window.api.createProject).toHaveBeenCalled());
    expect(window.api.createProject).toHaveBeenCalledWith({ title: "My cut", prompt: "" });
    await waitFor(() => expect(window.api.importAssets).toHaveBeenCalledWith("demo", ["/picked/beach.mp4"]));
  });
});
