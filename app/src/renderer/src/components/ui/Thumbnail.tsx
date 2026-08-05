import type { ReactNode } from "react";

/**
 * Media thumbnail per the Figma spec: square cover image whose corner radius
 * tracks its size (16→4 … 64→8), with an optional duration badge for video
 * assets. `src: null` renders the empty (secondary-surface) placeholder.
 */

const RADII: Record<number, number> = { 16: 4, 20: 5, 24: 6, 32: 8, 40: 10, 48: 8, 64: 8 };

export function Thumbnail({
  src,
  size = 64,
  duration,
  alt = "",
  children,
}: {
  src: string | null;
  size?: number;
  /** Formatted duration label (e.g. "00:21") overlaid bottom-left. */
  duration?: string;
  alt?: string;
  /** Extra overlays (e.g. a remove button) positioned within the thumb. */
  children?: ReactNode;
}): JSX.Element {
  const radius = RADII[size] ?? 8;
  return (
    <span className="ui-thumb" style={{ width: size, height: size, borderRadius: radius }}>
      {src ? <img src={src} alt={alt} /> : <span className="ui-thumb-empty" />}
      {duration && <span className="ui-thumb-duration">{duration}</span>}
      {children}
    </span>
  );
}
