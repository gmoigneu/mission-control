import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { BottomSheet } from "./BottomSheet";

it("renders nothing when closed", () => {
  const { container } = render(
    <BottomSheet open={false} onClose={() => {}}>
      body
    </BottomSheet>,
  );
  expect(container).toBeEmptyDOMElement();
});

it("renders title and children when open", () => {
  render(
    <BottomSheet open onClose={() => {}} title="Filters">
      hello
    </BottomSheet>,
  );
  expect(screen.getByRole("dialog", { name: "Filters" })).toBeDefined();
  expect(screen.getByText("hello")).toBeDefined();
});

it("closes via the close button", async () => {
  const onClose = vi.fn();
  render(
    <BottomSheet open onClose={onClose} title="Filters">
      x
    </BottomSheet>,
  );
  await userEvent.click(screen.getByRole("button", { name: "Close" }));
  expect(onClose).toHaveBeenCalledTimes(1);
});

it("closes on Escape", async () => {
  const onClose = vi.fn();
  render(
    <BottomSheet open onClose={onClose} title="Filters">
      x
    </BottomSheet>,
  );
  await userEvent.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalledTimes(1);
});
