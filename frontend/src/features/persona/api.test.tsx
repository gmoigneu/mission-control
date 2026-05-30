import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { apiFetch } from "../../lib/api";
import { usePersona, useResetPersona, useUpdatePersona } from "./api";

vi.mock("../../lib/api", () => ({
  apiFetch: vi.fn(),
}));

const mockApiFetch = vi.mocked(apiFetch);

function wrapper() {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
}

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

afterEach(() => {
  vi.clearAllMocks();
});

describe("persona api", () => {
  it("usePersona fetches the persona", async () => {
    mockApiFetch.mockResolvedValueOnce(PERSONA);
    const { result } = renderHook(() => usePersona(), { wrapper: wrapper() });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(mockApiFetch).toHaveBeenCalledWith("/agent/persona");
    expect(result.current.data?.greeting).toBe("Hey there");
  });

  it("useUpdatePersona PUTs the form fields", async () => {
    mockApiFetch.mockResolvedValueOnce({ ...PERSONA, name: "Nova" });
    const { result } = renderHook(() => useUpdatePersona(), {
      wrapper: wrapper(),
    });
    await act(async () => {
      await result.current.mutateAsync({ name: "Nova" });
    });
    expect(mockApiFetch).toHaveBeenCalledWith("/agent/persona", {
      method: "PUT",
      body: JSON.stringify({ name: "Nova" }),
    });
  });

  it("useResetPersona POSTs to the reset endpoint", async () => {
    mockApiFetch.mockResolvedValueOnce(PERSONA);
    const { result } = renderHook(() => useResetPersona(), {
      wrapper: wrapper(),
    });
    await act(async () => {
      await result.current.mutateAsync();
    });
    expect(mockApiFetch).toHaveBeenCalledWith("/agent/persona/reset", {
      method: "POST",
    });
  });
});
