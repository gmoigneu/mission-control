import { createRoute } from "@tanstack/react-router";
import { AppShell } from "../components/AppShell";
import { DataTable } from "../components/DataTable";
import { RequireAuth } from "../components/RequireAuth";
import { useAudit, useRevert } from "../features/audit/api";
import type { AuditEntry } from "../lib/types";
import { rootRoute } from "./root";

function UndoButton({ row }: { row: AuditEntry }) {
  const revert = useRevert();
  return (
    <button
      type="button"
      disabled={row.reverted}
      className="text-xs text-gray-500 hover:text-gray-900 disabled:cursor-not-allowed disabled:opacity-40"
      onClick={() => revert.mutate(row.id)}
    >
      Undo
    </button>
  );
}

export function ActivityPage() {
  const { data: entries = [] } = useAudit();

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
        <div className="p-6 space-y-4">
          <h1 className="text-xl font-semibold">Activity</h1>
          <DataTable rows={entries} columns={columns} empty="No activity yet." />
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
