import { describe, it, expect } from "vitest";
import { contextTint, paletteVar } from "./console-data";

describe("paletteVar", () => {
  it("returns the palette var for a known key", () => {
    expect(paletteVar("teal")).toBe("var(--palette-teal)");
  });
  it("falls back for an unknown key", () => {
    expect(paletteVar("chartreuse")).toBe("var(--fg-dim)");
  });
});

describe("contextTint", () => {
  it("uses the palette var when a color is set", () => {
    expect(contextTint({ color: "blue", category: "work" })).toBe("var(--palette-blue)");
  });
  it("falls back to the category tint when color is null", () => {
    expect(contextTint({ color: null, category: "work" })).toBe("var(--ctx-work)");
  });
  it("falls back to the category tint when color is empty", () => {
    expect(contextTint({ color: "", category: "personal" })).toBe("var(--ctx-personal)");
  });
  it("falls back to fg-dim for an unknown palette key", () => {
    expect(contextTint({ color: "chartreuse", category: "work" })).toBe("var(--fg-dim)");
  });
});
