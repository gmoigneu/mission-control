import { expect, it } from "vitest";
import { resolvedSlug, slugify } from "./slug";

it("does not leave a trailing hyphen after truncation", () => {
  const value = `${"a".repeat(79)} and more words`;
  expect(slugify(value)).toMatch(/a$/);
});

it("normalizes custom slug overrides before submitting", () => {
  expect(resolvedSlug("My Custom Name!", "Ignored source")).toBe("my-custom-name");
});

it("falls back to a valid slug when no alphanumeric source exists", () => {
  expect(resolvedSlug("", "!!!")).toBe("untitled");
});
