import { useEffect, useState } from "react";
import { useEditor } from "../store";

interface HwSettings {
  hwDecode: boolean;
  hwEncode: boolean;
}

export function SettingsModal({ onClose }: { onClose: () => void }): JSX.Element {
  const theme = useEditor((s) => s.theme);
  const toggleTheme = useEditor((s) => s.toggleTheme);
  const [settings, setSettings] = useState<HwSettings>({ hwDecode: false, hwEncode: false });
  const [decodeChanged, setDecodeChanged] = useState(false);
  const [projectsDir, setProjectsDir] = useState<string>("");
  const [folderChanged, setFolderChanged] = useState(false);

  useEffect(() => {
    window.api?.getSettings().then(setSettings).catch(() => {});
    window.api?.getProjectsDir().then(setProjectsDir).catch(() => {});
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
          <div>
            <div className="setting-label">Hardware-accelerated playback</div>
            <div className="muted small">Use the GPU to decode video in the editor. Restart required.</div>
          </div>
          <Toggle on={settings.hwDecode} onChange={(v) => void update({ hwDecode: v })} />
        </div>

        <div className="setting-row">
          <div>
            <div className="setting-label">Hardware-accelerated export</div>
            <div className="muted small">Use the GPU encoder when rendering the final MP4.</div>
          </div>
          <Toggle on={settings.hwEncode} onChange={(v) => void update({ hwEncode: v })} />
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

/** Gear button + modal in one — drop it into any bar (Home, editor TopBar). */
export function SettingsButton(): JSX.Element {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className="btn icon" onClick={() => setOpen(true)} title="Settings" aria-label="Settings">
        <GearIcon />
      </button>
      {open && <SettingsModal onClose={() => setOpen(false)} />}
    </>
  );
}

function GearIcon(): JSX.Element {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
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
