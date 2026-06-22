import { X } from "lucide-react";
import { type ReactNode, useEffect, useEffectEvent, useRef } from "react";

/**
 * A slide-up sheet anchored to the bottom of the screen, used for secondary
 * controls (filters, pickers) on mobile. Renders nothing while closed; while
 * open it uses the browser's native modal dialog semantics, backdrop, focus
 * handling, and Escape behavior. Styling lives under `.sheet*` in console.css.
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const close = useEffectEvent(onClose);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog || !open) return;
    if (!dialog.open) {
      dialog.showModal();
    }
    function handleCancel(e: Event) {
      e.preventDefault();
      close();
    }
    dialog.addEventListener("cancel", handleCancel);
    return () => {
      dialog.removeEventListener("cancel", handleCancel);
      if (dialog.open) dialog.close();
    };
  }, [open]);

  if (!open) return null;

  return (
    <dialog
      ref={dialogRef}
      className="sheet-dialog"
      aria-label={title ?? "Sheet"}
    >
      <button
        type="button"
        className="sheet-backdrop-hitbox"
        aria-label="Dismiss"
        tabIndex={-1}
        onClick={onClose}
      />
      <div
        className="sheet"
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
    </dialog>
  );
}
