import { createRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { ConfirmButton } from "../components/ConfirmButton";
import { DataTable } from "../components/DataTable";
import { RequireAuth } from "../components/RequireAuth";
import { Button, Card, Field, Input } from "../components/ui";
import {
  useCreateKnowledge,
  useDeleteKnowledge,
  useKnowledge,
  useUpdateKnowledge,
} from "../features/knowledge/api";
import type { Knowledge } from "../lib/types";
import { rootRoute } from "./root";

interface FormState {
  title: string;
  slug: string;
  body: string;
}

const EMPTY_FORM: FormState = { title: "", slug: "", body: "" };

export function KnowledgePage() {
  const { data: knowledge = [] } = useKnowledge();
  const createKnowledge = useCreateKnowledge();
  const updateKnowledge = useUpdateKnowledge();
  const deleteKnowledge = useDeleteKnowledge();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);

  function handleChange(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function handleEdit(row: Knowledge) {
    setEditingId(row.id);
    setForm({
      title: row.title,
      slug: row.slug,
      body: row.body ?? "",
    });
  }

  function handleCancel() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      title: form.title,
      slug: form.slug,
      ...(form.body ? { body: form.body } : { body: null }),
    };
    if (editingId) {
      updateKnowledge.mutate(
        { id: editingId, data: payload },
        {
          onSuccess: () => {
            setEditingId(null);
            setForm(EMPTY_FORM);
          },
        },
      );
    } else {
      createKnowledge.mutate(payload, {
        onSuccess: () => setForm(EMPTY_FORM),
      });
    }
  }

  const columns = [
    { header: "Title", cell: (row: Knowledge) => row.title },
    { header: "Slug", cell: (row: Knowledge) => row.slug },
    {
      header: "Actions",
      cell: (row: Knowledge) => (
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="text-xs text-gray-500 hover:text-gray-900"
            onClick={() => handleEdit(row)}
          >
            Edit
          </button>
          <ConfirmButton onConfirm={() => deleteKnowledge.mutate(row.id)}>Delete</ConfirmButton>
        </div>
      ),
    },
  ];

  return (
    <RequireAuth>
      <AppShell>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">Knowledge</h1>
            <p className="text-sm text-gray-400">
              <Link to="/activity" className="underline hover:text-gray-600">
                Manage from the Activity page to undo changes.
              </Link>
            </p>
          </div>

          <Card>
            <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
              <Field label="Title">
                <Input
                  value={form.title}
                  onChange={handleChange("title")}
                  placeholder="Rust ownership notes"
                  aria-label="Title"
                  required
                />
              </Field>
              <Field label="Slug">
                <Input
                  value={form.slug}
                  onChange={handleChange("slug")}
                  placeholder="rust-ownership-notes"
                  aria-label="Slug"
                  required
                />
              </Field>
              <div className="col-span-2">
                <Field label="Body">
                  <Input
                    value={form.body}
                    onChange={handleChange("body")}
                    placeholder="Optional note body"
                    aria-label="Body"
                  />
                </Field>
              </div>
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

          <DataTable rows={knowledge} columns={columns} empty="No knowledge notes yet." />
        </div>
      </AppShell>
    </RequireAuth>
  );
}

export const knowledgeRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/knowledge",
  component: KnowledgePage,
});
