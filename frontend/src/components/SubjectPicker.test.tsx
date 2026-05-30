import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { SubjectPicker } from "./SubjectPicker";

afterEach(() => vi.restoreAllMocks());

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function setupFetch() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (String(url).includes("/people")) {
        return new Response(
          JSON.stringify([
            {
              id: "p1",
              name: "Fabien",
              slug: "fabien",
              role: null,
              company_id: null,
              email: null,
              linkedin: null,
              first_met: null,
              primary_context_id: null,
              summary: null,
              archived: false,
              created_at: "2026-01-01T00:00:00Z",
              updated_at: "2026-01-01T00:00:00Z",
            },
          ]),
          { status: 200 },
        );
      }
      // all other list endpoints return empty arrays
      return new Response(JSON.stringify([]), { status: 200 });
    }),
  );
}

it("shows entity options in the id select when a type is selected", async () => {
  setupFetch();

  const spy = vi.fn();
  render(<SubjectPicker type="person" id="" onChange={spy} />, { wrapper });

  // Wait for the Fabien option to appear
  await waitFor(() => {
    expect(screen.getByRole("option", { name: "Fabien" })).toBeDefined();
  });
});

it("calls onChange with new type and empty id when type select changes", async () => {
  setupFetch();

  const spy = vi.fn();
  render(<SubjectPicker type="person" id="" onChange={spy} />, { wrapper });

  // Change the type select to "project"
  const typeSelect = screen.getAllByRole("combobox")[0];
  await userEvent.selectOptions(typeSelect, "project");

  expect(spy).toHaveBeenCalledWith("project", "");
});
