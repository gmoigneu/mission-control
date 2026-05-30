import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { useState } from "react";
import { getFocusable, useFocusTrap } from "./useFocusTrap";

function Trap({ onClose }: { onClose?: () => void }) {
  const ref = useFocusTrap<HTMLDivElement>(true, onClose);
  return (
    <div ref={ref} role="dialog" aria-label="trap">
      <input aria-label="first" />
      <button>middle</button>
      <button>last</button>
    </div>
  );
}

// Wrapper that mounts/unmounts the trap so we can assert focus restoration.
function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <button onClick={() => setOpen(true)}>trigger</button>
      {open && <Trap onClose={() => setOpen(false)} />}
    </div>
  );
}

describe("getFocusable", () => {
  it("queries focusable descendants and skips hidden ones", () => {
    const root = document.createElement("div");
    root.innerHTML = `
      <a href="#x">link</a>
      <button>btn</button>
      <button disabled>nope</button>
      <input />
      <div hidden><button>hidden</button></div>
    `;
    document.body.appendChild(root);
    const labels = getFocusable(root).map((el) => el.tagName.toLowerCase());
    expect(labels).toEqual(["a", "button", "input"]);
    root.remove();
  });
});

describe("useFocusTrap", () => {
  it("focuses the first focusable element on open", () => {
    render(<Trap />);
    expect(document.activeElement).toBe(screen.getByLabelText("first"));
  });

  it("calls onClose on Escape", () => {
    const onClose = vi.fn();
    render(<Trap onClose={onClose} />);
    fireEvent.keyDown(screen.getByLabelText("first"), { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("cycles forward from the last element to the first on Tab", () => {
    render(<Trap />);
    const first = screen.getByLabelText("first");
    const last = screen.getByText("last");
    last.focus();
    fireEvent.keyDown(last, { key: "Tab" });
    expect(document.activeElement).toBe(first);
  });

  it("cycles backward from the first element to the last on Shift+Tab", () => {
    render(<Trap />);
    const first = screen.getByLabelText("first");
    const last = screen.getByText("last");
    first.focus();
    fireEvent.keyDown(first, { key: "Tab", shiftKey: true });
    expect(document.activeElement).toBe(last);
  });

  it("restores focus to the trigger when the trap unmounts", () => {
    render(<Harness />);
    const trigger = screen.getByText("trigger");
    trigger.focus();
    fireEvent.click(trigger);
    // Opening focuses the first element inside the trap.
    expect(document.activeElement).toBe(screen.getByLabelText("first"));
    fireEvent.keyDown(screen.getByLabelText("first"), { key: "Escape" });
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(document.activeElement).toBe(trigger);
  });
});
