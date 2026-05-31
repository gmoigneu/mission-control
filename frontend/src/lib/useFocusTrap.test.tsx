import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, it } from "vitest";
import { useFocusTrap } from "./useFocusTrap";

function Dialog({ onClose }: { onClose: () => void }) {
  const ref = useFocusTrap<HTMLDivElement>(true);
  return (
    <div ref={ref} role="dialog" aria-modal="true" aria-label="Test dialog">
      <button onClick={onClose}>first</button>
      <button>second</button>
      <button>third</button>
    </div>
  );
}

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(true)}>opener</button>
      {open && <Dialog onClose={() => setOpen(false)} />}
    </div>
  );
}

it("moves focus into the dialog when it opens", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByText("opener"));
  expect(screen.getByText("first")).toHaveFocus();
});

it("cycles forward from the last element back to the first on Tab", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByText("opener"));

  screen.getByText("third").focus();
  await user.tab();
  expect(screen.getByText("first")).toHaveFocus();
});

it("cycles backward from the first element to the last on Shift+Tab", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  await user.click(screen.getByText("opener"));

  expect(screen.getByText("first")).toHaveFocus();
  await user.tab({ shift: true });
  expect(screen.getByText("third")).toHaveFocus();
});

it("restores focus to the trigger when the dialog closes", async () => {
  const user = userEvent.setup();
  render(<Harness />);
  const opener = screen.getByText("opener");
  await user.click(opener);
  // "first" closes the dialog; focus should return to the opener.
  await user.click(screen.getByText("first"));
  expect(opener).toHaveFocus();
});
