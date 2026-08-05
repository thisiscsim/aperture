import type { ReactNode } from "react";

/**
 * Hover/focus tooltip per the Figma spec: pill on the inverted surface,
 * centered above the trigger. Pure CSS show/hide with an intent delay, so it
 * adds no listeners or portals — fine for the short labels the kit needs.
 */
export function Tooltip({ label, children }: { label: string; children: ReactNode }): JSX.Element {
  return (
    <span className="ui-tooltip-wrap">
      {children}
      <span className="ui-tooltip" role="tooltip">
        {label}
      </span>
    </span>
  );
}
