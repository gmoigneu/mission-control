import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { PersonDetailPage } from "./people-detail";

const mockFetch = vi.fn();

vi.mock("@tanstack/react-router", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@tanstack/react-router")>();
  return {
    ...actual,
    useParams: () => ({ slug: "jane-doe" }),
    Link: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
  };
});

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PersonDetailPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  mockFetch.mockReset();
  vi.stubGlobal("fetch", mockFetch);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function jsonResponse(data: unknown) {
  return { ok: true, status: 200, json: async () => data, text: async () => "" };
}

const PERSON = {
  id: "p1",
  slug: "jane-doe",
  name: "Jane Doe",
  role: "Engineer",
  company_id: null,
  email: null,
  linkedin: null,
  first_met: null,
  primary_context_id: null,
  summary: null,
  archived: false,
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
};

describe("PersonDetailPage", () => {
  it("renders the person and their observations", async () => {
    mockFetch.mockImplementation((url: string) => {
      if (url.includes("/people")) {
        return Promise.resolve(jsonResponse([PERSON]));
      }
      if (url.includes("/observations")) {
        return Promise.resolve(
          jsonResponse([
            {
              id: "o1",
              subject_type: "person",
              subject_id: "p1",
              kind: "fact",
              body: "Likes coffee",
              date: "2024-02-01",
              source: null,
              created_at: "2024-02-01T00:00:00Z",
              updated_at: "2024-02-01T00:00:00Z",
            },
          ]),
        );
      }
      if (url.includes("/graph/query")) {
        return Promise.resolve(
          jsonResponse([{ id: "p2", label: "Person", rel: "KNOWS", label_text: "John Smith" }]),
        );
      }
      return Promise.resolve(jsonResponse([]));
    });

    renderPage();

    expect(await screen.findByText("Jane Doe")).toBeInTheDocument();
    expect(await screen.findByText("Likes coffee")).toBeInTheDocument();
    expect(await screen.findByText("John Smith")).toBeInTheDocument();
  });
});
