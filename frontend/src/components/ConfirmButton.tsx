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
      className={`text-xs ${armed ? "font-semibold text-red-600" : "text-gray-500 hover:text-red-600"}`}
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
