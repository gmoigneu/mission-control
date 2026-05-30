import { afterEach, expect, it, vi } from "vitest";
import { resource } from "./resource";

afterEach(() => vi.restoreAllMocks());

it("list hits the base path and create POSTs", async () => {
  const calls: Array<[string, RequestInit | undefined]> = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([String(url), init]);
      return new Response(JSON.stringify(init?.method === "POST" ? { id: "1" } : []), { status: 200 });
    }),
  );
  const r = resource<{ id: string }, { name: string }, object>("/contexts");
  await r.list();
  await r.list({ status: "active" });
  await r.create({ name: "x" });
  expect(calls[0][0]).toContain("/contexts");
  expect(calls[1][0]).toContain("status=active");
  expect(calls[2][1]?.method).toBe("POST");
});
