import { createRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { ConfirmButton } from "../components/ConfirmButton";
import { DataTable } from "../components/DataTable";
import { RequireAuth } from "../components/RequireAuth";
import { Button, Card, Field, Input } from "../components/ui";
import { useContexts, useCreateContext, useDeleteContext, useUpdateContext } from "../features/contexts/api";
import type { Context } from "../lib/types";
import { rootRoute } from "./root";

interface FormState {
  slug: string;
  name: string;
  category: string;
  description: string;
}

const EMPTY_FORM: FormState = { slug: "", name: "", category: "", description: "" };

export function ContextsPage() {
  const { data: contexts = [] } = useContexts();
  const createContext = useCreateContext();
  const updateContext = useUpdateContext();
  const deleteContext = useDeleteContext();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);

  function handleChange(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function handleEdit(row: Context) {
    setEditingId(row.id);
    setForm({
      slug: row.slug,
      name: row.name,
      category: row.category,
      description: row.description ?? "",
    });
  }

  function handleCancel() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      slug: form.slug,
      name: form.name,
      category: form.category || undefined,
      description: form.description || null,
    };
    if (editingId) {
      updateContext.mutate(
        { id: editingId, data: payload },
        {
          onSuccess: () => {
            setEditingId(null);
            setForm(EMPTY_FORM);
          },
        },
      );
    } else {
      createContext.mutate(payload, {
        onSuccess: () => setForm(EMPTY_FORM),
      });
    }
  }

  const columns = [
    { header: "Name", cell: (row: Context) => row.name },
    { header: "Slug", cell: (row: Context) => row.slug },
    { header: "Category", cell: (row: Context) => row.category },
    { header: "Status", cell: (row: Context) => row.status },
    {
      header: "Actions",
      cell: (row: Context) => (
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="text-xs text-gray-500 hover:text-gray-900"
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
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">Contexts</h1>
            <p className="text-sm text-gray-400">
              <Link to="/activity" className="underline hover:text-gray-600">
                Manage from the Activity page to undo changes.
              </Link>
            </p>
          </div>

          <Card>
            <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
              <Field label="Name">
                <Input
                  value={form.name}
                  onChange={handleChange("name")}
                  placeholder="My Context"
                  aria-label="Name"
                  required
                />
              </Field>
              <Field label="Slug">
                <Input
                  value={form.slug}
                  onChange={handleChange("slug")}
                  placeholder="my-context"
                  aria-label="Slug"
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
                <Input
                  value={form.description}
                  onChange={handleChange("description")}
                  placeholder="Optional description"
                  aria-label="Description"
                />
              </Field>
              <div className="col-span-2 flex gap-2">
                <Button type="submit">{editingId ? "Save" : "Add"}</Button>
                {editingId && (
                  <Button type="button" onClick={handleCancel} className="bg-gray-400 hover:bg-gray-500">
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </Card>

          <DataTable rows={contexts} columns={columns} empty="No contexts yet." />
        </div>
      </AppShell>
    </RequireAuth>
  );
}

export const contextsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/contexts",
  component: ContextsPage,
});
