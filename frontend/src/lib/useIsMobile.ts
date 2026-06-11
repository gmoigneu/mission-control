import { useEffect, useState } from "react";

// Matches the mobile breakpoint used throughout console.css (≤720px). Keep the
// two in sync — these are the JS source of truth for behavior that can't be
// expressed in CSS alone (full-screen Aya, filter sheets, etc.).
export const MOBILE_QUERY = "(max-width: 720px)";

// Below this width the docked Aya panel is hidden (see the ≤1100 rule in
// console.css), so the chat is presented as a full-screen overlay instead.
export const AYA_OVERLAY_QUERY = "(max-width: 1100px)";

/**
 * Subscribe to a CSS media query. Re-renders the consumer when the match state
 * changes (resize / orientation), so JS-driven layout swaps stay in sync with
 * the CSS media queries.
 */
export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(() =>
    typeof window !== "undefined" ? window.matchMedia(query).matches : false,
  );

  useEffect(() => {
    const mql = window.matchMedia(query);
    const onChange = () => setMatches(mql.matches);
    mql.addEventListener("change", onChange);
    // Re-sync in case the viewport changed between first render and effect.
    onChange();
    return () => mql.removeEventListener("change", onChange);
  }, [query]);

  return matches;
}

/** True when the viewport is at or below the mobile breakpoint (≤720px). */
export function useIsMobile(): boolean {
  return useMediaQuery(MOBILE_QUERY);
}
