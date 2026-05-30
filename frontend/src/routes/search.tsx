import { createRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { DataTable } from "../components/DataTable";
import { RequireAuth } from "../components/RequireAuth";
import { Input } from "../components/ui";
import { useSearch } from "../features/search/api";
import { rootRoute } from "./root";

type SearchRow = {
  id: string;
  subject_type: string;
  subject_id: string;
  score: number;
  snippet: string;
};

const columns = [
  { header: "Type", cell: (row: SearchRow) => row.subject_type },
  { header: "Snippet", cell: (row: SearchRow) => row.snippet },
  { header: "Score", cell: (row: SearchRow) => row.score.toFixed(2) },
];

export function SearchPage() {
  const { q: initialQ } = searchRoute.useSearch();
  // Seed from URL param on mount (e.g. when navigated from ⌘K with a query)
  const [input, setInput] = useState(initialQ ?? "");
  const [query, setQuery] = useState(initialQ ?? "");

  const { data = [] } = useSearch(query);

  const rows: SearchRow[] = data.map((r) => ({
    ...r,
    id: `${r.subject_type}:${r.subject_id}`,
  }));

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      setQuery(input.trim());
    }
  }

  return (
    <RequireAuth>
      <AppShell>
        <div className="p-6 space-y-6">
          <h1 className="text-xl font-semibold">Search</h1>
          <Input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Type a query and press Enter…"
            aria-label="Search query"
          />
          <DataTable rows={rows} columns={columns} empty="No results." />
        </div>
      </AppShell>
    </RequireAuth>
  );
}

export const searchRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/search",
  validateSearch: (s: Record<string, unknown>) => ({
    q: typeof s.q === "string" ? s.q : undefined,
  }),
  component: SearchPage,
});
