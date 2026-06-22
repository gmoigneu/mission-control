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

// jsdom also leaves scrollTo unimplemented, while the router calls it during
// navigation. Keep route tests focused on app behavior instead of environment
// feature gaps.
if (typeof window !== "undefined") {
  window.scrollTo = () => {};
}

// Native dialog methods are still missing in jsdom. Components use the real
// browser API, and tests only need enough behavior for role queries and cleanup.
if (
  typeof window !== "undefined" &&
  typeof window.HTMLDialogElement !== "undefined"
) {
  if (!window.HTMLDialogElement.prototype.showModal) {
    window.HTMLDialogElement.prototype.showModal = function showModal() {
      this.open = true;
      this.setAttribute("open", "");
    };
  }
  if (!window.HTMLDialogElement.prototype.close) {
    window.HTMLDialogElement.prototype.close = function close() {
      this.open = false;
      this.removeAttribute("open");
    };
  }
}
