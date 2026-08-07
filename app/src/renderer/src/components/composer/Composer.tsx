import { type ChangeEvent, type ReactNode, useRef, useState } from "react";
import {
  ASPECT_LABELS,
  ASPECT_ORDER,
  DURATION_OPTIONS,
  EFFORT_ICONS,
  EFFORT_LABELS,
  REFERENCE_MODE_LABELS,
  type ComposerSettings,
} from "../../lib/composer";
import { Icon, Menu, MenuHeader, MenuItem, MenuSection, ShaderOrb, Thumbnail } from "../ui";

/**
 * The agent composer (Figma ChatInput spec): a layered card — white prompt
 * field + pill toolbar on top, gray reference strip below. Fully controlled;
 * submission, staging, and persistence live at the call site. The same
 * component renders wide on the zero-state home and narrow in the editor's
 * Create tab.
 */

export interface ComposerReference {
  id: string;
  name: string;
  /** Preview source (object URL or reel-asset URL); null renders the empty thumb. */
  thumb: string | null;
  duration?: string;
}

export function Composer({
  value,
  onValueChange,
  settings,
  onSettingsChange,
  references,
  onAddReferences,
  onRemoveReference,
  onAddBenchmarks,
  onSubmit,
  busy = false,
  canSubmit,
  placeholder = "Describe the video you want to make…",
  showCritique = true,
  autoFocus = false,
  variant = "wide",
}: {
  value: string;
  onValueChange: (text: string) => void;
  settings: ComposerSettings;
  onSettingsChange: (settings: ComposerSettings) => void;
  references: ComposerReference[];
  /** Called with the picked files; staging/import is the call site's job. */
  onAddReferences: (files: File[]) => void;
  onRemoveReference: (id: string) => void;
  /** Critique mode: benchmark videos dropped/picked for scoring context. */
  onAddBenchmarks?: (files: File[]) => void;
  onSubmit: () => void;
  busy?: boolean;
  canSubmit: boolean;
  placeholder?: string;
  showCritique?: boolean;
  autoFocus?: boolean;
  /**
   * `wide` (zero-state home): every setting is a pill and references attach
   * in the footer strip. `compact` (editor panel, Figma 346:10331): mode +
   * effort pills only — aspect/duration fold into a slider-icon popover and
   * the reference footer is dropped (references live in the panel's tab).
   */
  variant?: "wide" | "compact";
}): JSX.Element {
  const refInput = useRef<HTMLInputElement>(null);
  const benchInput = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const [benchDrag, setBenchDrag] = useState(false);

  const compact = variant === "compact";
  const critiqueMode = settings.mode === "critique" && Boolean(onAddBenchmarks);
  const effectivePlaceholder = critiqueMode
    ? "You can copy and paste a link here and Aperture will find the related video."
    : placeholder;

  const set = (patch: Partial<ComposerSettings>) => onSettingsChange({ ...settings, ...patch });

  const grow = () => {
    const el = textRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`;
  };

  const pickReferences = (e: ChangeEvent<HTMLInputElement>) => {
    // Snapshot synchronously — the FileList is live and cleared by the reset below.
    const files = e.target.files ? Array.from(e.target.files) : [];
    if (files.length) onAddReferences(files);
    e.target.value = "";
  };

  // Shared menu sections — pills in the wide variant, folded into the
  // slider-icon settings popover in the compact one.
  const aspectSection = (
    <MenuSection>
      <MenuHeader>Aspect ratio</MenuHeader>
      {ASPECT_ORDER.map((aspect) => (
        <MenuItem
          key={aspect}
          leading={
            <Icon
              name="aspect-ratio"
              size={16}
              style={aspect === "9:16" || aspect === "4:5" ? { transform: "rotate(-90deg)" } : undefined}
            />
          }
          selected={settings.aspect === aspect}
          onSelect={() => set({ aspect })}
        >
          {ASPECT_LABELS[aspect]} <span className="composer-pill-dim">{aspect}</span>
        </MenuItem>
      ))}
    </MenuSection>
  );
  const durationSection = (
    <MenuSection>
      <MenuHeader>Duration</MenuHeader>
      {DURATION_OPTIONS.map((sec) => (
        <MenuItem
          key={sec}
          selected={settings.durationSec === sec}
          onSelect={() => set({ durationSec: sec })}
        >
          {sec}s
        </MenuItem>
      ))}
    </MenuSection>
  );
  const referenceModeSection = (
    <MenuSection>
      <MenuHeader>Apply references</MenuHeader>
      <MenuItem
        selected={settings.referenceMode === "literal"}
        hint="Recreate the reference's look shot-for-shot"
        onSelect={() => set({ referenceMode: "literal" })}
      >
        Literal
      </MenuItem>
      <MenuItem
        selected={settings.referenceMode === "inspired"}
        hint="Borrow the vibe, pacing, and palette"
        onSelect={() => set({ referenceMode: "inspired" })}
      >
        As inspiration
      </MenuItem>
    </MenuSection>
  );

  return (
    <div className={compact ? "composer composer--compact" : "composer"}>
      <div className="composer-main">
        {critiqueMode && (
          <div
            className={`composer-benchmarks ${benchDrag ? "drag" : ""}`}
            role="button"
            tabIndex={0}
            onClick={() => benchInput.current?.click()}
            onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && benchInput.current?.click()}
            onDragOver={(e) => {
              e.preventDefault();
              setBenchDrag(true);
            }}
            onDragLeave={() => setBenchDrag(false)}
            onDrop={(e) => {
              e.preventDefault();
              setBenchDrag(false);
              if (e.dataTransfer.files.length) onAddBenchmarks?.(Array.from(e.dataTransfer.files));
            }}
          >
            <span className="composer-benchmarks-title">
              <Icon name="arrow-out-of-box" size={16} />
              Upload reference
            </span>
            <span className="composer-benchmarks-sub">Drag and drop files here or click to upload</span>
            <span className="composer-benchmarks-formats">MP4, MOV, HEIC, WebM, JPEGs, PNGs</span>
          </div>
        )}
        <input
          ref={benchInput}
          type="file"
          accept="video/*"
          multiple
          hidden
          onChange={(e) => {
            const files = e.target.files ? Array.from(e.target.files) : [];
            if (files.length) onAddBenchmarks?.(files);
            e.target.value = "";
          }}
        />
        <textarea
          ref={textRef}
          className="composer-input"
          rows={2}
          value={value}
          placeholder={effectivePlaceholder}
          autoFocus={autoFocus}
          disabled={busy}
          onChange={(e) => {
            onValueChange(e.target.value);
            grow();
          }}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              if (canSubmit && !busy) onSubmit();
            }
          }}
        />
        <div className="composer-toolbar">
          <div className="composer-pills">
            <ComposerPillMenu
              label={settings.mode === "generation" ? "Generation" : "Critique"}
              leading={<ShaderOrb type={settings.mode} size={16} />}
            >
              <MenuSection>
                <MenuHeader>Mode</MenuHeader>
                <MenuItem
                  leading={<ShaderOrb type="generation" size={16} />}
                  hint="Assemble or adjust the cut from your clips"
                  selected={settings.mode === "generation"}
                  onSelect={() => set({ mode: "generation" })}
                >
                  Generation
                </MenuItem>
                {showCritique && (
                  <MenuItem
                    leading={<ShaderOrb type="critique" size={16} />}
                    hint="Score the cut and suggest fixes"
                    selected={settings.mode === "critique"}
                    onSelect={() => set({ mode: "critique" })}
                  >
                    Critique
                  </MenuItem>
                )}
              </MenuSection>
            </ComposerPillMenu>

            <ComposerPillMenu
              label={EFFORT_LABELS[settings.effort]}
              leading={<Icon name={EFFORT_ICONS[settings.effort]} size={16} />}
            >
              <MenuSection>
                <MenuHeader>Reasoning</MenuHeader>
                {(Object.keys(EFFORT_LABELS) as (keyof typeof EFFORT_LABELS)[]).map((effort) => (
                  <MenuItem
                    key={effort}
                    icon={EFFORT_ICONS[effort]}
                    selected={settings.effort === effort}
                    onSelect={() => set({ effort })}
                  >
                    {EFFORT_LABELS[effort]}
                  </MenuItem>
                ))}
              </MenuSection>
              <MenuSection>
                <MenuItem
                  icon="speed-middle"
                  closeOnSelect={false}
                  onSelect={() => set({ fastMode: !settings.fastMode })}
                  trailing={
                    <span
                      className={`composer-switch ${settings.fastMode ? "on" : ""}`}
                      role="switch"
                      aria-checked={settings.fastMode}
                    />
                  }
                >
                  Fast mode
                </MenuItem>
              </MenuSection>
            </ComposerPillMenu>

            {!compact && (
              <ComposerPillMenu
                label={
                  <>
                    {ASPECT_LABELS[settings.aspect]}{" "}
                    <span className="composer-pill-dim">{settings.aspect}</span>
                  </>
                }
                leading={
                  <Icon
                    name="aspect-ratio"
                    size={16}
                    style={
                      settings.aspect === "9:16" || settings.aspect === "4:5"
                        ? { transform: "rotate(-90deg)" }
                        : undefined
                    }
                  />
                }
              >
                {aspectSection}
              </ComposerPillMenu>
            )}

            {!compact && (
              <ComposerPillMenu label={`${settings.durationSec}s`} leading={<Icon name="clock" size={16} />}>
                {durationSection}
              </ComposerPillMenu>
            )}
          </div>
          <div className="composer-actions">
            {compact && (
              <Menu
                popClassName="composer-pop composer-pop-right"
                trigger={(toggle) => (
                  <button
                    className="composer-pill composer-pill--icon"
                    aria-label="Settings"
                    onClick={toggle}
                  >
                    <Icon name="settings-slider" size={16} />
                  </button>
                )}
              >
                {aspectSection}
                {durationSection}
                {referenceModeSection}
              </Menu>
            )}
            <button
              className="composer-submit"
              aria-label={settings.mode === "critique" ? "Run critique" : "Generate"}
              disabled={!canSubmit || busy}
              onClick={onSubmit}
            >
              {busy ? <span className="composer-spinner" /> : <Icon name="arrow-up" size={16} />}
            </button>
          </div>
        </div>
      </div>

      {compact ? null : (
        <div className="composer-footer">
          <div className="composer-footer-row">
            <button className="composer-footer-btn" disabled={busy} onClick={() => refInput.current?.click()}>
              <Icon name="slide-add" size={16} />
              Add reference
            </button>
            <Menu
              popClassName="composer-pop composer-pop-right"
              trigger={(toggle) => (
                <button
                  className={`composer-footer-btn ${references.length === 0 ? "composer-footer-btn--idle" : ""}`}
                  disabled={busy}
                  onClick={toggle}
                >
                  <Icon name="three-d" size={16} />
                  {REFERENCE_MODE_LABELS[settings.referenceMode]}
                </button>
              )}
            >
              {referenceModeSection}
            </Menu>
          </div>
          {references.length > 0 && (
            <div className="composer-refs">
              {references.map((ref) => (
                <Thumbnail key={ref.id} src={ref.thumb} size={64} duration={ref.duration} alt={ref.name}>
                  <button
                    className="composer-ref-remove"
                    aria-label={`Remove ${ref.name}`}
                    onClick={() => onRemoveReference(ref.id)}
                  >
                    ×
                  </button>
                </Thumbnail>
              ))}
            </div>
          )}
          <input
            ref={refInput}
            type="file"
            accept="video/*,image/*"
            multiple
            hidden
            onChange={pickReferences}
          />
        </div>
      )}
    </div>
  );
}

/** A toolbar pill that opens its options menu above the composer. */
function ComposerPillMenu({
  label,
  leading,
  children,
}: {
  label: ReactNode;
  leading: ReactNode;
  children: ReactNode;
}): JSX.Element {
  return (
    <Menu
      popClassName="composer-pop"
      trigger={(toggle) => (
        <button className="composer-pill" onClick={toggle}>
          {leading}
          <span className="composer-pill-label">{label}</span>
        </button>
      )}
    >
      {children}
    </Menu>
  );
}
