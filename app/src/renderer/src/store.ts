import { create } from "zustand";
import type { Edl } from "@reel/edl";

export type RightTab = "inspector" | "design" | "critique";

export interface ExportResult {
  ok: boolean;
  output?: string;
  error?: string;
}

interface EditorState {
  edl: Edl | null;
  slug: string | null;
  dir: string | null;
  promptText: string;
  loadError: string | null;

  selectedClipId: string | null;
  currentFrame: number;
  rightTab: RightTab;
  seek: (frame: number) => void;

  exporting: boolean;
  exportProgress: number;
  exportPhase: string;
  exportResult: ExportResult | null;

  generating: boolean;
  reloadProject: () => void;

  setProject: (p: { edl: Edl; slug?: string | null; dir?: string | null; promptText?: string }) => void;
  setLoadError: (msg: string | null) => void;
  updateEdl: (mutate: (edl: Edl) => void) => void;
  select: (id: string | null) => void;
  setCurrentFrame: (frame: number) => void;
  setRightTab: (tab: RightTab) => void;
  setSeek: (fn: (frame: number) => void) => void;

  startExport: () => void;
  setExportProgress: (pct: number) => void;
  setExportPhase: (phase: string) => void;
  finishExport: (result: ExportResult) => void;
  closeExport: () => void;

  setGenerating: (value: boolean) => void;
  setReload: (fn: () => void) => void;
}

export const useEditor = create<EditorState>()((set, get) => ({
  edl: null,
  slug: null,
  dir: null,
  promptText: "",
  loadError: null,

  selectedClipId: null,
  currentFrame: 0,
  rightTab: "inspector",
  seek: () => {},

  exporting: false,
  exportProgress: 0,
  exportPhase: "",
  exportResult: null,

  generating: false,
  reloadProject: () => {},

  setProject: (p) =>
    set({
      edl: p.edl,
      slug: p.slug ?? null,
      dir: p.dir ?? null,
      promptText: p.promptText ?? "",
      loadError: null,
    }),
  setLoadError: (msg) => set({ loadError: msg }),
  updateEdl: (mutate) =>
    set((s) => {
      if (!s.edl) return {};
      const next = structuredClone(s.edl);
      mutate(next);
      return { edl: next };
    }),
  select: (id) => set({ selectedClipId: id, rightTab: id ? "inspector" : get().rightTab }),
  setCurrentFrame: (frame) => set({ currentFrame: frame }),
  setRightTab: (tab) => set({ rightTab: tab }),
  setSeek: (fn) => set({ seek: fn }),

  startExport: () => set({ exporting: true, exportProgress: 0, exportPhase: "preparing", exportResult: null }),
  setExportProgress: (pct) => set({ exportProgress: pct }),
  setExportPhase: (phase) => set({ exportPhase: phase }),
  finishExport: (result) => set({ exporting: false, exportResult: result }),
  closeExport: () => set({ exportResult: null, exportProgress: 0, exportPhase: "" }),

  setGenerating: (value) => set({ generating: value }),
  setReload: (fn) => set({ reloadProject: fn }),
}));
