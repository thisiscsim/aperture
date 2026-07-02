import { type ReactNode, useEffect, useState } from "react";
import { useEditor } from "../store";
import { Button, Icon, IconButton } from "./ui";
import { useEscapeKey } from "./ui/useEscapeKey";
import type { AppSettings } from "../../../preload";

type SettingsTab = "general" | "export" | "agent";

const TABS: { id: SettingsTab; label: string }[] = [
  { id: "general", label: "General" },
  { id: "export", label: "Export Settings" },
  { id: "agent", label: "Agent Preferences" },
];

const MODELS = ["gpt-5.5", "gpt-5.5-mini", "claude-fable-5", "claude-sonnet-5"];

const DEFAULTS: AppSettings = {
  hwDecode: false,
  hwEncode: false,
  exportFps: "project",
  exportResolution: "project",
  exportCompression: "social",
  agentModel: "gpt-5.5",
  reasoningEffort: "low",
};

/** Settings dialog (Figma 14:1597 / 17:652 / 17:1812). */
export function SettingsModal({ onClose }: { onClose: () => void }): JSX.Element {
  const theme = useEditor((s) => s.theme);
  const setTheme = useEditor((s) => s.setTheme);
  const [tab, setTab] = useState<SettingsTab>("general");
  const [settings, setSettings] = useState<AppSettings>(DEFAULTS);
  const [projectsDir, setProjectsDir] = useState<string>("");
  const [restartNeeded, setRestartNeeded] = useState(false);
  const [locks, setLocks] = useState({ modelLocked: false, keyLocked: false });
  const [keyDraft, setKeyDraft] = useState("");
  const [keySaved, setKeySaved] = useState(false);

  useEscapeKey(onClose);

  useEffect(() => {
    window.api?.getSettings().then(setSettings).catch(() => {});
    window.api?.getProjectsDir().then(setProjectsDir).catch(() => {});
    window.api
      ?.generateMode()
      .then((m) => setLocks({ modelLocked: m.modelLocked, keyLocked: m.keyLocked }))
      .catch(() => {});
  }, []);

  const update = async (patch: Partial<AppSettings>) => {
    if ("hwDecode" in patch || "homeDir" in patch) setRestartNeeded(true);
    const next = await window.api.setSettings(patch);
    setSettings(next);
  };

  const changeFolder = async () => {
    const res = await window.api.pickProjectsDir();
    if (res.ok && res.homeDir) setRestartNeeded(true);
  };

  const connectKey = async () => {
    if (!keyDraft.trim()) return;
    await update({ agentApiKey: keyDraft.trim() });
    setKeyDraft("");
    setKeySaved(true);
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="settings-modal" onClick={(e) => e.stopPropagation()}>
        <div className="settings-tabs-row">
          {TABS.map((t) => (
            <button
              key={t.id}
              className={`settings-tab ${tab === t.id ? "active" : ""}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="settings-body">
          {tab === "general" && (
            <>
              <SettingRow title="Appearance" sub="Select your interface color scheme">
                <SettingSelect
                  value={theme}
                  onChange={(v) => setTheme(v as "light" | "dark")}
                  options={[
                    { value: "light", label: "Light" },
                    { value: "dark", label: "Dark" },
                  ]}
                />
              </SettingRow>
              <Divider />
              <SettingRow
                title="Hardware-accelerated playback"
                sub="Use GPU to decode video in the editor. Restart required"
              >
                <Toggle on={settings.hwDecode} onChange={(v) => void update({ hwDecode: v })} />
              </SettingRow>
              <Divider />
              <SettingRow title="Hardware-accelerated export" sub="Use GPU encoder when rendering the final MP4">
                <Toggle on={settings.hwEncode} onChange={(v) => void update({ hwEncode: v })} />
              </SettingRow>
              <Divider />
              <SettingRow
                title="Save all projects to"
                sub={projectsDir || "…"}
                subTitle="Click to reveal in Finder"
                onSubClick={() => void window.api.revealProjectsDir()}
              >
                <button className="settings-select-btn" onClick={changeFolder}>
                  Change directory
                </button>
              </SettingRow>
            </>
          )}

          {tab === "export" && (
            <>
              <SettingRow title="Frame rate" sub="Output frame rate for the exported video">
                <SettingSelect
                  value={settings.exportFps}
                  onChange={(v) => void update({ exportFps: v as AppSettings["exportFps"] })}
                  options={[
                    { value: "project", label: "Project" },
                    { value: "24", label: "24 FPS" },
                    { value: "30", label: "30 FPS" },
                    { value: "60", label: "60 FPS" },
                  ]}
                />
              </SettingRow>
              <Divider />
              <SettingRow title="Resolution" sub="Rendered size; Project keeps the format set in the editor">
                <SettingSelect
                  value={settings.exportResolution}
                  onChange={(v) => void update({ exportResolution: v as AppSettings["exportResolution"] })}
                  options={[
                    { value: "project", label: "Project" },
                    { value: "1080", label: "1080p" },
                    { value: "720", label: "720p" },
                  ]}
                />
              </SettingRow>
              <Divider />
              <SettingRow title="Compression" sub="Trade file size against visual quality">
                <SettingSelect
                  value={settings.exportCompression}
                  onChange={(v) => void update({ exportCompression: v as AppSettings["exportCompression"] })}
                  options={[
                    { value: "social", label: "Social Media" },
                    { value: "high", label: "High Quality" },
                    { value: "max", label: "Smallest File" },
                  ]}
                />
              </SettingRow>
            </>
          )}

          {tab === "agent" && (
            <>
              <SettingRow
                title="Model"
                sub={
                  locks.modelLocked
                    ? "Pinned by APERTURE_LLM_MODEL in .env.local"
                    : "Model used for generation, critique and auto-improve"
                }
              >
                <SettingSelect
                  value={settings.agentModel}
                  onChange={(v) => void update({ agentModel: v })}
                  disabled={locks.modelLocked}
                  options={MODELS.map((m) => ({ value: m, label: modelLabel(m) }))}
                />
              </SettingRow>
              <div className="settings-key-row">
                <input
                  className="settings-key-input"
                  type="password"
                  placeholder={
                    locks.keyLocked
                      ? "API key configured via .env.local"
                      : keySaved || settings.agentApiKey
                        ? "API key saved — enter a new key to replace it"
                        : "Enter your OpenAI API Key"
                  }
                  value={keyDraft}
                  disabled={locks.keyLocked}
                  onChange={(e) => setKeyDraft(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && void connectKey()}
                />
                <button
                  className="settings-select-btn"
                  onClick={() => void connectKey()}
                  disabled={locks.keyLocked || !keyDraft.trim()}
                >
                  {keySaved ? "Saved" : "Connect"}
                </button>
              </div>
              <Divider />
              <SettingRow title="Reasoning effort" sub="Higher effort thinks longer and costs more per run">
                <SettingSelect
                  value={settings.reasoningEffort}
                  onChange={(v) => void update({ reasoningEffort: v as AppSettings["reasoningEffort"] })}
                  options={[
                    { value: "low", label: "Low" },
                    { value: "medium", label: "Medium" },
                    { value: "high", label: "High" },
                  ]}
                />
              </SettingRow>
            </>
          )}

          {restartNeeded && <p className="settings-restart">Restart Aperture for these changes to take effect.</p>}
        </div>

        <div className="settings-footer">
          <Button variant="primary" size="sm" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    </div>
  );
}

function modelLabel(id: string): string {
  return id
    .replace(/^gpt-/, "GPT ")
    .replace(/^claude-/, "Claude ")
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .replace("Gpt", "GPT");
}

function SettingRow({
  title,
  sub,
  subTitle,
  onSubClick,
  children,
}: {
  title: string;
  sub: string;
  subTitle?: string;
  onSubClick?: () => void;
  children: ReactNode;
}): JSX.Element {
  return (
    <div className="settings-row">
      <div className="settings-row-text">
        <div className="settings-row-title">{title}</div>
        <div
          className={`settings-row-sub ${onSubClick ? "clickable" : ""}`}
          title={subTitle}
          onClick={onSubClick}
        >
          {sub}
        </div>
      </div>
      {children}
    </div>
  );
}

function Divider(): JSX.Element {
  return <div className="settings-divider" />;
}

function SettingSelect({
  value,
  onChange,
  options,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  disabled?: boolean;
}): JSX.Element {
  return (
    <span className={`settings-select-btn ${disabled ? "disabled" : ""}`}>
      <select value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon name="chevron-top" size={16} style={{ transform: "rotate(180deg)" }} />
    </span>
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
