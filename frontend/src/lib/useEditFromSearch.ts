import { useLocation } from "@tanstack/react-router";
import { useEffect, useRef } from "react";

/**
 * Search-param validator for list routes that support deep-linking to a single
 * record (e.g. from the Activity page). Declares an optional `?edit=<id>`.
 */
export function editSearch(search: Record<string, unknown>): { edit?: string } {
  // The default search parser may JSON-decode numeric-looking ids; coerce to string.
  const edit = search.edit;
  return { edit: edit == null || edit === "" ? undefined : String(edit) };
}

/**
 * Open a list item's edit drawer when the URL carries `?edit=<id>`.
 *
 * Resolves the id against `items` (once they've loaded) and calls `onOpen` at
 * most once per id, so closing the drawer doesn't immediately reopen it. Reads
 * the param loosely so it works on any route regardless of its search schema.
 */
export function useEditFromSearch<T extends { id: string }>(
  items: T[],
  onOpen: (item: T) => void,
) {
  const location = useLocation();
  const rawEdit = (location.search as { edit?: unknown }).edit;
  const editId = rawEdit == null || rawEdit === "" ? undefined : String(rawEdit);
  const openedRef = useRef<string | null>(null);

  useEffect(() => {
    if (!editId) {
      openedRef.current = null;
      return;
    }
    if (openedRef.current === editId) return;
    const item = items.find((i) => i.id === editId);
    if (!item) return;
    openedRef.current = editId;
    onOpen(item);
  }, [editId, items, onOpen]);
}
