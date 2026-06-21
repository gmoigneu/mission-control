import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { CompanyDetailPage } from "./company-detail";

afterEach(() => vi.restoreAllMocks());

function renderCompanyDetail(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);

  const root = createRootRoute();
  const company = createRoute({
    getParentRoute: () => root,
    path: "/companies/$slug",
    component: CompanyDetailPage,
  });
  const people = createRoute({
    getParentRoute: () => root,
    path: "/people/$slug",
    component: () => <div>person-detail</div>,
  });
  const companies = createRoute({
    getParentRoute: () => root,
    path: "/companies",
    component: () => <div>companies-page</div>,
  });
  const login = createRoute({
    getParentRoute: () => root,
    path: "/login",
    component: () => <div>login-page</div>,
  });
  const history = createMemoryHistory({ initialEntries: ["/companies/acme"] });
  const router = createRouter({
    routeTree: root.addChildren([company, people, companies, login]),
    history,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

it("renders a company detail page with known people linked back to people details", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    calls.push([u, init]);
    if (u.includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
        status: 200,
      });
    }
    if (u.includes("/companies/by-slug/acme") && (!init?.method || init.method === "GET")) {
      return new Response(
        JSON.stringify({
          id: "c1",
          slug: "acme",
          name: "Acme",
          domain: "acme.example",
          notes: "Important partner",
          created_at: "2026-01-01T00:00:00Z",
          updated_at: "2026-01-01T00:00:00Z",
        }),
        { status: 200 },
      );
    }
    if (u.includes("/people") && u.includes("company_id=c1") && (!init?.method || init.method === "GET")) {
      return new Response(
        JSON.stringify([
          {
            id: "p1",
            slug: "ada",
            name: "Ada Lovelace",
            role: "Advisor",
            company_id: "c1",
            email: null,
            linkedin: null,
            first_met: null,
            primary_context_id: null,
            summary: null,
            archived: false,
            created_at: "",
            updated_at: "",
          },
        ]),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify([]), { status: 200 });
  });

  renderCompanyDetail(fetchMock);

  await screen.findByRole("heading", { name: "Acme" });
  expect(screen.getByRole("link", { name: "acme.example" })).toHaveAttribute(
    "href",
    "https://acme.example",
  );
  const personLink = await screen.findByRole("link", { name: "Ada Lovelace" });
  expect(personLink).toHaveAttribute("href", "/people/ada");
  expect(screen.getByText("Advisor")).toBeInTheDocument();

  await waitFor(() => {
    expect(
      calls.some(
        ([url, init]) =>
          url.includes("/people") &&
          url.includes("company_id=c1") &&
          (!init?.method || init.method === "GET"),
      ),
    ).toBe(true);
  });
});
