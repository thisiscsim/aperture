import type { KeyboardEvent, ReactNode } from "react";
import { Icon, type IconName } from "./Icon";

/**
 * Grid card (Figma tile spec): square media on top, title/meta row below with
 * an optional actions slot (typically a `Menu`). The whole tile activates on
 * click and Enter/Space; hover lifts the media only, so text stays put.
 * Purely presentational — data fetching and menu wiring stay at call sites.
 */

function activateOnKey(e: KeyboardEvent, fn: () => void): void {
  if (e.key === "Enter" || e.key === " ") {
    e.preventDefault();
    fn();
  }
}

export function Tile({
  media,
  title,
  meta,
  actions,
  onOpen,
  children,
}: {
  media: ReactNode;
  title: string;
  meta?: string;
  actions?: ReactNode;
  onOpen: () => void;
  /** Overlays (e.g. dialogs) rendered inside the tile, shielded from its activation. */
  children?: ReactNode;
}): JSX.Element {
  return (
    <div
      className="tile"
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => activateOnKey(e, onOpen)}
    >
      {media}
      <div className="tile-info">
        <div className="tile-text">
          <div className="tile-title">{title}</div>
          {meta && <div className="tile-meta">{meta}</div>}
        </div>
        {actions}
      </div>
      {children ? (
        <div onClick={(e) => e.stopPropagation()} onKeyDown={(e) => e.stopPropagation()}>
          {children}
        </div>
      ) : null}
    </div>
  );
}

export function TileThumb({
  src,
  emptyLabel = "",
}: {
  src: string | null;
  emptyLabel?: string;
}): JSX.Element {
  return (
    <div className="tile-thumb">
      {src ? <img src={src} alt="" /> : <div className="tile-thumb-empty">{emptyLabel}</div>}
    </div>
  );
}

/** 2x2 cover collage; missing cells render as empty placeholders. */
export function AlbumCover({ cells }: { cells: ReactNode[] }): JSX.Element {
  return (
    <div className="album-cover">
      {Array.from(
        { length: 4 },
        (_, i) => cells[i] ?? <span key={`empty-${i}`} className="album-cover-cell album-cover-empty" />,
      )}
    </div>
  );
}

export function AlbumCoverCell({ src }: { src: string | null }): JSX.Element {
  return (
    <span className="album-cover-cell">
      {src ? <img src={src} alt="" /> : <span className="album-cover-empty" />}
    </span>
  );
}

/** Dashed call-to-action tile (e.g. "New project"). */
export function NewTile({
  icon,
  children,
  onClick,
}: {
  icon?: IconName;
  children: ReactNode;
  onClick: () => void;
}): JSX.Element {
  return (
    <button className="tile tile-new" onClick={onClick}>
      {icon && <Icon name={icon} size={16} />}
      <span>{children}</span>
    </button>
  );
}
