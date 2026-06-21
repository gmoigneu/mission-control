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

it("list follows pagination headers and returns the full collection", async () => {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(String(url));
      if (String(url).includes("offset=2")) {
        return new Response(JSON.stringify([{ id: "3" }]), {
          status: 200,
          headers: {
            "X-Total-Count": "3",
            "X-Limit": "2",
            "X-Offset": "2",
          },
        });
      }
      return new Response(JSON.stringify([{ id: "1" }, { id: "2" }]), {
        status: 200,
        headers: {
          "X-Total-Count": "3",
          "X-Limit": "2",
          "X-Offset": "0",
          "X-Next-Offset": "2",
        },
      });
    }),
  );

  const r = resource<{ id: string }, { name: string }, object>("/items");
  await expect(r.list({ status: "active" })).resolves.toEqual([
    { id: "1" },
    { id: "2" },
    { id: "3" },
  ]);
  expect(calls).toHaveLength(2);
  expect(calls[0]).toContain("/items?status=active");
  expect(calls[1]).toContain("status=active");
  expect(calls[1]).toContain("limit=2");
  expect(calls[1]).toContain("offset=2");
});
