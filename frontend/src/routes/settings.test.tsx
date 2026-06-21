import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { SettingsPage } from "./settings.page";

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

const DEFAULT_PERSONA = {
  id: null,
  name: "Aya",
  role: null,
  tone: null,
  greeting: null,
  instructions: null,
  principles: null,
  boundaries: null,
  enabled: true,
  created_at: null,
  updated_at: null,
  is_default: true,
};

const DEFAULT_NOTIFICATION_POLICY = {
  enabled: true,
  quiet_hours: { enabled: true, start: "22:00", end: "07:00", timezone_offset_minutes: 0 },
  default_channel: "in_app",
  default_max_per_day: 3,
  default_cooldown_minutes: 60,
  urgency_overrides: {
    quiet_hours_min_urgency: "critical",
    frequency_cap_min_urgency: "critical",
    cooldown_min_urgency: "high",
  },
  routines: {
    daily_planning: {
      enabled: true,
      channel: "in_app",
      max_per_day: null,
      cooldown_minutes: null,
    },
    task_drift: {
      enabled: true,
      channel: "in_app",
      max_per_day: null,
      cooldown_minutes: null,
    },
    inbox_digest: {
      enabled: true,
      channel: "in_app",
      max_per_day: null,
      cooldown_minutes: null,
    },
    relationship_followup: {
      enabled: true,
      channel: "in_app",
      max_per_day: null,
      cooldown_minutes: null,
    },
    telos_review: {
      enabled: true,
      channel: "in_app",
      max_per_day: null,
      cooldown_minutes: null,
    },
    system_alert: {
      enabled: true,
      channel: "both",
      max_per_day: null,
      cooldown_minutes: null,
    },
  },
};

function renderSettings(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);

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
  const activity = createRoute({
    getParentRoute: () => root,
    path: "/activity",
    component: () => <div>activity-page</div>,
  });
  const history = createMemoryHistory({ initialEntries: ["/settings"] });
  const router = createRouter({
    routeTree: root.addChildren([settings, login, activity]),
    history,
  });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

it("renders the Soul form and PUTs edits on Save", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([String(url), init]);
    if (String(url).includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
        status: 200,
      });
    }
    if (String(url).includes("/auth/webauthn/passkeys")) {
      return new Response("[]", { status: 200 });
    }
    if (String(url).includes("/agent/persona") && (!init?.method || init.method === "GET")) {
      return new Response(JSON.stringify(DEFAULT_PERSONA), { status: 200 });
    }
    if (String(url).includes("/agent/notification-policy")) {
      return new Response(JSON.stringify(DEFAULT_NOTIFICATION_POLICY), { status: 200 });
    }
    if (String(url).includes("/agent/persona") && init?.method === "PUT") {
      const body = JSON.parse(init.body as string);
      return new Response(
        JSON.stringify({ ...DEFAULT_PERSONA, ...body, is_default: false }),
        { status: 200 },
      );
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });

  renderSettings(fetchMock);

  await screen.findByRole("heading", { name: "Soul" });

  const nameInput = screen.getByRole("textbox", { name: /^name$/i });
  await waitFor(() => expect((nameInput as HTMLInputElement).value).toBe("Aya"));

  await userEvent.clear(nameInput);
  await userEvent.type(nameInput, "Nova");
  await userEvent.click(screen.getByRole("button", { name: /^save$/i }));

  await waitFor(() => {
    const put = calls.find(
      ([url, init]) => String(url).includes("/agent/persona") && init?.method === "PUT",
    );
    expect(put).toBeDefined();
    expect(JSON.parse(put![1]!.body as string).name).toBe("Nova");
  });

  await screen.findByText("Saved");
});

it("POSTs to reset when Reset to default is clicked", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([String(url), init]);
    if (String(url).includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
        status: 200,
      });
    }
    if (String(url).includes("/auth/webauthn/passkeys")) {
      return new Response("[]", { status: 200 });
    }
    if (String(url).includes("/agent/persona/reset")) {
      return new Response(JSON.stringify(DEFAULT_PERSONA), { status: 200 });
    }
    if (String(url).includes("/agent/persona")) {
      return new Response(
        JSON.stringify({ ...DEFAULT_PERSONA, name: "Nova", is_default: false }),
        { status: 200 },
      );
    }
    if (String(url).includes("/agent/notification-policy")) {
      return new Response(JSON.stringify(DEFAULT_NOTIFICATION_POLICY), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });

  renderSettings(fetchMock);

  await screen.findByRole("heading", { name: "Soul" });
  await userEvent.click(screen.getByRole("button", { name: /reset to default/i }));
  expect(calls.some(([url]) => String(url).includes("/agent/persona/reset"))).toBe(false);
  await userEvent.click(screen.getByRole("button", { name: /confirm/i }));

  await waitFor(() => {
    const reset = calls.find(([url]) => String(url).includes("/agent/persona/reset"));
    expect(reset).toBeDefined();
  });
});

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
    if (String(url).includes("/agent/persona")) {
      return new Response(JSON.stringify(DEFAULT_PERSONA), { status: 200 });
    }
    if (String(url).includes("/agent/notification-policy")) {
      return new Response(JSON.stringify(DEFAULT_NOTIFICATION_POLICY), { status: 200 });
    }
    return new Response("[]", { status: 200 });
  });

  renderSettings(fetchMock);
  await screen.findByRole("heading", { name: "Settings" });
  await waitFor(() => expect(screen.getByText("MacBook")).toBeInTheDocument());
  expect(screen.getByRole("button", { name: /register a passkey/i })).toBeInTheDocument();
});

it("saves proactive Aya notification policy controls", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    calls.push([String(url), init]);
    if (String(url).includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
        status: 200,
      });
    }
    if (String(url).includes("/auth/webauthn/passkeys")) {
      return new Response("[]", { status: 200 });
    }
    if (String(url).includes("/agent/persona")) {
      return new Response(JSON.stringify(DEFAULT_PERSONA), { status: 200 });
    }
    if (
      String(url).includes("/agent/notification-policy") &&
      (!init?.method || init.method === "GET")
    ) {
      return new Response(JSON.stringify(DEFAULT_NOTIFICATION_POLICY), { status: 200 });
    }
    if (String(url).includes("/agent/notification-policy") && init?.method === "PUT") {
      return new Response(JSON.stringify(JSON.parse(init.body as string)), { status: 200 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });

  renderSettings(fetchMock);

  await screen.findByRole("heading", { name: "Proactive Aya" });
  await userEvent.click(await screen.findByRole("checkbox", { name: /task drift enabled/i }));
  await userEvent.selectOptions(screen.getByLabelText(/task drift channel/i), "telegram");
  await userEvent.clear(screen.getByLabelText(/task drift max per day/i));
  await userEvent.type(screen.getByLabelText(/task drift max per day/i), "1");
  await userEvent.click(screen.getByRole("button", { name: /save notification policy/i }));

  await waitFor(() => {
    const put = calls.find(
      ([url, init]) =>
        String(url).includes("/agent/notification-policy") && init?.method === "PUT",
    );
    expect(put).toBeDefined();
    const body = JSON.parse(put![1]!.body as string);
    expect(body.routines.task_drift.enabled).toBe(false);
    expect(body.routines.task_drift.channel).toBe("telegram");
    expect(body.routines.task_drift.max_per_day).toBe(1);
  });

  await screen.findByText("Notification policy saved");
});

it("shows notification policy save failures", async () => {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    if (String(url).includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
        status: 200,
      });
    }
    if (String(url).includes("/auth/webauthn/passkeys")) {
      return new Response("[]", { status: 200 });
    }
    if (String(url).includes("/agent/persona")) {
      return new Response(JSON.stringify(DEFAULT_PERSONA), { status: 200 });
    }
    if (
      String(url).includes("/agent/notification-policy") &&
      (!init?.method || init.method === "GET")
    ) {
      return new Response(JSON.stringify(DEFAULT_NOTIFICATION_POLICY), { status: 200 });
    }
    if (String(url).includes("/agent/notification-policy") && init?.method === "PUT") {
      return new Response("nope", { status: 500 });
    }
    return new Response(JSON.stringify({}), { status: 200 });
  });

  renderSettings(fetchMock);

  await screen.findByRole("heading", { name: "Proactive Aya" });
  await userEvent.click(
    await screen.findByRole("button", { name: /save notification policy/i }),
  );

  expect(await screen.findByRole("alert")).toHaveTextContent(/nope/i);
});
