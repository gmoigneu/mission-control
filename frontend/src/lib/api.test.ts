import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiError, apiFetch } from "./api";

afterEach(() => vi.restoreAllMocks());

describe("apiFetch", () => {
  it("returns parsed json on success", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })),
    );
    const data = await apiFetch<{ ok: boolean }>("/auth/me");
    expect(data).toEqual({ ok: true });
  });

  it("throws ApiError with status on failure", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => new Response("nope", { status: 401 })),
    );
    await expect(apiFetch("/auth/me")).rejects.toMatchObject({ status: 401 });
    await expect(apiFetch("/auth/me")).rejects.toBeInstanceOf(ApiError);
  });
});
