import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { SettingsPage } from "./settings";

// Render only the inner form, not the full AppShell/auth/router stack.
vi.mock("../components/AppShell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
vi.mock("../components/RequireAuth", () => ({
  RequireAuth: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

const updateMutate = vi.fn();
const resetMutate = vi.fn();
const PERSONA = {
  name: "Aya",
  role: "your assistant",
  tone: null,
  greeting: "Hey there",
  instructions: null,
  principles: null,
  boundaries: null,
  enabled: true,
  preview: "You are Aya, your assistant.\n\nBe concise.",
};

vi.mock("../features/persona/api", () => ({
  usePersona: () => ({ data: PERSONA }),
  useUpdatePersona: () => ({ mutate: updateMutate, isPending: false }),
  useResetPersona: () => ({ mutate: resetMutate, isPending: false }),
}));

afterEach(() => {
  vi.clearAllMocks();
});

describe("SettingsPage", () => {
  it("hydrates the form and saves edited persona fields", async () => {
    render(<SettingsPage />);

    const nameInput = (await screen.findByLabelText("Name")) as HTMLInputElement;
    await waitFor(() => expect(nameInput.value).toBe("Aya"));

    fireEvent.change(nameInput, { target: { value: "Nova" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(updateMutate).toHaveBeenCalledTimes(1);
    expect(updateMutate.mock.calls[0][0]).toMatchObject({ name: "Nova" });
  });

  it("resets to default", () => {
    render(<SettingsPage />);
    fireEvent.click(screen.getByRole("button", { name: "Reset to default" }));
    expect(resetMutate).toHaveBeenCalledTimes(1);
  });

  it("shows the composed system prompt preview", () => {
    render(<SettingsPage />);
    expect(screen.getByLabelText("System prompt preview").textContent).toContain(
      "You are Aya",
    );
  });
});
