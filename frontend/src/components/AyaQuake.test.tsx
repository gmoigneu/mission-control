import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

import { AyaQuake } from "./AyaQuake";
import { AyaProvider } from "../features/agent/AyaContext";

afterEach(() => {
  vi.restoreAllMocks();
});

/** Mock the handful of endpoints the quake touches, dispatching by URL + method. */
function stubFetch() {
  const calls: { url: string; method: string }[] = [];
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const u = String(url);
    const method = init?.method ?? "GET";
    calls.push({ url: u, method });
    const json = (body: unknown) =>
      new Response(JSON.stringify(body), { status: 200 });

    if (u.includes("/auth/me")) {
      return json({ id: "u1", email: "g@x.com", name: "G" });
    }
    if (u.includes("/agent/conversation/current")) {
      return json({ id: "c1", messages: [] });
    }
    if (u.includes("/agent/conversation/new")) {
      return json({ id: "c2", messages: [] });
    }
    if (u.includes("/agent/chat")) {
      return json({
        agent_run_id: "r1",
        reply: "Hi there!",
        writes: [],
        conversation_id: "c1",
      });
    }
    // persona and anything else — empty payloads are fine.
    return json({});
  });
  vi.stubGlobal("fetch", fetchMock);
  return calls;
}

function renderQuake() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <AyaProvider>
        <AyaQuake />
      </AyaProvider>
    </QueryClientProvider>,
  );
}

/** The panel is aria-hidden (out of the a11y tree) while closed, so grab the
 *  element directly rather than via role. Waits for the inner to mount first. */
async function findPanel(): Promise<HTMLElement> {
  await screen.findByText(/Tell me what to do/); // greeting → inner is mounted
  return document.querySelector(".aya-quake") as HTMLElement;
}

it("shows the greeting and is closed until toggled with Ctrl+`", async () => {
  stubFetch();
  renderQuake();

  const panel = await findPanel();
  expect(panel).toHaveAttribute("aria-hidden", "true");

  // Ctrl+` opens it.
  fireEvent.keyDown(window, { ctrlKey: true, code: "Backquote", key: "`" });
  expect(panel).toHaveAttribute("aria-hidden", "false");

  // Esc closes it.
  fireEvent.keyDown(window, { key: "Escape" });
  expect(panel).toHaveAttribute("aria-hidden", "true");
});

it("sends a message and renders Aya's reply", async () => {
  const calls = stubFetch();
  renderQuake();

  await findPanel();
  fireEvent.keyDown(window, { ctrlKey: true, code: "Backquote", key: "`" });

  const input = screen.getByPlaceholderText(/Message Aya/);
  await userEvent.type(input, "hello{Enter}");

  expect(await screen.findByText("Hi there!")).toBeInTheDocument();
  expect(screen.getByText("hello")).toBeInTheDocument();
  expect(calls.some((c) => c.url.includes("/agent/chat") && c.method === "POST")).toBe(true);
});

it("starts a new conversation via the header button", async () => {
  const calls = stubFetch();
  renderQuake();

  await findPanel();
  fireEvent.keyDown(window, { ctrlKey: true, code: "Backquote", key: "`" });

  await userEvent.click(screen.getByLabelText("New conversation"));

  expect(
    calls.some((c) => c.url.includes("/agent/conversation/new") && c.method === "POST"),
  ).toBe(true);
});
