import { useEditor } from "../store";
import {
  findAudioClip,
  findTextClip,
  findVideoClip,
  mutateAudioClip,
  mutateTextClip,
  mutateVideoClip,
} from "../lib/edl-edit";
import type { AudioClip, TextClip, VideoClip } from "@reel/edl";
import {
  ColorChip,
  DraftSlider,
  DraftTextArea,
  InspSelect,
  NumberChip,
  PaddingChip,
  SegGroup,
} from "./inspector/fields";
import { Icon, Menu, type IconName } from "./ui";

/**
 * The dynamic inspector (Figma Alignment/Typeface/Padding/Color frames): a
 * vertical toolbar floating on the preview stage. With nothing selected it
 * edits the project theme; selecting a clip on the timeline swaps in that
 * clip's tools (text / video / audio scopes ported from the old inspector).
 */

const FONTS = [
  { label: "Editorial serif", value: "ui-serif, Georgia, serif" },
  { label: "Playfair Display", value: "'Playfair Display', ui-serif, Georgia, serif" },
  { label: "Inter (sans)", value: "Inter, system-ui, sans-serif" },
  { label: "System sans", value: "system-ui, -apple-system, sans-serif" },
  { label: "Mono", value: "'SF Mono', ui-monospace, monospace" },
];

const CAPTION_STYLES = ["karaoke", "block", "word", "none"];
const ANIMS = [
  "soft-blur-in",
  "per-character-rise",
  "per-word-crossfade",
  "spring-scale-in",
  "mask-reveal-up",
  "blur-out-up",
  "scale-down-fade",
  "typewriter",
];
const TRANSITIONS = ["none", "fade", "slide", "wipe"];

const DEFAULT_ALIGN = { horizontal: "center", vertical: "center" } as const;

export function FloatingToolbar(): JSX.Element | null {
  const edl = useEditor((s) => s.edl);
  const selectedClipId = useEditor((s) => s.selectedClipId);

  if (!edl) return null;

  const textClip = selectedClipId ? findTextClip(edl, selectedClipId) : null;
  const videoClip = selectedClipId ? findVideoClip(edl, selectedClipId) : null;
  const audioClip = selectedClipId ? findAudioClip(edl, selectedClipId) : null;

  if (textClip) return <TextToolbar clip={textClip} />;
  if (videoClip) return <VideoToolbar clip={videoClip} />;
  if (audioClip) return <AudioToolbar clip={audioClip} />;
  return <ThemeToolbar />;
}

/* ---------------- project (theme) scope ---------------- */

function ThemeToolbar(): JSX.Element {
  const edl = useEditor((s) => s.edl)!;
  const updateEdl = useEditor((s) => s.updateEdl);

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

/* ---------------- clip scopes ---------------- */

function TextToolbar({ clip }: { clip: TextClip }): JSX.Element {
  const updateEdl = useEditor((s) => s.updateEdl);
  const id = clip.id;
  return (
    <div className="ftb" role="toolbar" aria-label="Text clip tools">
      <DeselectButton />
      <span className="ftb-divider" />
      <Tool icon="font-style" label="Text">
        <div className="ftb-pop-title">Content</div>
        <DraftTextArea
          value={clip.text}
          onCommit={(text) => updateEdl((d) => mutateTextClip(d, id, (c) => (c.text = text)))}
        />
        <div className="ftb-pop-title">Style</div>
        <InspSelect
          value={clip.style}
          onChange={(v) => updateEdl((d) => mutateTextClip(d, id, (c) => (c.style = v)))}
          options={["title", "subtitle"].map((s) => ({ value: s, label: s }))}
        />
      </Tool>
      <Tool icon="magic-wand" label="Animation">
        <div className="ftb-pop-title">Animation</div>
        <InspSelect
          value={clip.anim?.name ?? "soft-blur-in"}
          onChange={(v) =>
            updateEdl((d) => mutateTextClip(d, id, (c) => (c.anim = { name: v, from: "animate-text" })))
          }
          options={ANIMS.map((a) => ({ value: a, label: a }))}
        />
      </Tool>
      <Tool icon="clock" label="Timing">
        <div className="ftb-pop-title">Timing</div>
        <div className="ftb-row">
          <NumberChip
            label="Start (s)"
            value={clip.start}
            onChange={(v) => updateEdl((d) => mutateTextClip(d, id, (c) => (c.start = v)))}
          />
          <NumberChip
            label="End (s)"
            value={clip.end}
            onChange={(v) => updateEdl((d) => mutateTextClip(d, id, (c) => (c.end = v)))}
          />
        </div>
      </Tool>
    </div>
  );
}

function VideoToolbar({ clip }: { clip: VideoClip }): JSX.Element {
  const updateEdl = useEditor((s) => s.updateEdl);
  const id = clip.id;
  const setTransition = (edge: "transitionIn" | "transitionOut", preset: string) =>
    updateEdl((d) =>
      mutateVideoClip(d, id, (c) => {
        if (preset === "none") delete c[edge];
        else c[edge] = { preset, duration: c[edge]?.duration ?? 0.4 };
      }),
    );
  return (
    <div className="ftb" role="toolbar" aria-label="Video clip tools">
      <DeselectButton />
      <span className="ftb-divider" />
      <Tool icon="form-rectangle" label="Trim">
        <div className="ftb-pop-title">{`Trim · ${clip.assetId}`}</div>
        <div className="ftb-row">
          <NumberChip
            label="In (s)"
            value={clip.in}
            onChange={(v) => updateEdl((d) => mutateVideoClip(d, id, (c) => (c.in = v)))}
          />
          <NumberChip
            label="Out (s)"
            value={clip.out}
            onChange={(v) => updateEdl((d) => mutateVideoClip(d, id, (c) => (c.out = v)))}
          />
        </div>
      </Tool>
      <Tool icon="volume-full" label="Volume">
        <div className="ftb-pop-title">Volume</div>
        <DraftSlider
          label="Volume"
          value={clip.volume ?? 1}
          min={0}
          max={1}
          step={0.05}
          format={(v) => `${Math.round(v * 100)}%`}
          onCommit={(v) => updateEdl((d) => mutateVideoClip(d, id, (c) => (c.volume = v)))}
        />
      </Tool>
      <Tool icon="arrow-rotate" label="Transitions">
        <div className="ftb-pop-title">Transition in</div>
        <InspSelect
          value={clip.transitionIn?.preset ?? "none"}
          onChange={(v) => setTransition("transitionIn", v)}
          options={TRANSITIONS.map((t) => ({ value: t, label: t }))}
        />
        <div className="ftb-pop-title">Transition out</div>
        <InspSelect
          value={clip.transitionOut?.preset ?? "none"}
          onChange={(v) => setTransition("transitionOut", v)}
          options={TRANSITIONS.map((t) => ({ value: t, label: t }))}
        />
      </Tool>
    </div>
  );
}

function AudioToolbar({ clip }: { clip: AudioClip }): JSX.Element {
  const updateEdl = useEditor((s) => s.updateEdl);
  const id = clip.id;
  return (
    <div className="ftb" role="toolbar" aria-label="Audio clip tools">
      <DeselectButton />
      <span className="ftb-divider" />
      <Tool icon="voice-high" label="Audio">
        <div className="ftb-pop-title">{`Audio · ${clip.assetId}`}</div>
        <InspSelect
          value={clip.role}
          onChange={(v) => updateEdl((d) => mutateAudioClip(d, id, (c) => (c.role = v as typeof c.role)))}
          options={["music", "voiceover", "sfx"].map((r) => ({ value: r, label: r }))}
        />
        <DraftSlider
          label="Gain"
          value={clip.gain}
          min={-24}
          max={6}
          step={1}
          format={(v) => `${v} dB`}
          onCommit={(v) => updateEdl((d) => mutateAudioClip(d, id, (c) => (c.gain = v)))}
        />
        <label className="insp-check">
          <input
            type="checkbox"
            checked={clip.duckUnderVoice}
            onChange={(e) =>
              updateEdl((d) => mutateAudioClip(d, id, (c) => (c.duckUnderVoice = e.target.checked)))
            }
          />
          Duck under voice
        </label>
      </Tool>
    </div>
  );
}

/* ---------------- shared chrome ---------------- */

function DeselectButton(): JSX.Element {
  const select = useEditor((s) => s.select);
  return (
    <button
      className="ftb-btn"
      title="Back to project design"
      aria-label="Back to project design"
      onClick={() => select(null)}
    >
      <Icon name="arrow-left" size={16} />
    </button>
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
