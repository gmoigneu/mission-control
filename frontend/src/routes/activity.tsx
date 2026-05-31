import { createRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { DataTable } from "../components/DataTable";
import { Pagination } from "../components/Pagination";
import { RequireAuth } from "../components/RequireAuth";
import { useAuditPage, useRevert } from "../features/audit/api";
import type { AuditEntry } from "../lib/types";
import { rootRoute } from "./root";

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
    { header: "Entity", cell: (row: AuditEntry) => row.entity_type },
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
