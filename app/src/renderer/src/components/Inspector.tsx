import type { ReactNode } from "react";
import { useEditor } from "../store";
import { findTextClip, findVideoClip, mutateTextClip, mutateVideoClip } from "../lib/edl-edit";

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
const STYLES = ["title", "subtitle"];
const TRANSITIONS = ["none", "fade", "slide", "wipe"];

export function Inspector(): JSX.Element {
  const edl = useEditor((s) => s.edl);
  const selectedClipId = useEditor((s) => s.selectedClipId);
  const updateEdl = useEditor((s) => s.updateEdl);

  if (!edl) return <div />;

  const textClip = findTextClip(edl, selectedClipId);
  const videoClip = findVideoClip(edl, selectedClipId);

  if (!textClip && !videoClip) {
    return (
      <div className="pad muted small">
        {selectedClipId ? "This clip type isn't editable yet." : "Select a clip on the timeline to edit it."}
      </div>
    );
  }

  if (textClip) {
    const id = textClip.id;
    return (
      <div className="pad fields">
        <Field label="Text">
          <textarea
            className="input"
            rows={2}
            value={textClip.text}
            onChange={(e) => updateEdl((d) => mutateTextClip(d, id, (c) => (c.text = e.target.value)))}
          />
        </Field>
        <Field label="Style">
          <select
            className="input"
            value={textClip.style}
            onChange={(e) => updateEdl((d) => mutateTextClip(d, id, (c) => (c.style = e.target.value)))}
          >
            {STYLES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Animation">
          <select
            className="input"
            value={textClip.anim?.name ?? "soft-blur-in"}
            onChange={(e) =>
              updateEdl((d) =>
                mutateTextClip(d, id, (c) => (c.anim = { name: e.target.value, from: "animate-text" })),
              )
            }
          >
            {ANIMS.map((a) => (
              <option key={a} value={a}>
                {a}
              </option>
            ))}
          </select>
        </Field>
        <div className="field-row">
          <Field label="Start (s)">
            <input
              className="input"
              type="number"
              step={0.1}
              value={textClip.start}
              onChange={(e) => updateEdl((d) => mutateTextClip(d, id, (c) => (c.start = Number(e.target.value))))}
            />
          </Field>
          <Field label="End (s)">
            <input
              className="input"
              type="number"
              step={0.1}
              value={textClip.end}
              onChange={(e) => updateEdl((d) => mutateTextClip(d, id, (c) => (c.end = Number(e.target.value))))}
            />
          </Field>
        </div>
      </div>
    );
  }

  // video clip
  const id = videoClip!.id;
  const setTransition = (edge: "transitionIn" | "transitionOut", preset: string) =>
    updateEdl((d) =>
      mutateVideoClip(d, id, (c) => {
        if (preset === "none") delete c[edge];
        else c[edge] = { preset, duration: c[edge]?.duration ?? 0.4 };
      }),
    );

  return (
    <div className="pad fields">
      <Field label="Clip">
        <div className="muted small">{videoClip!.assetId}</div>
      </Field>
      <div className="field-row">
        <Field label="In (s)">
          <input
            className="input"
            type="number"
            step={0.1}
            value={videoClip!.in}
            onChange={(e) => updateEdl((d) => mutateVideoClip(d, id, (c) => (c.in = Number(e.target.value))))}
          />
        </Field>
        <Field label="Out (s)">
          <input
            className="input"
            type="number"
            step={0.1}
            value={videoClip!.out}
            onChange={(e) => updateEdl((d) => mutateVideoClip(d, id, (c) => (c.out = Number(e.target.value))))}
          />
        </Field>
      </div>
      <Field label={`Volume ${Math.round((videoClip!.volume ?? 1) * 100)}%`}>
        <input
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={videoClip!.volume ?? 1}
          onChange={(e) => updateEdl((d) => mutateVideoClip(d, id, (c) => (c.volume = Number(e.target.value))))}
        />
      </Field>
      <div className="field-row">
        <Field label="Transition in">
          <select
            className="input"
            value={videoClip!.transitionIn?.preset ?? "none"}
            onChange={(e) => setTransition("transitionIn", e.target.value)}
          >
            {TRANSITIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Transition out">
          <select
            className="input"
            value={videoClip!.transitionOut?.preset ?? "none"}
            onChange={(e) => setTransition("transitionOut", e.target.value)}
          >
            {TRANSITIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
    </label>
  );
}
