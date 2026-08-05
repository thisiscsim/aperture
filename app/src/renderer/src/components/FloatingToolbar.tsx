import { useEditor } from "../store";
import { ColorChip, InspSelect, PaddingChip, SegGroup } from "./inspector/fields";
import { Icon, Menu, type IconName } from "./ui";

/**
 * The dynamic inspector (Figma Alignment/Typeface/Padding/Color frames): a
 * vertical toolbar floating on the preview stage whose popovers edit the
 * project theme. Per-clip states (text/video/audio scopes) follow in the
 * dedicated toolbar PR; this is the base (no-selection) scope.
 */

const FONTS = [
  { label: "Editorial serif", value: "ui-serif, Georgia, serif" },
  { label: "Playfair Display", value: "'Playfair Display', ui-serif, Georgia, serif" },
  { label: "Inter (sans)", value: "Inter, system-ui, sans-serif" },
  { label: "System sans", value: "system-ui, -apple-system, sans-serif" },
  { label: "Mono", value: "'SF Mono', ui-monospace, monospace" },
];

const CAPTION_STYLES = ["karaoke", "block", "word", "none"];

const DEFAULT_ALIGN = { horizontal: "center", vertical: "center" } as const;

export function FloatingToolbar(): JSX.Element | null {
  const edl = useEditor((s) => s.edl);
  const updateEdl = useEditor((s) => s.updateEdl);

  if (!edl) return null;

  // Tolerate EDLs parsed before theme.textAlignment existed.
  const align = edl.theme.textAlignment ?? DEFAULT_ALIGN;
  const margins = edl.theme.safeMargins;

  const setAlign = (patch: Partial<typeof align>) =>
    updateEdl((d) => {
      d.theme.textAlignment = { ...DEFAULT_ALIGN, ...d.theme.textAlignment, ...patch };
    });

  const setMargin = (side: "top" | "bottom" | "left" | "right", value: number) =>
    updateEdl((d) => {
      d.theme.safeMargins[side] = Math.max(0, value || 0);
    });

  return (
    <div className="ftb" role="toolbar" aria-label="Design tools">
      <Tool icon="layout-dashboard" label="Alignment">
        <div className="ftb-pop-title">Alignment</div>
        <div className="ftb-row">
          <SegGroup
            options={[
              { id: "left", icon: "vertical-align-left" },
              { id: "center", icon: "vertical-align-center" },
              { id: "right", icon: "vertical-align-right" },
            ]}
            value={align.horizontal}
            onChange={(v) => setAlign({ horizontal: v as typeof align.horizontal })}
          />
          <SegGroup
            options={[
              { id: "top", icon: "horizontal-align-top" },
              { id: "center", icon: "horizontal-align-center" },
              { id: "bottom", icon: "horizontal-align-bottom" },
            ]}
            value={align.vertical}
            onChange={(v) => setAlign({ vertical: v as typeof align.vertical })}
          />
        </div>
      </Tool>

      <Tool icon="font-style" label="Typeface">
        <div className="ftb-pop-title">Typeface</div>
        <InspSelect
          value={edl.theme.fontFamily}
          onChange={(v) => updateEdl((d) => (d.theme.fontFamily = v))}
          options={[
            ...FONTS.map((f) => ({ value: f.value, label: f.label })),
            ...(FONTS.some((f) => f.value === edl.theme.fontFamily)
              ? []
              : [{ value: edl.theme.fontFamily, label: edl.theme.fontFamily }]),
          ]}
        />
        <div className="ftb-pop-title">Captions</div>
        <InspSelect
          value={edl.theme.captionStyle}
          onChange={(v) => updateEdl((d) => (d.theme.captionStyle = v as typeof d.theme.captionStyle))}
          options={CAPTION_STYLES.map((s) => ({ value: s, label: s }))}
        />
      </Tool>

      <Tool icon="layout-all-sides" label="Padding">
        <div className="ftb-pop-title">Padding</div>
        <div className="ftb-row">
          <PaddingChip rotation={0} value={margins.left} onChange={(v) => setMargin("left", v)} side="left" />
          <PaddingChip rotation={90} value={margins.top} onChange={(v) => setMargin("top", v)} side="top" />
          <PaddingChip
            rotation={180}
            value={margins.right}
            onChange={(v) => setMargin("right", v)}
            side="right"
          />
          <PaddingChip
            rotation={-90}
            value={margins.bottom}
            onChange={(v) => setMargin("bottom", v)}
            side="bottom"
          />
        </div>
      </Tool>

      <Tool icon="color-palette" label="Color">
        <div className="ftb-pop-title">Color</div>
        <div className="ftb-col">
          <ColorChip
            label="Text color"
            value={edl.theme.palette[0] ?? "#FFFFFF"}
            onChange={(v) => updateEdl((d) => (d.theme.palette[0] = v))}
          />
          <ColorChip
            label="Background color"
            value={edl.theme.palette[1] ?? "#0F0E0D"}
            onChange={(v) => updateEdl((d) => (d.theme.palette[1] = v))}
          />
          <ColorChip
            label="Accent color"
            value={edl.theme.palette[2] ?? "#FEAF00"}
            onChange={(v) => updateEdl((d) => (d.theme.palette[2] = v))}
          />
        </div>
      </Tool>
    </div>
  );
}

function Tool({
  icon,
  label,
  children,
}: {
  icon: IconName;
  label: string;
  children: React.ReactNode;
}): JSX.Element {
  return (
    <Menu
      popClassName="ftb-pop"
      trigger={(toggle, open) => (
        <button
          className={`ftb-btn ${open ? "active" : ""}`}
          title={label}
          aria-label={label}
          onClick={toggle}
        >
          <Icon name={icon} size={20} />
        </button>
      )}
    >
      {children}
    </Menu>
  );
}
