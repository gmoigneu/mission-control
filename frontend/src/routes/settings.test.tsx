import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SettingsPage } from "./settings";

beforeEach(() => {
  // Make isWebAuthnSupported() return true under jsdom.
  vi.stubGlobal("PublicKeyCredential", function () {});
  Object.defineProperty(navigator, "credentials", {
    configurable: true,
    value: { create: vi.fn(), get: vi.fn() },
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

function renderSettings() {
  const root = createRootRoute();
  const settings = createRoute({
    getParentRoute: () => root,
    path: "/settings",
    component: SettingsPage,
  });
  const login = createRoute({
    getParentRoute: () => root,
    path: "/login",
    component: () => <div>login-page</div>,
  });
  const history = createMemoryHistory({ initialEntries: ["/settings"] });
  const router = createRouter({
    routeTree: root.addChildren([settings, login]),
    history,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

it("lists registered passkeys", async () => {
  const fetchMock = vi.fn(async (url: string) => {
    if (String(url).includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "1", email: "g@x.com" }), { status: 200 });
    }
    if (String(url).includes("/auth/webauthn/passkeys")) {
      return new Response(
        JSON.stringify([
          { id: "pk1", name: "MacBook", created_at: "2026-05-01T00:00:00Z", last_used_at: null },
        ]),
        { status: 200 },
      );
    }
    return new Response("[]", { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);

  renderSettings();
  await screen.findByRole("heading", { name: "Settings" });
  await waitFor(() => expect(screen.getByText("MacBook")).toBeInTheDocument());
  expect(screen.getByRole("button", { name: /register a passkey/i })).toBeInTheDocument();
});
