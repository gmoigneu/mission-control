import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { SidePanel } from "./SidePanel";

describe("SidePanel", () => {
  it("renders nothing while closed", () => {
    render(
      <SidePanel open={false} onClose={() => {}} title="New context">
        <input aria-label="Name" />
      </SidePanel>,
    );
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(screen.queryByLabelText("Name")).toBeNull();
  });

  it("renders the title and children when open", () => {
    render(
      <SidePanel open onClose={() => {}} title="New context">
        <input aria-label="Name" />
      </SidePanel>,
    );
    const dialog = screen.getByRole("dialog", { name: "New context" });
    expect(dialog).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toBeInTheDocument();
  });

  it("calls onClose when the Close button is clicked", async () => {
    const onClose = vi.fn();
    render(
      <SidePanel open onClose={onClose} title="New context">
        <input aria-label="Name" />
      </SidePanel>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the backdrop is clicked", async () => {
    const onClose = vi.fn();
    render(
      <SidePanel open onClose={onClose} title="New context">
        <input aria-label="Name" />
      </SidePanel>,
    );
    await userEvent.click(screen.getByRole("button", { name: "Close panel" }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("calls onClose when the dialog is canceled", () => {
    const onClose = vi.fn();
    render(
      <SidePanel open onClose={onClose} title="New context">
        <input aria-label="Name" />
      </SidePanel>,
    );
    screen
      .getByRole("dialog", { name: "New context" })
      .dispatchEvent(new Event("cancel", { cancelable: true }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
