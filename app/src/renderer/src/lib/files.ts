/**
 * Resolve a picked/dropped FileList to disk paths, dropping any file that has
 * no path (webUtils.getPathForFile throws for non-disk-backed files). This
 * snippet was copy-pasted verbatim in five components; centralize it.
 *
 * Callers must snapshot the FileList synchronously (it's live and emptied by
 * `input.value = ""`) before awaiting — Array.from here does that.
 */
export function pathsFrom(files: FileList | File[]): string[] {
  return Array.from(files)
    .map((f) => {
      try {
        return window.api.getPathForFile(f);
      } catch {
        return "";
      }
    })
    .filter(Boolean);
}
