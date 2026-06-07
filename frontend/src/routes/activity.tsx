import { createRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { DataTable } from "../components/DataTable";
import { Pagination } from "../components/Pagination";
import { RequireAuth } from "../components/RequireAuth";
import { useAuditPage, useRevert } from "../features/audit/api";
import type { AuditEntry } from "../lib/types";
import { rootRoute } from "./root";

/** Fields tried, in order, when deriving a human name from an audit snapshot. */
const NAME_FIELDS = ["title", "name", "body", "slug"] as const;

/** entity_type → list route for records edited via a drawer (deep-link with ?edit). */
const EDITABLE_ROUTE = {
  task: "/tasks",
  context: "/contexts",
  project: "/projects",
  company: "/companies",
  habit: "/habits",
  meeting: "/meetings",
  knowledge: "/knowledge",
  telos: "/telos",
  tone: "/tones",
  review: "/reviews",
  journal: "/journal",
  tag: "/tags",
  relationship: "/relationships",
  observation: "/observations",
} as const;

/** entity_type → list route for records without an edit drawer (link to the page). */
const PLAIN_ROUTE = {
  inbox_item: "/inbox",
  entity_tag: "/entity-tags",
  entity_link: "/entity-links",
} as const;

/** The create/update/delete snapshot that carries the entity's fields. */
function snapshot(entry: AuditEntry): Record<string, unknown> | null {
  return entry.after ?? entry.before;
}

/** Best-effort human name for an audited entity, falling back to its id. */
function entityName(entry: AuditEntry): string {
  const snap = snapshot(entry);
  if (snap) {
    for (const field of NAME_FIELDS) {
      const value = snap[field];
      if (typeof value === "string" && value.trim()) {
        return value.length > 60 ? `${value.slice(0, 60)}…` : value;
      }
    }
  }
  return entry.entity_id;
}

/** The entity's name, linked to where you can open it (drawer, page, or detail). */
function EntityName({ entry }: { entry: AuditEntry }) {
  const name = entityName(entry);
  const type = entry.entity_type;

  if (type === "person") {
    const slug = snapshot(entry)?.slug;
    if (typeof slug === "string" && slug) {
      return (
        <Link to="/people/$slug" params={{ slug }} className="underline">
          {name}
        </Link>
      );
    }
    return <>{name}</>;
  }

  if (type in EDITABLE_ROUTE) {
    return (
      <Link
        to={EDITABLE_ROUTE[type as keyof typeof EDITABLE_ROUTE]}
        search={{ edit: entry.entity_id }}
        className="underline"
      >
        {name}
      </Link>
    );
  }

  if (type in PLAIN_ROUTE) {
    return (
      <Link to={PLAIN_ROUTE[type as keyof typeof PLAIN_ROUTE]} className="underline">
        {name}
      </Link>
    );
  }

  return <>{name}</>;
}

function UndoButton({ row }: { row: AuditEntry }) {
  const revert = useRevert();
  return (
    <button
      type="button"
      disabled={row.reverted}
      className="btn ghost sm disabled:cursor-not-allowed disabled:opacity-40"
      onClick={() => revert.mutate(row.id)}
    >
      Undo
    </button>
  );
}

export function ActivityPage() {
  const [offset, setOffset] = useState(0);
  const { data: auditPage } = useAuditPage(offset);
  const entries = auditPage?.items ?? [];

  const columns = [
    {
      header: "When",
      cell: (row: AuditEntry) => new Date(row.created_at).toLocaleString(),
    },
    { header: "Action", cell: (row: AuditEntry) => row.action },
    {
      header: "Entity",
      cell: (row: AuditEntry) => (
        <span className="row gap-2">
          <EntityName entry={row} />
          <span className="meta" style={{ color: "var(--fg-faint)" }}>
            {row.entity_type}
          </span>
        </span>
      ),
    },
    { header: "Surface", cell: (row: AuditEntry) => row.surface },
    {
      header: "Reverted",
      cell: (row: AuditEntry) => (row.reverted ? "Yes" : "No"),
    },
    {
      header: "Undo",
      cell: (row: AuditEntry) => <UndoButton row={row} />,
    },
  ];

  return (
    <RequireAuth>
      <AppShell>
        <div
          style={{
            padding: "24px 32px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <h1 className="title">Activity</h1>
          <DataTable rows={entries} columns={columns} empty="No activity yet." />
          {auditPage && <Pagination page={auditPage.page} onChange={setOffset} />}
        </div>
      </AppShell>
    </RequireAuth>
  );
}

export const activityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/activity",
  component: ActivityPage,
});
