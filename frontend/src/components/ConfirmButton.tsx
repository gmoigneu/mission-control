import { useState } from "react";

export function ConfirmButton({
  onConfirm,
  children = "Delete",
  disabled = false,
}: {
  onConfirm: () => void;
  children?: React.ReactNode;
  disabled?: boolean;
}) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      type="button"
      disabled={disabled}
      style={{
        fontSize: "12px",
        background: "transparent",
        border: "none",
        cursor: disabled ? "not-allowed" : "pointer",
        padding: "0",
        color: disabled ? "var(--fg-faint)" : armed ? "var(--st-danger)" : "var(--fg-dim)",
        fontWeight: armed ? 600 : undefined,
        opacity: disabled ? 0.65 : 1,
        transition: "color 170ms cubic-bezier(0.2, 0.7, 0.2, 1)",
      }}
      onMouseEnter={(e) => {
        if (!armed && !disabled)
          (e.currentTarget as HTMLButtonElement).style.color =
            "var(--st-danger)";
      }}
      onMouseLeave={(e) => {
        if (!armed && !disabled)
          (e.currentTarget as HTMLButtonElement).style.color = "var(--fg-dim)";
      }}
      onClick={() => {
        if (disabled) return;
        if (armed) {
          onConfirm();
          setArmed(false);
        } else {
          setArmed(true);
        }
      }}
      onBlur={() => setArmed(false)}
    >
      {armed ? "Confirm?" : children}
    </button>
  );
}
