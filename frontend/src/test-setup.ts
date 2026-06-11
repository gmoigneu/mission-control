import "@testing-library/jest-dom/vitest";

// jsdom doesn't implement matchMedia, which useMediaQuery/useIsMobile (and thus
// AppShell) rely on. Default to "not matching" (desktop) so components render
// their desktop layout under test; individual tests can override window.matchMedia.
if (typeof window !== "undefined" && !window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}
