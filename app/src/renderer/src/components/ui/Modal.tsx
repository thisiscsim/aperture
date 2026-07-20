import { type CSSProperties, type ReactNode, useEffect, useRef } from "react";
import { useEscapeKey } from "./useEscapeKey";

/**
 * Dialog chrome per the Figma spec: radius-lg surface with a hairline outline +
 * soft drop shadow, bordered header, body, bordered footer with right-aligned
 * actions. Clicking the overlay or pressing Escape closes.
 *
 * Accessibility: `aria-modal`, an initial focus into the dialog, a Tab focus
 * trap so keyboard focus can't wander into the (inert) background, and focus
 * restore to the previously-focused element on close.
 */
export function Modal({
  title,
  footer,
  onClose,
  width,
  children,
}: {
  title: string;
  footer?: ReactNode;
  onClose: () => void;
  width?: number;
  children: ReactNode;
}): JSX.Element {
  useEscapeKey(onClose);
  const dialogRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const restoreTo = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    // Focus the first focusable control, else the dialog itself.
    const focusables = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
        ) ?? [],
      );
    (focusables()[0] ?? dialog)?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey && activeEl === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && activeEl === last) {
        e.preventDefault();
        first.focus();
      }
    };
    dialog?.addEventListener("keydown", onKey);
    return () => {
      dialog?.removeEventListener("keydown", onKey);
      restoreTo?.focus?.();
    };
  }, []);

  const style: CSSProperties | undefined = width ? { width } : undefined;
  return (
    <div className="ui-modal-overlay" onClick={onClose}>
      <div
        className="ui-modal"
        style={style}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        tabIndex={-1}
        ref={dialogRef}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="ui-modal-header">{title}</div>
        <div className="ui-modal-body">{children}</div>
        {footer && <div className="ui-modal-footer">{footer}</div>}
      </div>
    </div>
  );
}
