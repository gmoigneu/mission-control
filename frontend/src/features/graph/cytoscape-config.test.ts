import { describe, expect, it } from "vitest";
import { LAYOUTS, NODE_TYPES, TYPE_COLORS, stylesheet } from "./cytoscape-config";

describe("cytoscape-config", () => {
  it("has a color for every node type", () => {
    for (const t of NODE_TYPES) {
      expect(TYPE_COLORS[t]).toMatch(/^#/);
    }
  });

  it("exposes the three layouts with cytoscape layout names", () => {
    expect(LAYOUTS.fcose.name).toBe("fcose");
    expect(LAYOUTS.breadthfirst.name).toBe("breadthfirst");
    expect(LAYOUTS.concentric.name).toBe("concentric");
  });

  it("builds a non-empty stylesheet", () => {
    expect(stylesheet.length).toBeGreaterThan(0);
  });
});
