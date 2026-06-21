import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it, vi } from "vitest";
import { ConfirmButton } from "./ConfirmButton";

function Harness({ onConfirm }: { onConfirm: () => void }) {
  const [disabled, setDisabled] = useState(false);
  return (
    <>
      <ConfirmButton onConfirm={onConfirm} disabled={disabled}>
        Reset
      </ConfirmButton>
      <button type="button" onClick={() => setDisabled((value) => !value)}>
        Toggle disabled
      </button>
    </>
  );
}

it("clears armed confirmation state when disabled", async () => {
  const onConfirm = vi.fn();
  render(<Harness onConfirm={onConfirm} />);

  await userEvent.click(screen.getByRole("button", { name: "Reset" }));
  expect(screen.getByRole("button", { name: "Confirm?" })).toBeInTheDocument();

  await userEvent.click(screen.getByRole("button", { name: "Toggle disabled" }));
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Reset" })).toBeDisabled(),
  );

  await userEvent.click(screen.getByRole("button", { name: "Toggle disabled" }));
  await userEvent.click(screen.getByRole("button", { name: "Reset" }));

  expect(onConfirm).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Confirm?" })).toBeInTheDocument();
});
