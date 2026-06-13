import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

/**
 * Shared open/closed state for the Aya quake window.
 *
 * The window itself is mounted once at the route root (so it survives route
 * changes), but the buttons that toggle it live inside the per-route AppShell.
 * This context is the seam between them — both sit under the same provider.
 */
interface AyaContextValue {
  open: boolean;
  toggle: () => void;
  openAya: () => void;
  closeAya: () => void;
}

// A no-op default so consumers rendered without a provider (e.g. AppShell in
// isolation under test) don't crash. The real app always mounts the provider at
// the route root, wrapping both AppShell and the quake window.
const AyaCtx = createContext<AyaContextValue>({
  open: false,
  toggle: () => {},
  openAya: () => {},
  closeAya: () => {},
});

export function AyaProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const toggle = useCallback(() => setOpen((v) => !v), []);
  const openAya = useCallback(() => setOpen(true), []);
  const closeAya = useCallback(() => setOpen(false), []);
  const value = useMemo(
    () => ({ open, toggle, openAya, closeAya }),
    [open, toggle, openAya, closeAya],
  );
  return <AyaCtx.Provider value={value}>{children}</AyaCtx.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAya(): AyaContextValue {
  return useContext(AyaCtx);
}
