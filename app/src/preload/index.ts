import { contextBridge, ipcRenderer, type IpcRendererEvent, webUtils } from "electron";
import type { Benchmarks, Edl, Meta, StyleProfile } from "@reel/edl";

export interface LoadProjectResult {
  ok: boolean;
  edl?: Edl;
  errors?: string[];
  slug?: string;
  dir?: string;
  promptText?: string;
  meta?: Meta;
}

export interface ExportResult {
  ok: boolean;
  output?: string;
  error?: string;
}

export interface SaveResult {
  ok: boolean;
  error?: string;
}

export interface ProjectSummary {
  slug: string;
  title: string;
  platform: string;
  status: string;
  durationSec: number;
  assetCount: number;
  updatedAt?: string;
}

export interface CreateProjectResult {
  ok: boolean;
  slug?: string;
  error?: string;
}

export interface ImportedAsset {
  id: string;
  kind: "video" | "audio" | "image";
  src: string;
  durationSec?: number;
}

export interface ImportResult {
  ok: boolean;
  assets: ImportedAsset[];
  error?: string;
}

export interface ImportFilesResult {
  ok: boolean;
  files: string[];
  error?: string;
}

/**
 * The safe bridge between the sandboxed renderer and the Node-capable main
 * process. Privileged operations (read project, render, reveal files) are
 * exposed here; new milestones extend this surface.
 */
const api = {
  ping: (): Promise<string> => ipcRenderer.invoke("ping"),
  listProjects: (): Promise<ProjectSummary[]> => ipcRenderer.invoke("projects:list"),
  createProject: (input: {
    title: string;
    prompt?: string;
    platform?: string;
    styleProfileId?: string;
  }): Promise<CreateProjectResult> => ipcRenderer.invoke("project:create", input),
  projectThumbnail: (slug: string): Promise<string | null> =>
    ipcRenderer.invoke("project:thumbnail", slug),
  deleteProject: (slug: string): Promise<SaveResult> => ipcRenderer.invoke("project:delete", slug),
  loadProject: (slug: string): Promise<LoadProjectResult> =>
    ipcRenderer.invoke("project:load", slug),
  watchProject: (slug: string): Promise<SaveResult> => ipcRenderer.invoke("project:watch", slug),
  saveEdl: (slug: string, edl: Edl): Promise<SaveResult> => ipcRenderer.invoke("edl:save", slug, edl),
  savePrompt: (slug: string, text: string): Promise<SaveResult> =>
    ipcRenderer.invoke("prompt:save", slug, text),
  loadMeta: (slug: string): Promise<Meta> => ipcRenderer.invoke("meta:load", slug),
  saveMeta: (slug: string, patch: Partial<Meta>): Promise<SaveResult> =>
    ipcRenderer.invoke("meta:save", slug, patch),
  // Electron 32+ removed File.path; resolve a dropped/selected File to its disk path.
  getPathForFile: (file: File): string => webUtils.getPathForFile(file),
  importAssets: (slug: string, paths: string[]): Promise<ImportResult> =>
    ipcRenderer.invoke("asset:import", slug, paths),
  importAssetBuffer: (slug: string, filename: string, data: Uint8Array): Promise<ImportResult> =>
    ipcRenderer.invoke("asset:importBuffer", slug, filename, data),
  listBundledMusic: (): Promise<string[]> => ipcRenderer.invoke("music:listBundled"),
  importBundledMusic: (slug: string, name: string): Promise<ImportResult> =>
    ipcRenderer.invoke("music:importBundled", slug, name),
  importReferences: (slug: string, paths: string[]): Promise<ImportFilesResult> =>
    ipcRenderer.invoke("references:import", slug, paths),
  listReferences: (slug: string): Promise<string[]> => ipcRenderer.invoke("references:list", slug),
  learnStyle: (slug: string): Promise<ExportResult> => ipcRenderer.invoke("style:learn", slug),
  loadStyle: (slug: string): Promise<StyleProfile | null> => ipcRenderer.invoke("style:load", slug),
  importBenchmarks: (slug: string, paths: string[]): Promise<ImportFilesResult> =>
    ipcRenderer.invoke("benchmark:import", slug, paths),
  listBenchmarks: (slug: string): Promise<{ file: string; views?: number; likes?: number }[]> =>
    ipcRenderer.invoke("benchmark:list", slug),
  saveBenchmarkMetrics: (
    slug: string,
    file: string,
    metrics: { views?: number; likes?: number },
  ): Promise<SaveResult> => ipcRenderer.invoke("benchmark:saveMetrics", slug, file, metrics),
  analyzeBenchmarks: (slug: string): Promise<ExportResult> => ipcRenderer.invoke("benchmarks:analyze", slug),
  loadBenchmarks: (slug: string): Promise<Benchmarks | null> => ipcRenderer.invoke("benchmarks:load", slug),
  autoTune: (slug: string): Promise<ExportResult> => ipcRenderer.invoke("autotune:start", slug),
  autoTuneResults: (slug: string): Promise<{ iter: number; score: number; delta: string; change: string }[]> =>
    ipcRenderer.invoke("autotune:results", slug),
  exportProject: (slug: string): Promise<ExportResult> => ipcRenderer.invoke("export:start", slug),
  generateProject: (slug: string): Promise<ExportResult> => ipcRenderer.invoke("generate:start", slug),
  generateMode: (): Promise<{ mode: "llm" | "baseline"; provider: string; model: string }> =>
    ipcRenderer.invoke("generate:mode"),
  transcribeProject: (slug: string): Promise<ExportResult> => ipcRenderer.invoke("transcribe:start", slug),
  loadCritique: (slug: string): Promise<unknown> => ipcRenderer.invoke("critique:load", slug),
  runCritique: (slug: string): Promise<ExportResult> => ipcRenderer.invoke("critique:run", slug),
  revealItem: (filePath: string): Promise<void> => ipcRenderer.invoke("shell:reveal", filePath),
  onExportProgress: (cb: (pct: number) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, pct: number) => cb(pct);
    ipcRenderer.on("export:progress", listener);
    return () => ipcRenderer.removeListener("export:progress", listener);
  },
  onExportPhase: (cb: (phase: string) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, phase: string) => cb(phase);
    ipcRenderer.on("export:phase", listener);
    return () => ipcRenderer.removeListener("export:phase", listener);
  },
  onProjectChanged: (cb: (slug: string) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, slug: string) => cb(slug);
    ipcRenderer.on("project:changed", listener);
    return () => ipcRenderer.removeListener("project:changed", listener);
  },
  // Generic streamed-progress subscriptions for any script channel prefix
  // (e.g. "style", "benchmarks", "autotune"). Mirrors the script PHASE/PROGRESS
  // protocol the main process parses.
  onProgress: (prefix: string, cb: (pct: number) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, pct: number) => cb(pct);
    ipcRenderer.on(`${prefix}:progress`, listener);
    return () => ipcRenderer.removeListener(`${prefix}:progress`, listener);
  },
  onPhase: (prefix: string, cb: (phase: string) => void): (() => void) => {
    const listener = (_e: IpcRendererEvent, phase: string) => cb(phase);
    ipcRenderer.on(`${prefix}:phase`, listener);
    return () => ipcRenderer.removeListener(`${prefix}:phase`, listener);
  },
};

contextBridge.exposeInMainWorld("api", api);

export type ReelApi = typeof api;
