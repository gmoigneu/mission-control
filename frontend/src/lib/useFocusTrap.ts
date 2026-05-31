import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

function isVisible(el: HTMLElement): boolean {
  if (el === document.activeElement) return true;
  if (el.hidden || el.getAttribute("aria-hidden") === "true") return false;
  if (el.closest("[hidden]")) return false;
  // getClientRects()/offsetParent are unreliable in jsdom (no layout), so we
  // only filter on attributes/inline styles a test environment can resolve.
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  if (style && (style.display === "none" || style.visibility === "hidden")) {
    return false;
  }
  return true;
}

function focusable(container: HTMLElement): HTMLElement[] {
  return Array.from(
    container.querySelectorAll<HTMLElement>(FOCUSABLE),
  ).filter(isVisible);
}

/**
 * Trap keyboard focus inside the returned ref while `active` is true.
 *
 * - Tab / Shift+Tab cycle through the container's focusable elements and never
 *   escape the overlay (WCAG 2.4.3 / 2.1.2).
 * - Focus that lands outside the container (e.g. via screen-reader or a stray
 *   programmatic focus) is pulled back in.
 * - On deactivation the element that was focused before the trap opened is
 *   restored, so dismissing a dialog returns the user where they were.
 *
 * The container should also carry `role="dialog"` and `aria-modal="true"`.
 */
export function useFocusTrap<T extends HTMLElement = HTMLElement>(
  active: boolean,
) {
  const ref = useRef<T>(null);

  useEffect(() => {
    if (!active) return;
    const container = ref.current;
    if (!container) return;

    const previouslyFocused = document.activeElement as HTMLElement | null;

    // Move focus into the trap if it isn't already there.
    if (!container.contains(document.activeElement)) {
      const first = focusable(container)[0];
      (first ?? container).focus();
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key !== "Tab" || !container) return;
      const items = focusable(container);
      if (items.length === 0) {
        e.preventDefault();
        return;
      }
      const first = items[0];
      const last = items[items.length - 1];
      const activeEl = document.activeElement;
      if (e.shiftKey) {
        if (activeEl === first || !container.contains(activeEl)) {
          e.preventDefault();
          last.focus();
        }
      } else if (activeEl === last || !container.contains(activeEl)) {
        e.preventDefault();
        first.focus();
      }
    }

    function handleFocusIn(e: FocusEvent) {
      if (container && !container.contains(e.target as Node)) {
        const first = focusable(container)[0];
        (first ?? container).focus();
      }
    }

    document.addEventListener("keydown", handleKeyDown, true);
    document.addEventListener("focusin", handleFocusIn);

    return () => {
      document.removeEventListener("keydown", handleKeyDown, true);
      document.removeEventListener("focusin", handleFocusIn);
      // Restore focus to the trigger if it's still in the document.
      if (previouslyFocused && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [active]);

  return ref;
}
