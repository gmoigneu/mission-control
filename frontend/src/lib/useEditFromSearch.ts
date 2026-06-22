import { useLocation } from "@tanstack/react-router";
import { useState } from "react";

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
 * Return a one-shot edit request when the URL carries `?edit=<id>`.
 *
 * Resolves the id against `items` once they've loaded. Each id is emitted at
 * most once, so closing a drawer does not immediately reopen it while the URL
 * still carries the same search param. Reads the param loosely so it works on
 * any route regardless of its search schema.
 */
export function useEditFromSearch<T extends { id: string }>(items: T[]): T | undefined {
  const location = useLocation();
  const rawEdit = (location.search as { edit?: unknown }).edit;
  const editId = rawEdit == null || rawEdit === "" ? undefined : String(rawEdit);
  const [openedId, setOpenedId] = useState<string | null>(null);

  if (!editId) {
    if (openedId !== null) setOpenedId(null);
    return undefined;
  }
  if (openedId === editId) return undefined;

  const item = items.find((i) => i.id === editId);
  if (!item) return undefined;

  setOpenedId(editId);
  return item;
}
