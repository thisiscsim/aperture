import { useEffect, useState } from "react";
import { useEditor } from "../store";
import { IconButton } from "./ui";
import { useEscapeKey } from "./ui/useEscapeKey";

interface HwSettings {
  hwDecode: boolean;
  hwEncode: boolean;
}

type SettingsTab = "general" | "export" | "agent";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "export", label: "Export" },
  { id: "agent", label: "Agent" },
];

export function SettingsModal({ onClose }: { onClose: () => void }): JSX.Element {
  const theme = useEditor((s) => s.theme);
  const toggleTheme = useEditor((s) => s.toggleTheme);
  const [tab, setTab] = useState<SettingsTab>("general");
  const [settings, setSettings] = useState<HwSettings>({ hwDecode: false, hwEncode: false });
  const [decodeChanged, setDecodeChanged] = useState(false);
  const [projectsDir, setProjectsDir] = useState<string>("");
  const [folderChanged, setFolderChanged] = useState(false);
  const [genMode, setGenMode] = useState<{ mode: "llm" | "baseline"; model: string } | null>(null);

  useEscapeKey(onClose);

  useEffect(() => {
    window.api?.getSettings().then(setSettings).catch(() => {});
    window.api?.getProjectsDir().then(setProjectsDir).catch(() => {});
    window.api?.generateMode().then((m) => setGenMode({ mode: m.mode, model: m.model })).catch(() => {});
  }, []);

  const changeFolder = async () => {
    const res = await window.api.pickProjectsDir();
    if (res.ok && res.homeDir) setFolderChanged(true);
  };

  const update = async (patch: Partial<HwSettings>) => {
    if ("hwDecode" in patch) setDecodeChanged(true);
    const next = await window.api.setSettings(patch);
    setSettings(next);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="modal-title">Settings</div>

        <div className="rp-tabs settings-tabs">
          {TABS.map((t) => (
            <button key={t.id} className={`rp-tab ${tab === t.id ? "active" : ""}`} onClick={() => setTab(t.id)}>
              {t.label}
            </button>
          ))}
        </div>

        {tab === "general" && (
          <>
            <div className="setting-row">
              <div>
                <div className="setting-label">Appearance</div>
                <div className="muted small">Light or dark editor theme.</div>
              </div>
              <button className="btn compact" onClick={toggleTheme}>
                {theme === "dark" ? "Dark" : "Light"}
              </button>
            </div>

            <div className="setting-row">
              <div style={{ minWidth: 0 }}>
                <div className="setting-label">Projects folder</div>
                <div className="muted small break">{projectsDir || "…"}</div>
              </div>
              <div className="audio-actions">
                <button className="btn compact" onClick={() => void window.api.revealProjectsDir()}>
                  Reveal
                </button>
                <button className="btn compact" onClick={changeFolder}>
                  Change…
                </button>
              </div>
            </div>

            <div className="setting-row">
              <div>
                <div className="setting-label">Hardware-accelerated playback</div>
                <div className="muted small">Use the GPU to decode video in the editor. Restart required.</div>
              </div>
              <Toggle on={settings.hwDecode} onChange={(v) => void update({ hwDecode: v })} />
            </div>
          </>
        )}

        {tab === "export" && (
          <>
            <div className="setting-row">
              <div>
                <div className="setting-label">Hardware-accelerated export</div>
                <div className="muted small">Use the GPU encoder (VideoToolbox) when rendering the final MP4.</div>
              </div>
              <Toggle on={settings.hwEncode} onChange={(v) => void update({ hwEncode: v })} />
            </div>
            <p className="muted small">
              Exports render with Remotion at the project&apos;s format and frame rate; the result lands in the
              project folder as <code>final.mp4</code>.
            </p>
          </>
        )}

        {tab === "agent" && (
          <>
            <div className="setting-row">
              <div>
                <div className="setting-label">Generation</div>
                <div className="muted small">
                  {genMode
                    ? genMode.mode === "llm"
                      ? `AI generation is on — cuts, critiques and auto-improve use ${genMode.model}.`
                      : "Baseline mode — no API key found, so Generate assembles a deterministic cut."
                    : "…"}
                </div>
              </div>
              <span className={`badge-dot ${genMode?.mode === "llm" ? "ok" : ""}`} />
            </div>
            <p className="muted small">
              Set <code>OPENAI_API_KEY</code> (or <code>APERTURE_LLM_PROVIDER</code> +{" "}
              <code>APERTURE_LLM_MODEL</code> + <code>APERTURE_LLM_API_KEY</code>) in <code>app/.env.local</code>,
              then restart. Style analysis, critique and auto-improve share the same key.
            </p>
          </>
        )}

        {(decodeChanged || folderChanged) && (
          <p className="muted small">Restart Aperture for these changes to take effect.</p>
        )}

        <div className="modal-actions">
          <button className="btn btn-primary" onClick={onClose}>
            Done
          </button>
        </div>
      </div>
    </div>
  );
}

/** Gear button + modal in one — drop it into any bar (Home, editor header). */
export function SettingsButton(): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <>
      <IconButton icon="settings-gear" label="Settings" onClick={() => setOpen(true)} />
      {open && <SettingsModal onClose={() => setOpen(false)} />}
    </>
  );
}

function Toggle({ on, onChange }: { on: boolean; onChange: (v: boolean) => void }): JSX.Element {
  return (
    <button
      className={`switch ${on ? "on" : ""}`}
      role="switch"
      aria-checked={on}
      onClick={() => onChange(!on)}
    >
      <span className="switch-knob" />
    </button>
  );
}
