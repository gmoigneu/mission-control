import { renderHook, act } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { useIsMobile } from "./useIsMobile";

type Listener = () => void;

function mockMatchMedia(matches: boolean) {
  const listeners = new Set<Listener>();
  const mql = {
    matches,
    media: "(max-width: 720px)",
    addEventListener: (_: string, cb: Listener) => listeners.add(cb),
    removeEventListener: (_: string, cb: Listener) => listeners.delete(cb),
    set(next: boolean) {
      mql.matches = next;
      listeners.forEach((cb) => {
        cb();
      });
    },
  };
  window.matchMedia = vi
    .fn()
    .mockReturnValue(mql) as unknown as typeof window.matchMedia;
  return mql;
}

afterEach(() => vi.restoreAllMocks());

it("is true when the viewport matches the mobile query", () => {
  mockMatchMedia(true);
  const { result } = renderHook(() => useIsMobile());
  expect(result.current).toBe(true);
});

it("is false on a desktop viewport", () => {
  mockMatchMedia(false);
  const { result } = renderHook(() => useIsMobile());
  expect(result.current).toBe(false);
});

it("updates when the viewport crosses the breakpoint", () => {
  const mql = mockMatchMedia(false);
  const { result } = renderHook(() => useIsMobile());
  expect(result.current).toBe(false);
  act(() => mql.set(true));
  expect(result.current).toBe(true);
});
