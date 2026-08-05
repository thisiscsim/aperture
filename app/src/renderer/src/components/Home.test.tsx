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
  // A non-empty library keeps the header's New project button around (a fully
  // empty one renders the zero-state experience without it).
  vi.mocked(window.api.listProjects).mockResolvedValue([
    {
      slug: "existing",
      title: "Existing project",
      platform: "reels",
      status: "draft",
      durationSec: 10,
      assetCount: 1,
      updatedAt: "2026-07-18T00:00:00Z",
    },
  ]);
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
    // One project so the regular (tabbed) home renders — a fully empty library
    // shows the zero-state experience instead.
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

describe("CreateProjectDialog", () => {
  it("creates a project from just a name (clips + prompt now live in the editor)", async () => {
    vi.mocked(window.api.createProject).mockResolvedValue({ ok: true, slug: "my-cut" });
    openDialog();

    // Create is disabled until a name is entered.
    expect(screen.getByText("Create project").closest("button")).toBeDisabled();
    fireEvent.change(screen.getByPlaceholderText(/Day in the life/i), { target: { value: "My cut" } });
    fireEvent.click(screen.getByText("Create project"));

    await waitFor(() =>
      expect(window.api.createProject).toHaveBeenCalledWith({ title: "My cut", prompt: "" }),
    );
  });

  it("surfaces a creation error inside the dialog", async () => {
    vi.mocked(window.api.createProject).mockResolvedValue({ ok: false, error: "disk full" });
    openDialog();

    fireEvent.change(screen.getByPlaceholderText(/Day in the life/i), { target: { value: "My cut" } });
    fireEvent.click(screen.getByText("Create project"));

    expect(await screen.findByText("disk full")).toBeInTheDocument();
  });
});
