import { X } from "lucide-react";
import { type ReactNode, useEffect } from "react";
import { useFocusTrap } from "../lib/useFocusTrap";

/**
 * A slide-up sheet anchored to the bottom of the screen, used for secondary
 * controls (filters, pickers) on mobile. Renders nothing while closed; while
 * open it overlays the page, traps focus, and closes on Escape or backdrop tap —
 * matching the dialog conventions in SidePanel. Styling lives under `.sheet*`
 * in console.css.
 */
export function BottomSheet({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: ReactNode;
}) {
  const ref = useFocusTrap<HTMLDivElement>(open);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="sheet-scrim"
        aria-label="Dismiss"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        ref={ref}
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="sheet-grip" aria-hidden="true" />
        {title && (
          <div className="sheet-head">
            <span className="title-sm">{title}</span>
            <button
              type="button"
              className="btn ghost sm"
              onClick={onClose}
              aria-label="Close"
            >
              <X size={16} />
            </button>
          </div>
        )}
        <div className="sheet-body">{children}</div>
      </div>
    </>
  );
}
