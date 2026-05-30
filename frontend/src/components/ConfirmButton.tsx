import { useState } from "react";

export function ConfirmButton({
  onConfirm,
  children = "Delete",
}: {
  onConfirm: () => void;
  children?: React.ReactNode;
}) {
  const [armed, setArmed] = useState(false);
  return (
    <button
      type="button"
      style={{
        fontSize: "12px",
        background: "transparent",
        border: "none",
        cursor: "pointer",
        padding: "0",
        color: armed ? "var(--st-danger)" : "var(--fg-dim)",
        fontWeight: armed ? 600 : undefined,
        transition: "color 170ms cubic-bezier(0.2, 0.7, 0.2, 1)",
      }}
      onMouseEnter={(e) => {
        if (!armed)
          (e.currentTarget as HTMLButtonElement).style.color =
            "var(--st-danger)";
      }}
      onMouseLeave={(e) => {
        if (!armed)
          (e.currentTarget as HTMLButtonElement).style.color = "var(--fg-dim)";
      }}
      onClick={() => {
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
