import { createRoute, Link } from "@tanstack/react-router";
import { Building2, FolderKanban, Layers, SquareCheckBig, Users } from "lucide-react";
import { type ComponentType, type ReactNode, useState } from "react";
import { AppShell } from "../components/AppShell";
import { DataTable } from "../components/DataTable";
import { RequireAuth } from "../components/RequireAuth";
import { Badge, Input } from "../components/ui";
import { useSearch } from "../features/search/api";
import type { SearchResult } from "../lib/types";
import { rootRoute } from "./root";

type SearchRow = SearchResult & { id: string };

// Per-subject-type display metadata. Icons mirror the sidebar nav for consistency.
const TYPE_META: Record<string, { label: string; Icon: ComponentType<{ size?: number }> }> = {
  person: { label: "Person", Icon: Users },
  company: { label: "Company", Icon: Building2 },
  project: { label: "Project", Icon: FolderKanban },
  context: { label: "Context", Icon: Layers },
  task: { label: "Task", Icon: SquareCheckBig },
};

/** Link a result to its entity. People deep-link to the detail page; other types
 * have no detail route yet, so they link to their list page. */
function EntityLink({
  row,
  className,
  children,
}: {
  row: SearchRow;
  className?: string;
  children: ReactNode;
}) {
  switch (row.subject_type) {
    case "person":
      return row.slug ? (
        <Link to="/people/$slug" params={{ slug: row.slug }} className={className}>
          {children}
        </Link>
      ) : (
        <Link to="/people" className={className}>
          {children}
        </Link>
      );
    case "company":
      return (
        <Link to="/companies" className={className}>
          {children}
        </Link>
      );
    case "project":
      return (
        <Link to="/projects" className={className}>
          {children}
        </Link>
      );
    case "context":
      return (
        <Link to="/contexts" className={className}>
          {children}
        </Link>
      );
    case "task":
      return (
        <Link to="/tasks" className={className}>
          {children}
        </Link>
      );
    default:
      return <span className={className}>{children}</span>;
  }
}

function TypeBadge({ subjectType }: { subjectType: string }) {
  const meta = TYPE_META[subjectType];
  const Icon = meta?.Icon;
  return (
    <Badge>
      {Icon ? <Icon size={11} /> : null}
      {meta?.label ?? subjectType}
    </Badge>
  );
}

const columns = [
  {
    header: "Type",
    cell: (row: SearchRow) => <TypeBadge subjectType={row.subject_type} />,
  },
  {
    header: "Result",
    cell: (row: SearchRow) => (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        <EntityLink row={row} className="underline hover:text-gray-600">
          {row.name ?? "Untitled"}
        </EntityLink>
        <span className="meta">{row.snippet}</span>
      </div>
    ),
  },
  {
    header: "Score",
    cell: (row: SearchRow) => row.score.toFixed(2),
  },
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
        <div
          className="page"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          <h1 className="title">Search</h1>
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
