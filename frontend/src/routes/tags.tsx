import { createRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { ConfirmButton } from "../components/ConfirmButton";
import { DataTable } from "../components/DataTable";
import { RequireAuth } from "../components/RequireAuth";
import { SidePanel } from "../components/SidePanel";
import { Button, Field, Input } from "../components/ui";
import { useCreateTag, useDeleteTag, useTags, useUpdateTag } from "../features/tags/api";
import type { Tag } from "../lib/types";
import { rootRoute } from "./root";

interface FormState {
  name: string;
  kind: string;
}

const EMPTY_FORM: FormState = { name: "", kind: "" };

export function TagsPage() {
  const { data: tags = [] } = useTags();
  const createTag = useCreateTag();
  const updateTag = useUpdateTag();
  const deleteTag = useDeleteTag();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);

  function handleChange(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function handleNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setPanelOpen(true);
  }

  function handleEdit(row: Tag) {
    setEditingId(row.id);
    setForm({
      name: row.name,
      kind: row.kind ?? "",
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
      name: form.name,
      ...(form.kind ? { kind: form.kind } : { kind: null }),
    };
    if (editingId) {
      updateTag.mutate(
        { id: editingId, data: payload },
        { onSuccess: handleClose },
      );
    } else {
      createTag.mutate(payload, { onSuccess: handleClose });
    }
  }

  const columns = [
    { header: "Name", cell: (row: Tag) => row.name },
    { header: "Kind", cell: (row: Tag) => row.kind ?? "" },
    {
      header: "Actions",
      cell: (row: Tag) => (
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => handleEdit(row)}
          >
            Edit
          </button>
          <ConfirmButton onConfirm={() => deleteTag.mutate(row.id)}>Delete</ConfirmButton>
        </div>
      ),
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
            gap: 24,
          }}
        >
          <div className="flex items-center justify-between">
            <h1 className="title">Tags</h1>
            <div className="flex items-center gap-4">
              <p className="meta">
                <Link to="/activity" className="underline">
                  Manage from the Activity page to undo changes.
                </Link>
              </p>
              <Button type="button" onClick={handleNew} className="row gap-2">
                <Plus size={15} /> New
              </Button>
            </div>
          </div>

          <DataTable rows={tags} columns={columns} empty="No tags yet." />
        </div>

        <SidePanel
          open={panelOpen}
          onClose={handleClose}
          title={editingId ? "Edit tag" : "New tag"}
        >
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
            <Field label="Name">
              <Input
                value={form.name}
                onChange={handleChange("name")}
                placeholder="My Tag"
                aria-label="Name"
                required
              />
            </Field>
            <Field label="Kind">
              <Input
                value={form.kind}
                onChange={handleChange("kind")}
                placeholder="topic"
                aria-label="Kind"
              />
            </Field>
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

export const tagsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tags",
  component: TagsPage,
});
