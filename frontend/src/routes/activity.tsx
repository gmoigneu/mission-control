import { createRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { DataTable } from "../components/DataTable";
import { RequireAuth } from "../components/RequireAuth";
import { Button } from "../components/ui";
import { AUDIT_PAGE_SIZE, useAudit, useRevert } from "../features/audit/api";
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
  const [offset, setOffset] = useState(0);
  const { data } = useAudit({ limit: AUDIT_PAGE_SIZE, offset });
  const entries = data?.data ?? [];
  const total = data?.total ?? 0;
  const hasPrev = offset > 0;
  const hasNext = offset + AUDIT_PAGE_SIZE < total;
  const rangeEnd = total === 0 ? 0 : Math.min(offset + entries.length, total);
  const rangeStart = total === 0 ? 0 : offset + 1;

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
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>
              {rangeStart}–{rangeEnd} of {total}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                disabled={!hasPrev}
                onClick={() => setOffset((o) => Math.max(0, o - AUDIT_PAGE_SIZE))}
                className="bg-gray-400 hover:bg-gray-500 disabled:opacity-40"
              >
                Previous
              </Button>
              <Button
                type="button"
                disabled={!hasNext}
                onClick={() => setOffset((o) => o + AUDIT_PAGE_SIZE)}
                className="bg-gray-400 hover:bg-gray-500 disabled:opacity-40"
              >
                Next
              </Button>
            </div>
          </div>
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
