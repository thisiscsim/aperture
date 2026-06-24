import { contextBridge, ipcRenderer, type IpcRendererEvent } from "electron";
import type { Edl } from "@reel/edl";

export interface LoadProjectResult {
  ok: boolean;
  edl?: Edl;
  errors?: string[];
  slug?: string;
  dir?: string;
  promptText?: string;
}

export interface ExportResult {
  ok: boolean;
  output?: string;
  error?: string;
}

/**
 * The safe bridge between the sandboxed renderer and the Node-capable main
 * process. Privileged operations (read project, render, reveal files) are
 * exposed here; new milestones extend this surface.
 */
const api = {
  ping: (): Promise<string> => ipcRenderer.invoke("ping"),
  loadProject: (slug: string): Promise<LoadProjectResult> =>
    ipcRenderer.invoke("project:load", slug),
  exportProject: (slug: string): Promise<ExportResult> => ipcRenderer.invoke("export:start", slug),
  generateProject: (slug: string): Promise<ExportResult> => ipcRenderer.invoke("generate:start", slug),
  transcribeProject: (slug: string): Promise<ExportResult> => ipcRenderer.invoke("transcribe:start", slug),
  loadCritique: (slug: string): Promise<unknown> => ipcRenderer.invoke("critique:load", slug),
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
};

contextBridge.exposeInMainWorld("api", api);

export type ReelApi = typeof api;
