import { createContext, use } from "react";

export interface AyaContextValue {
  open: boolean;
  toggle: () => void;
  openAya: () => void;
  closeAya: () => void;
}

// A no-op default so consumers rendered without a provider (e.g. AppShell in
// isolation under test) don't crash. The real app always mounts the provider at
// the route root, wrapping both AppShell and the quake window.
export const AyaContext = createContext<AyaContextValue>({
  open: false,
  toggle: () => {},
  openAya: () => {},
  closeAya: () => {},
});

export function useAya(): AyaContextValue {
  return use(AyaContext);
}
