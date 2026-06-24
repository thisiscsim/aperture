import { useEditor } from "../store";

const FONTS = [
  { label: "Editorial serif", value: "ui-serif, Georgia, serif" },
  { label: "Inter (sans)", value: "Inter, system-ui, sans-serif" },
  { label: "System sans", value: "system-ui, -apple-system, sans-serif" },
  { label: "Mono", value: "'SF Mono', ui-monospace, monospace" },
];

const CAPTION_STYLES = ["karaoke", "block", "word", "none"];
const PALETTE_LABELS = ["Text", "Background", "Accent"];

export function DesignPanel(): JSX.Element {
  const edl = useEditor((s) => s.edl);
  const updateEdl = useEditor((s) => s.updateEdl);

  if (!edl) return <div />;

  return (
    <div className="pad fields">
      <label className="field">
        <span className="field-label">Display font</span>
        <select
          className="input"
          value={edl.theme.fontFamily}
          onChange={(e) => updateEdl((d) => (d.theme.fontFamily = e.target.value))}
        >
          {FONTS.map((f) => (
            <option key={f.value} value={f.value}>
              {f.label}
            </option>
          ))}
          {!FONTS.some((f) => f.value === edl.theme.fontFamily) && (
            <option value={edl.theme.fontFamily}>{edl.theme.fontFamily}</option>
          )}
        </select>
      </label>

      <div className="field">
        <span className="field-label">Palette</span>
        <div className="swatches">
          {edl.theme.palette.slice(0, 3).map((c, i) => (
            <label key={i} className="swatch">
              <input
                type="color"
                value={normalizeHex(c)}
                onChange={(e) => updateEdl((d) => (d.theme.palette[i] = e.target.value))}
              />
              <span>{PALETTE_LABELS[i] ?? `Color ${i + 1}`}</span>
            </label>
          ))}
        </div>
      </div>

      <label className="field">
        <span className="field-label">Captions</span>
        <select
          className="input"
          value={edl.theme.captionStyle}
          onChange={(e) =>
            updateEdl((d) => (d.theme.captionStyle = e.target.value as typeof d.theme.captionStyle))
          }
        >
          {CAPTION_STYLES.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </select>
      </label>

      <label className="field">
        <span className="field-label">
          Safe top <span className="muted">{edl.theme.safeMargins.top}px</span>
        </span>
        <input
          type="range"
          min={0}
          max={600}
          value={edl.theme.safeMargins.top}
          onChange={(e) => updateEdl((d) => (d.theme.safeMargins.top = Number(e.target.value)))}
        />
      </label>

      <label className="field">
        <span className="field-label">
          Safe bottom <span className="muted">{edl.theme.safeMargins.bottom}px</span>
        </span>
        <input
          type="range"
          min={0}
          max={600}
          value={edl.theme.safeMargins.bottom}
          onChange={(e) => updateEdl((d) => (d.theme.safeMargins.bottom = Number(e.target.value)))}
        />
      </label>
    </div>
  );
}

function normalizeHex(c: string): string {
  if (/^#[0-9a-fA-F]{6}$/.test(c)) return c;
  if (/^#[0-9a-fA-F]{3}$/.test(c)) {
    return "#" + c.slice(1).split("").map((x) => x + x).join("");
  }
  return "#000000";
}
