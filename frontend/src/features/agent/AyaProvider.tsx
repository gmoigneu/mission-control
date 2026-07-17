import { type ReactNode, useCallback, useMemo, useState } from "react";
import { AyaContext } from "./AyaContext";

/**
 * Shared open/closed state for the Aya quake window.
 *
 * The window itself is mounted once at the route root (so it survives route
 * changes), but the buttons that toggle it live inside the per-route AppShell.
 * This context is the seam between them — both sit under the same provider.
 */
export function AyaProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((value) => !value), []);
  const openAya = useCallback(() => setOpen(true), []);
  const closeAya = useCallback(() => setOpen(false), []);
  const value = useMemo(
    () => ({ open, toggle, openAya, closeAya }),
    [open, toggle, openAya, closeAya],
  );

  return <AyaContext.Provider value={value}>{children}</AyaContext.Provider>;
}
