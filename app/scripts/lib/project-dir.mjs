// Slug -> project directory, with the same containment guarantee the app's
// IPC boundary enforces. Scripts are documented as CLI/agent-runnable, so the
// slug is untrusted here too: `--slug ../../etc` must not resolve outside the
// projects root. (Phase 6 folds this into a broader app/scripts/lib/cli.mjs.)
import path from "node:path";

const SLUG_RE = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

/** Absolute projects root, honoring APERTURE_PROJECTS_DIR (dev fallback: <repo>/projects). */
export function projectsRoot(repoRoot) {
  return path.resolve(process.env.APERTURE_PROJECTS_DIR || path.join(repoRoot, "projects"));
}

/**
 * Resolve projects/<slug>, throwing on a malformed slug or any path that would
 * escape the projects root. Returns an absolute path.
 */
export function resolveProjectDir(repoRoot, slug) {
  if (typeof slug !== "string" || !SLUG_RE.test(slug)) {
    throw new Error(`invalid slug: ${JSON.stringify(slug)}`);
  }
  const root = projectsRoot(repoRoot);
  const dir = path.resolve(root, slug);
  if (dir !== path.join(root, slug) || !dir.startsWith(root + path.sep)) {
    throw new Error("slug escapes the projects root");
  }
  return dir;
}
