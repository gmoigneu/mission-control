import { createRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { ConfirmButton } from "../components/ConfirmButton";
import { DataTable } from "../components/DataTable";
import { RequireAuth } from "../components/RequireAuth";
import { SidePanel } from "../components/SidePanel";
import { SlugField } from "../components/SlugField";
import { editSearch, useEditFromSearch } from "../lib/useEditFromSearch";
import { useHotkey } from "../lib/useHotkey";
import { resolvedSlug } from "../lib/slug";
import { Button, Field, Input, Textarea } from "../components/ui";
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
  const editRequest = useEditFromSearch(knowledge);
  const createKnowledge = useCreateKnowledge();
  const updateKnowledge = useUpdateKnowledge();
  const deleteKnowledge = useDeleteKnowledge();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  useHotkey("c", handleNew, !panelOpen);
  if (editRequest) handleEdit(editRequest);

  function handleChange(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function handleNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setPanelOpen(true);
  }

  function handleEdit(row: Knowledge) {
    setEditingId(row.id);
    setForm({
      title: row.title,
      slug: row.slug,
      body: row.body ?? "",
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
      title: form.title,
      slug: resolvedSlug(form.slug, form.title),
      ...(form.body ? { body: form.body } : { body: null }),
    };
    if (editingId) {
      updateKnowledge.mutate(
        { id: editingId, data: payload },
        { onSuccess: handleClose },
      );
    } else {
      createKnowledge.mutate(payload, { onSuccess: handleClose });
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
        <div className="page space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-semibold">Knowledge</h1>
            <div className="flex items-center gap-4">
              <p className="text-sm text-gray-400">
                <Link to="/activity" className="underline hover:text-gray-600">
                  Manage from the Activity page to undo changes.
                </Link>
              </p>
              <Button type="button" onClick={handleNew} className="row gap-2">
                <Plus size={15} /> Create
              </Button>
            </div>
          </div>

          <DataTable rows={knowledge} columns={columns} empty="No knowledge notes yet." />
        </div>

        <SidePanel
          open={panelOpen}
          onClose={handleClose}
          title={editingId ? "Edit knowledge" : "New knowledge"}
        >
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
            <Field label="Title">
              <Input
                value={form.title}
                onChange={handleChange("title")}
                placeholder="Rust ownership notes"
                aria-label="Title"
                required
              />
            </Field>
            <Field label="Body">
              <Textarea
                value={form.body}
                onChange={handleChange("body")}
                placeholder="Optional note body"
                aria-label="Body"
                rows={8}
              />
            </Field>
            <SlugField
              value={form.slug}
              source={form.title}
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

export const knowledgeRoute = createRoute({
  getParentRoute: () => rootRoute,
  validateSearch: editSearch,
  path: "/knowledge",
  component: KnowledgePage,
});
