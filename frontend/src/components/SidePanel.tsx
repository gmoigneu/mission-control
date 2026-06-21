import { X } from "lucide-react";
import { useEffect, useEffectEvent, type ReactNode } from "react";
import { useFocusTrap } from "../lib/useFocusTrap";

/**
 * A right-edge slide-over drawer for create/edit forms.
 *
 * Renders nothing while closed, so its contents (form fields) are absent from
 * the DOM until opened. While open it overlays the page with a dimmed backdrop,
 * traps focus (WCAG 2.4.3 / 2.1.2), and closes on Escape or backdrop click —
 * matching the dialog conventions used elsewhere in the shell.
 */
export function SidePanel({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const ref = useFocusTrap<HTMLDivElement>(open);
  const close = useEffectEvent(onClose);

  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open]);

  if (!open) return null;

  return (
    <>
      <button
        type="button"
        className="drawer-backdrop"
        aria-label="Close panel"
        tabIndex={-1}
        onClick={onClose}
      />
      <aside
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className="drawer-panel"
      >
        <header className="drawer-head">
          <h2 className="title" style={{ fontSize: 18, margin: 0 }}>
            {title}
          </h2>
          <button
            type="button"
            className="btn ghost sm"
            onClick={onClose}
            aria-label="Close"
          >
            <X size={16} />
          </button>
        </header>
        <div className="drawer-body">{children}</div>
      </aside>
    </>
  );
}
