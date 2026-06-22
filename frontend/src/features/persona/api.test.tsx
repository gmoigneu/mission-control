import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { usePersona, useResetPersona, useSavePersona } from "./api";

afterEach(() => vi.restoreAllMocks());

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

const PERSONA = {
  id: "p1",
  name: "Nova",
  role: "chief of staff",
  tone: null,
  greeting: "Yo G",
  instructions: null,
  principles: null,
  boundaries: null,
  enabled: true,
  created_at: null,
  updated_at: null,
  is_default: false,
};

it("usePersona GETs /api/agent/persona", async () => {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes("/auth/me")) {
      return new Response(JSON.stringify({ id: "u1", email: "user@example.com", name: null }), {
        status: 200,
      });
    }
    return new Response(JSON.stringify(PERSONA), { status: 200 });
  });
  vi.stubGlobal("fetch", fetchMock);

  const { result } = renderHook(() => usePersona(), { wrapper });

  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(result.current.data?.name).toBe("Nova");
  expect(fetchMock.mock.calls.map(([url]) => String(url))).toContain("/api/agent/persona");
});

it("useSavePersona PUTs the payload", async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(PERSONA), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  const { result } = renderHook(() => useSavePersona(), { wrapper });
  await result.current.mutateAsync({ name: "Nova", greeting: "Yo G" });

  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("/api/agent/persona");
  expect(init.method).toBe("PUT");
  expect(JSON.parse(init.body as string)).toEqual({ name: "Nova", greeting: "Yo G" });
});

it("useResetPersona POSTs to the reset endpoint", async () => {
  const fetchMock = vi.fn(async () => new Response(JSON.stringify(PERSONA), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);

  const { result } = renderHook(() => useResetPersona(), { wrapper });
  await result.current.mutateAsync();

  const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
  expect(url).toBe("/api/agent/persona/reset");
  expect(init.method).toBe("POST");
});
