import { createRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { ColorPicker } from "../components/ColorPicker";
import { ConfirmButton } from "../components/ConfirmButton";
import { StatusBadge } from "../components/console";
import { contextTint } from "../components/console-data";
import { DataTable } from "../components/DataTable";
import { RequireAuth } from "../components/RequireAuth";
import { SidePanel } from "../components/SidePanel";
import { SlugField } from "../components/SlugField";
import { editSearch, useEditFromSearch } from "../lib/useEditFromSearch";
import { useHotkey } from "../lib/useHotkey";
import { resolvedSlug } from "../lib/slug";
import { Button, Field, Input, Select, Textarea } from "../components/ui";
import { useContexts, useCreateContext, useDeleteContext, useUpdateContext } from "../features/contexts/api";
import type { Context } from "../lib/types";
import { rootRoute } from "./root";

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
];

interface FormState {
  slug: string;
  name: string;
  category: string;
  description: string;
  status: string;
  color: string;
}

const EMPTY_FORM: FormState = {
  slug: "", name: "", category: "", description: "", status: "active", color: "",
};

export function ContextsPage() {
  const { data: contexts = [] } = useContexts();
  const editRequest = useEditFromSearch(contexts);
  const createContext = useCreateContext();
  const updateContext = useUpdateContext();
  const deleteContext = useDeleteContext();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  useHotkey("c", handleNew, !panelOpen);
  if (editRequest) handleEdit(editRequest);

  function handleChange(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
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

  function handleEdit(row: Context) {
    setEditingId(row.id);
    setForm({
      slug: row.slug,
      name: row.name,
      category: row.category,
      description: row.description ?? "",
      status: row.status,
      color: row.color ?? "",
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
      slug: resolvedSlug(form.slug, form.name),
      name: form.name,
      category: form.category || undefined,
      description: form.description || null,
      status: form.status,
      color: form.color || null,
    };
    if (editingId) {
      updateContext.mutate(
        { id: editingId, data: payload },
        { onSuccess: handleClose },
      );
    } else {
      createContext.mutate(payload, { onSuccess: handleClose });
    }
  }

  const columns = [
    {
      header: "Name",
      cell: (row: Context) => (
        <span className="row gap-2">
          <span
            style={{ background: contextTint(row), width: 9, height: 9, borderRadius: 9, flexShrink: 0 }}
          />
          {row.name}
        </span>
      ),
    },
    { header: "Slug", cell: (row: Context) => row.slug },
    { header: "Category", cell: (row: Context) => row.category },
    { header: "Status", cell: (row: Context) => <StatusBadge status={row.status} /> },
    {
      header: "Actions",
      cell: (row: Context) => (
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => handleEdit(row)}
          >
            Edit
          </button>
          <ConfirmButton onConfirm={() => deleteContext.mutate(row.id)}>Delete</ConfirmButton>
        </div>
      ),
    },
  ];

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
          <div className="flex items-center justify-between">
            <h1 className="title">Contexts</h1>
            <div className="flex items-center gap-4">
              <p className="meta">
                <Link to="/activity" className="underline">
                  Manage from the Activity page to undo changes.
                </Link>
              </p>
              <Button type="button" onClick={handleNew} className="row gap-2">
                <Plus size={15} /> Create
              </Button>
            </div>
          </div>

          <DataTable rows={contexts} columns={columns} empty="No contexts yet." />
        </div>

        <SidePanel
          open={panelOpen}
          onClose={handleClose}
          title={editingId ? "Edit context" : "New context"}
        >
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
            <Field label="Name">
              <Input
                value={form.name}
                onChange={handleChange("name")}
                placeholder="My Context"
                aria-label="Name"
                required
              />
            </Field>
            <Field label="Category">
              <Input
                value={form.category}
                onChange={handleChange("category")}
                placeholder="work"
                aria-label="Category"
              />
            </Field>
            <Field label="Description">
              <Textarea
                value={form.description}
                onChange={handleChange("description")}
                placeholder="Optional description"
                aria-label="Description"
                rows={4}
              />
            </Field>
            <Field label="Status">
              <Select
                value={form.status}
                onChange={handleSelectChange("status")}
                options={STATUS_OPTIONS}
              />
            </Field>
            <Field label="Color">
              <ColorPicker value={form.color} onChange={handleSelectChange("color")} />
            </Field>
            <SlugField
              value={form.slug}
              source={form.name}
              onChange={(value) => setForm((prev) => ({ ...prev, slug: value }))}
            />
            <div className="flex gap-2">
              <Button type="submit">{editingId ? "Save" : "Add"}</Button>
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

export const contextsRoute = createRoute({
  getParentRoute: () => rootRoute,
  validateSearch: editSearch,
  path: "/contexts",
  component: ContextsPage,
});
