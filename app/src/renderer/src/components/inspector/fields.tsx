import { type ReactNode, useEffect, useState } from "react";
import { Icon, type IconName } from "../ui";

/**
 * The Inspector's form primitives, split out of InspectorPanel. Several are
 * "draft + commit-on-blur" wrappers that coalesce edits into one undo step
 * (and fix the untypeable hex field / number 0-snap) — see individual notes.
 */

export function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <div className="rail-section">
      <div className="rail-head">{title}</div>
      <div className="rail-body" style={{ gap: 12 }}>
        {children}
      </div>
    </div>
  );
}

export function SegGroup({
  options,
  value,
  onChange,
}: {
  options: { id: string; icon: IconName }[];
  value: string;
  onChange: (id: string) => void;
}): JSX.Element {
  return (
    <div className="seg-group">
      {options.map((o) => (
        <button
          key={o.id}
          className={`seg-btn ${value === o.id ? "active" : ""}`}
          onClick={() => onChange(o.id)}
          title={o.id}
          aria-label={o.id}
        >
          <Icon name={o.icon} size={16} />
        </button>
      ))}
    </div>
  );
}

/**
 * Multi-line text field that commits once, on blur — a typed sentence is one
 * undo step, not one per character. The preview updates when focus leaves.
 */
export function DraftTextArea({
  value,
  onCommit,
}: {
  value: string;
  onCommit: (v: string) => void;
}): JSX.Element {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(value);
  }, [value, editing]);

  return (
    <textarea
      className="rail-textarea"
      style={{ height: 56 }}
      value={editing ? draft : value}
      onFocus={() => {
        setEditing(true);
        setDraft(value);
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={() => {
        setEditing(false);
        if (draft !== value) onCommit(draft);
      }}
    />
  );
}

/**
 * Number field that keeps keystrokes in local state and commits once, on blur
 * or Enter. Without this, every digit was its own updateEdl (an undo step + a
 * scheduled save), and clearing the field sent `Number("") === 0`, snapping the
 * value to 0 mid-edit. External changes (e.g. dragging the clip on the
 * timeline) sync in while the field isn't focused.
 */
function DraftNumberInput({
  value,
  onChange,
  min,
  step = 0.1,
  ariaLabel,
}: {
  value: number;
  onChange: (v: number) => void;
  min?: number;
  step?: number;
  ariaLabel?: string;
}): JSX.Element {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(String(value));
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const n = Number(draft);
    const valid = draft.trim() !== "" && Number.isFinite(n) && (min === undefined || n >= min);
    if (valid) onChange(n);
    else setDraft(String(value));
  };

  return (
    <input
      type="number"
      step={step}
      min={min}
      aria-label={ariaLabel}
      value={editing ? draft : String(value)}
      onFocus={() => {
        setEditing(true);
        setDraft(String(value));
      }}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") e.currentTarget.blur();
        else if (e.key === "Escape") {
          setDraft(String(value));
          setEditing(false);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

export function PaddingChip({
  rotation,
  value,
  onChange,
  side,
}: {
  rotation: number;
  value: number;
  onChange: (v: number) => void;
  side: string;
}): JSX.Element {
  return (
    <span className="chip-field">
      <Icon name="layout-align-left" size={16} style={{ transform: `rotate(${rotation}deg)` }} />
      <DraftNumberInput value={value} onChange={onChange} min={0} step={1} ariaLabel={`${side} padding`} />
    </span>
  );
}

export function NumberChip({
  label,
  value,
  onChange,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
}): JSX.Element {
  return (
    <span className="insp-group">
      <span className="insp-label">{label}</span>
      <span className="chip-field">
        <DraftNumberInput value={value} onChange={onChange} ariaLabel={label} />
      </span>
    </span>
  );
}

/**
 * Range input that shows its live position during a drag but commits a single
 * updateEdl on release (pointer-up / key-up / blur) — one undo step per drag
 * instead of dozens, and no per-tick disk write.
 */
export function DraftSlider({
  label,
  value,
  min,
  max,
  step,
  format,
  onCommit,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  format: (v: number) => string;
  onCommit: (v: number) => void;
}): JSX.Element {
  const [draft, setDraft] = useState(value);
  const [dragging, setDragging] = useState(false);
  useEffect(() => {
    if (!dragging) setDraft(value);
  }, [value, dragging]);
  const shown = dragging ? draft : value;

  const commit = () => {
    if (!dragging) return;
    setDragging(false);
    if (draft !== value) onCommit(draft);
  };

  return (
    <div className="insp-group" style={{ width: "100%" }}>
      <span className="insp-label">
        {label} {format(shown)}
      </span>
      <input
        className="insp-slider"
        type="range"
        min={min}
        max={max}
        step={step}
        value={shown}
        aria-label={label}
        onChange={(e) => {
          setDragging(true);
          setDraft(Number(e.target.value));
        }}
        onPointerUp={commit}
        onKeyUp={commit}
        onBlur={commit}
      />
    </div>
  );
}

export function ColorChip({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}): JSX.Element {
  const [draft, setDraft] = useState(value.toUpperCase());
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setDraft(value.toUpperCase());
  }, [value, editing]);

  const commit = () => {
    setEditing(false);
    const v = draft.trim();
    if (/^#[0-9a-fA-F]{6}$/.test(v) || /^#[0-9a-fA-F]{3}$/.test(v)) onChange(v.toUpperCase());
    else setDraft(value.toUpperCase());
  };

  return (
    <span className="insp-group">
      <span className="insp-label">{label}</span>
      <span className="chip-field">
        <input
          className="chip-swatch"
          type="color"
          aria-label={`${label} swatch`}
          value={normalizeHex(value)}
          onChange={(e) => onChange(e.target.value.toUpperCase())}
        />
        {/* Local draft so intermediate keystrokes (e.g. "#E8" before "#E8B04B")
            aren't reverted by the controlled value — the old field was
            paste-only. Commits a complete hex on blur/Enter. */}
        <input
          type="text"
          aria-label={label}
          value={editing ? draft : value.toUpperCase()}
          onFocus={() => {
            setEditing(true);
            setDraft(value.toUpperCase());
          }}
          onChange={(e) => setDraft(e.target.value)}
          onBlur={commit}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
            else if (e.key === "Escape") {
              setDraft(value.toUpperCase());
              setEditing(false);
              e.currentTarget.blur();
            }
          }}
        />
      </span>
    </span>
  );
}

export function InspSelect({
  value,
  onChange,
  options,
  icon,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string }[];
  icon?: IconName;
}): JSX.Element {
  return (
    <span className="insp-select">
      {icon && <Icon name={icon} size={16} style={{ transform: "rotate(90deg)" }} />}
      <select value={value} onChange={(e) => onChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <Icon
        name="chevron-top"
        size={16}
        style={{ transform: "rotate(180deg)", color: "var(--foreground-secondary)" }}
      />
    </span>
  );
}

function normalizeHex(c: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c;
  if (/^#[0-9a-fA-F]{3}$/.test(c)) {
    return (
      "#" +
      c
        .slice(1)
        .split("")
        .map((x) => x + x)
        .join("")
    );
  }
  return "#000000";
}
