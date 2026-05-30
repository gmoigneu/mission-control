import { createRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { ConfirmButton } from "../components/ConfirmButton";
import { DataTable } from "../components/DataTable";
import { RequireAuth } from "../components/RequireAuth";
import { Button, Card, Field, Input, Select } from "../components/ui";
import {
  useCreateInboxItem,
  useDeleteInboxItem,
  useInboxItems,
  useUpdateInboxItem,
} from "../features/inbox/api";
import type { InboxItem } from "../lib/types";
import { rootRoute } from "./root";

const STATUS_OPTIONS = [
  { value: "open", label: "open" },
  { value: "processed", label: "processed" },
];

interface FormState {
  body: string;
  source: string;
}

const EMPTY_FORM: FormState = { body: "", source: "" };

export function InboxPage() {
  const { data: items = [] } = useInboxItems();
  const createItem = useCreateInboxItem();
  const updateItem = useUpdateInboxItem();
  const deleteItem = useDeleteInboxItem();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [statusFilter, setStatusFilter] = useState<string>("open");

  function handleChange(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      body: form.body,
      ...(form.source ? { source: form.source } : { source: null }),
    };
    createItem.mutate(payload, {
      onSuccess: () => setForm(EMPTY_FORM),
    });
  }

  function toggleStatus(row: InboxItem) {
    updateItem.mutate({
      id: row.id,
      data: { status: row.status === "open" ? "processed" : "open" },
    });
  }

  const visible =
    statusFilter === "all" ? items : items.filter((i) => i.status === statusFilter);

  const columns = [
    {
      header: "Body",
      cell: (row: InboxItem) => (row.body.length > 80 ? `${row.body.slice(0, 80)}…` : row.body),
    },
    { header: "Status", cell: (row: InboxItem) => row.status },
    { header: "Source", cell: (row: InboxItem) => row.source ?? "" },
    {
      header: "Actions",
      cell: (row: InboxItem) => (
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="text-xs text-gray-500 hover:text-gray-900"
            onClick={() => toggleStatus(row)}
          >
            {row.status === "open" ? "Mark processed" : "Reopen"}
          </button>
          <ConfirmButton onConfirm={() => deleteItem.mutate(row.id)}>Delete</ConfirmButton>
        </div>
      ),
    },
  ];

  return (
    <RequireAuth>
      <AppShell>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">Inbox</h1>
            <p className="text-sm text-gray-400">
              <Link to="/activity" className="underline hover:text-gray-600">
                Manage from the Activity page to undo changes.
              </Link>
            </p>
          </div>

          <Card>
            <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
              <Field label="Body">
                <Input
                  value={form.body}
                  onChange={handleChange("body")}
                  placeholder="Capture a raw note to triage later"
                  aria-label="Body"
                  required
                />
              </Field>
              <Field label="Source">
                <Input
                  value={form.source}
                  onChange={handleChange("source")}
                  placeholder="Optional source"
                  aria-label="Source"
                />
              </Field>
              <div className="col-span-2 flex gap-2">
                <Button type="submit" disabled={!form.body}>
                  Add
                </Button>
              </div>
            </form>
          </Card>

          <div className="flex items-center gap-2">
            <span className="label">Show</span>
            <div style={{ width: 160 }}>
              <Select
                value={statusFilter}
                onChange={setStatusFilter}
                options={[{ value: "all", label: "all" }, ...STATUS_OPTIONS]}
              />
            </div>
          </div>

          <DataTable rows={visible} columns={columns} empty="Inbox zero — nothing to triage." />
        </div>
      </AppShell>
    </RequireAuth>
  );
}

export const inboxRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/inbox",
  component: InboxPage,
});
