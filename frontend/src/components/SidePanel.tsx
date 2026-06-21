import { X } from "lucide-react";
import { useEffect, useEffectEvent, useRef, type ReactNode } from "react";

/**
 * A right-edge slide-over drawer for create/edit forms.
 *
 * Renders nothing while closed, so its contents (form fields) are absent from
 * the DOM until opened. While open it uses the browser's native modal dialog
 * semantics, backdrop, focus handling, and Escape behavior.
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
      className="drawer-dialog"
      aria-label={title}
    >
      <button
        type="button"
        className="drawer-backdrop-hitbox"
        aria-label="Close panel"
        tabIndex={-1}
        onClick={onClose}
      />
      <aside className="drawer-panel">
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
    </dialog>
  );
}
