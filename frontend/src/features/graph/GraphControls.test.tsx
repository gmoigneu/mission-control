import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { GraphControls } from "./GraphControls";

function setup(overrides = {}) {
  const props = {
    types: { Person: true, Company: true, Context: true, Project: true, Task: true, Meeting: true },
    onToggleType: vi.fn(),
    contexts: [{ slug: "work", name: "Work" }],
    context: "",
    onContextChange: vi.fn(),
    search: "",
    onSearchChange: vi.fn(),
    onSearchSubmit: vi.fn(),
    layout: "fcose" as const,
    onLayoutChange: vi.fn(),
    onRebuild: vi.fn(),
    rebuilding: false,
    ...overrides,
  };
  render(<GraphControls {...props} />);
  return props;
}

it("toggles a node type", async () => {
  const props = setup();
  await userEvent.click(screen.getByRole("checkbox", { name: /person/i }));
  expect(props.onToggleType).toHaveBeenCalledWith("Person");
});

it("submits search on Enter", async () => {
  const props = setup();
  const input = screen.getByRole("textbox", { name: /search nodes/i });
  await userEvent.type(input, "alice{Enter}");
  expect(props.onSearchSubmit).toHaveBeenCalled();
});

it("fires rebuild", async () => {
  const props = setup();
  await userEvent.click(screen.getByRole("button", { name: /rebuild graph/i }));
  expect(props.onRebuild).toHaveBeenCalled();
});

it("disables rebuild while rebuilding", () => {
  setup({ rebuilding: true });
  expect(screen.getByRole("button", { name: /rebuild/i })).toBeDisabled();
});
