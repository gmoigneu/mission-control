import { describe, expect, it } from "vitest";
import { snapshotToElements } from "./snapshot-to-elements";
import type { GraphSnapshot } from "../../lib/types";

const snap: GraphSnapshot = {
  nodes: [
    { id: "a", label: "Person", name: "Alice", props: {} },
    { id: "b", label: "Company", name: "Acme", props: {} },
  ],
  edges: [
    { source: "a", target: "b", type: "WORKS_AT", props: {} },
    { source: "a", target: "ghost", type: "KNOWS", props: {} }, // dangling
  ],
  truncated: false,
};

describe("snapshotToElements", () => {
  it("maps nodes with id/label/name data", () => {
    const els = snapshotToElements(snap);
    const node = els.find((e) => e.data.id === "a");
    expect(node?.data).toMatchObject({ id: "a", label: "Person", name: "Alice" });
  });

  it("drops edges whose endpoints are not both present", () => {
    const els = snapshotToElements(snap);
    const edges = els.filter((e) => (e.data as { source?: string }).source);
    expect(edges).toHaveLength(1);
    expect((edges[0].data as { target: string }).target).toBe("b");
  });

  it("gives every edge a unique id", () => {
    const els = snapshotToElements(snap);
    const ids = els.map((e) => e.data.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
