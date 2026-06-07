import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { useHotkey } from "./useHotkey";

function Harness({ onFire, enabled }: { onFire: () => void; enabled?: boolean }) {
  useHotkey("c", onFire, enabled);
  return <input aria-label="field" />;
}

it("fires the handler on a bare key press", async () => {
  const onFire = vi.fn();
  render(<Harness onFire={onFire} />);
  await userEvent.keyboard("c");
  expect(onFire).toHaveBeenCalledTimes(1);
});

it("ignores the key while typing in a field", async () => {
  const onFire = vi.fn();
  render(<Harness onFire={onFire} />);
  await userEvent.click(screen.getByRole("textbox", { name: "field" }));
  await userEvent.keyboard("c");
  expect(onFire).not.toHaveBeenCalled();
});

it("ignores the key when a modifier is held", async () => {
  const onFire = vi.fn();
  render(<Harness onFire={onFire} />);
  await userEvent.keyboard("{Meta>}c{/Meta}");
  expect(onFire).not.toHaveBeenCalled();
});

it("does nothing when disabled", async () => {
  const onFire = vi.fn();
  render(<Harness onFire={onFire} enabled={false} />);
  await userEvent.keyboard("c");
  expect(onFire).not.toHaveBeenCalled();
});
