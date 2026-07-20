import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type MouseEvent,
  type ReactNode,
} from "react";
import { Icon, type IconName } from "./Icon";
import { useEscapeKey } from "./useEscapeKey";

/**
 * The kit dropdown (Figma popover spec: 240px, radius 10, layered shadow,
 * 32px rows). Owns open state, Escape and outside-click dismissal; items
 * close the whole menu on select. `MenuSub` provides a hover flyout whose
 * first item aligns with its origin row (gap-bridged, grace-timed).
 *
 * Positioning of the popover is delegated to `popClassName` (e.g.
 * `tile-menu-pop`, `sort-pop`, `presets-pop`, `tl-layer-menu`) so call sites
 * control anchor/direction while look and behavior stay canonical.
 */

interface MenuContextValue {
  close: () => void;
}

const MenuContext = createContext<MenuContextValue | null>(null);

export function Menu({
  trigger,
  children,
  className,
  popClassName,
}: {
  /** Render the trigger; call `toggle` to open/close. */
  trigger: (toggle: () => void, open: boolean) => ReactNode;
  children: ReactNode;
  className?: string;
  popClassName?: string;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEscapeKey(open ? () => setOpen(false) : null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: globalThis.MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div
      className={["ui-menu", className].filter(Boolean).join(" ")}
      ref={ref}
      onClick={(e: MouseEvent<HTMLDivElement>) => e.stopPropagation()}
    >
      {trigger(() => setOpen((v) => !v), open)}
      {open && (
        <div className={["menu-pop", popClassName].filter(Boolean).join(" ")} role="menu">
          <MenuContext.Provider value={{ close: () => setOpen(false) }}>{children}</MenuContext.Provider>
        </div>
      )}
    </div>
  );
}

export function MenuItem({
  icon,
  leading,
  hint,
  danger,
  closeOnSelect = true,
  onSelect,
  children,
}: {
  icon?: IconName;
  /** Custom leading node (e.g. a thumbnail) when an icon isn't enough. */
  leading?: ReactNode;
  /** Secondary line under the label (e.g. preset inspiration). */
  hint?: string;
  danger?: boolean;
  closeOnSelect?: boolean;
  onSelect?: () => void | Promise<void>;
  children: ReactNode;
}): JSX.Element {
  const ctx = useContext(MenuContext);
  const cls = ["menu-item", danger ? "danger" : "", hint ? "menu-item--stacked" : ""]
    .filter(Boolean)
    .join(" ");
  return (
    <button
      className={cls}
      role="menuitem"
      onClick={(e) => {
        e.stopPropagation();
        if (closeOnSelect) ctx?.close();
        void onSelect?.();
      }}
    >
      {leading}
      {icon && <Icon name={icon} size={16} />}
      {hint ? (
        <span className="menu-item-label">
          <span className="menu-item-name">{children}</span>
          <span className="menu-item-hint">{hint}</span>
        </span>
      ) : (
        <span className="menu-item-label">{children}</span>
      )}
    </button>
  );
}

export function MenuSub({
  icon,
  label,
  children,
}: {
  icon?: IconName;
  label: string;
  children: ReactNode;
}): JSX.Element {
  const [open, setOpen] = useState(false);
  // Grace timer tolerates diagonal cursor travel across the gap (paired with
  // the ::before hover bridge on .menu-sub).
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const enter = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = null;
    setOpen(true);
  };
  const leave = () => {
    if (closeTimer.current) clearTimeout(closeTimer.current);
    closeTimer.current = setTimeout(() => setOpen(false), 150);
  };
  useEffect(
    () => () => {
      if (closeTimer.current) clearTimeout(closeTimer.current);
    },
    [],
  );

  return (
    <div className="menu-item-wrap" onMouseEnter={enter} onMouseLeave={leave}>
      <button
        className="menu-item"
        role="menuitem"
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
      >
        {icon && <Icon name={icon} size={16} />}
        <span className="menu-item-label">{label}</span>
        <Icon name="chevron-right-small" size={16} className="menu-item-chevron" />
      </button>
      {open && (
        <div className="menu-pop menu-sub" role="menu">
          {children}
        </div>
      )}
    </div>
  );
}
