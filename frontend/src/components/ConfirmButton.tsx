import { useState } from "react";

interface ConfirmButtonProps {
  onConfirm: () => void;
  children?: React.ReactNode;
  disabled?: boolean;
}

export function ConfirmButton(props: ConfirmButtonProps) {
  return <ConfirmButtonInner key={String(props.disabled ?? false)} {...props} />;
}

function ConfirmButtonInner({
  onConfirm,
  children = "Delete",
  disabled = false,
}: ConfirmButtonProps) {
  const [armed, setArmed] = useState(false);

  return (
    <button
      type="button"
      disabled={disabled}
      className={"confirm-button" + (armed ? " is-armed" : "")}
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
