import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ColorPicker } from "./ColorPicker";
import { PALETTE } from "./console";

describe("ColorPicker", () => {
  it("calls onChange with the picked palette key", async () => {
    const onChange = vi.fn();
    render(<ColorPicker value="" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Teal" }));
    expect(onChange).toHaveBeenCalledWith("teal");
  });

  it("calls onChange with empty string when default is picked", async () => {
    const onChange = vi.fn();
    render(<ColorPicker value="blue" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Default color" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("marks the selected swatch as pressed", () => {
    render(<ColorPicker value="teal" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Teal" })).toHaveAttribute("aria-pressed", "true");
  });

  it("renders all palette swatches plus the default", () => {
    render(<ColorPicker value="" onChange={() => {}} />);
    expect(screen.getAllByRole("button")).toHaveLength(PALETTE.length + 1);
  });
});
