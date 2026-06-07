import { createRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { ConfirmButton } from "../components/ConfirmButton";
import { DataTable } from "../components/DataTable";
import { RequireAuth } from "../components/RequireAuth";
import { SidePanel } from "../components/SidePanel";
import { Button, Field, Input, Select } from "../components/ui";
import {
  useCreateTelos,
  useDeleteTelos,
  useTelos,
  useUpdateTelos,
} from "../features/telos/api";
import type { Telos, TelosKind } from "../lib/types";
import { rootRoute } from "./root";

const KIND_OPTIONS: { value: TelosKind; label: string }[] = [
  { value: "mission", label: "mission" },
  { value: "goal", label: "goal" },
  { value: "problem", label: "problem" },
  { value: "metric", label: "metric" },
  { value: "value", label: "value" },
];

interface FormState {
  kind: TelosKind;
  title: string;
  body: string;
  parent_id: string;
}

const EMPTY_FORM: FormState = { kind: "goal", title: "", body: "", parent_id: "" };

export function TelosPage() {
  const { data: items = [] } = useTelos();
  const createTelos = useCreateTelos();
  const updateTelos = useUpdateTelos();
  const deleteTelos = useDeleteTelos();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  function handleChange(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function handleSelectChange(key: keyof FormState) {
    return (value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setPanelOpen(true);
  }

  function handleEdit(row: Telos) {
    setEditingId(row.id);
    setForm({
      kind: row.kind,
      title: row.title,
      body: row.body ?? "",
      parent_id: row.parent_id ?? "",
    });
    setPanelOpen(true);
  }

  function handleClose() {
    setPanelOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      kind: form.kind,
      title: form.title,
      ...(form.body ? { body: form.body } : { body: null }),
      ...(form.parent_id ? { parent_id: form.parent_id } : { parent_id: null }),
    };
    if (editingId) {
      updateTelos.mutate(
        { id: editingId, data: payload },
        { onSuccess: handleClose },
      );
    } else {
      createTelos.mutate(payload, { onSuccess: handleClose });
    }
  }

  const parentOptions = items
    .filter((row) => row.id !== editingId)
    .map((row) => ({ value: row.id, label: `${row.kind}: ${row.title}` }));
  const titleById = new Map(items.map((row) => [row.id, row.title]));

  const columns = [
    { header: "Kind", cell: (row: Telos) => row.kind },
    { header: "Title", cell: (row: Telos) => row.title },
    {
      header: "Parent",
      cell: (row: Telos) => (row.parent_id ? titleById.get(row.parent_id) ?? "" : ""),
    },
    {
      header: "Actions",
      cell: (row: Telos) => (
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="text-xs text-gray-500 hover:text-gray-900"
            onClick={() => handleEdit(row)}
          >
            Edit
          </button>
          <ConfirmButton onConfirm={() => deleteTelos.mutate(row.id)}>Delete</ConfirmButton>
        </div>
      ),
    },
  ];

  return (
    <RequireAuth>
      <AppShell>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">TELOS</h1>
            <div className="flex items-center gap-4">
              <p className="text-sm text-gray-400">
                <Link to="/activity" className="underline hover:text-gray-600">
                  Manage from the Activity page to undo changes.
                </Link>
              </p>
              <Button type="button" onClick={handleNew} className="row gap-2">
                <Plus size={15} /> New
              </Button>
            </div>
          </div>

          <DataTable rows={items} columns={columns} empty="No TELOS entries yet." />
        </div>

        <SidePanel
          open={panelOpen}
          onClose={handleClose}
          title={editingId ? "Edit telos" : "New telos"}
        >
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
            <Field label="Kind">
              <Select
                value={form.kind}
                onChange={handleSelectChange("kind")}
                options={KIND_OPTIONS}
              />
            </Field>
            <Field label="Title">
              <Input
                value={form.title}
                onChange={handleChange("title")}
                placeholder="Mission, goal, problem…"
                aria-label="Title"
                required
              />
            </Field>
            <Field label="Body">
              <Input
                value={form.body}
                onChange={handleChange("body")}
                placeholder="Optional detail"
                aria-label="Body"
              />
            </Field>
            <Field label="Parent">
              <Select
                value={form.parent_id}
                onChange={handleSelectChange("parent_id")}
                options={parentOptions}
                placeholder="None"
              />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" disabled={!form.title}>
                {editingId ? "Save" : "Add"}
              </Button>
              <Button type="button" onClick={handleClose} className="ghost">
                Cancel
              </Button>
            </div>
          </form>
        </SidePanel>
      </AppShell>
    </RequireAuth>
  );
}

export const telosRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/telos",
  component: TelosPage,
});
