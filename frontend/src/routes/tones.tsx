import { createRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { ConfirmButton } from "../components/ConfirmButton";
import { DataTable } from "../components/DataTable";
import { RequireAuth } from "../components/RequireAuth";
import { SidePanel } from "../components/SidePanel";
import { useHotkey } from "../lib/useHotkey";
import { Button, Field, Input } from "../components/ui";
import { useCreateTone, useDeleteTone, useTones, useUpdateTone } from "../features/tones/api";
import type { Tone } from "../lib/types";
import { rootRoute } from "./root";

interface FormState {
  name: string;
  slug: string;
  description: string;
  sample: string;
}

const EMPTY_FORM: FormState = { name: "", slug: "", description: "", sample: "" };

export function TonesPage() {
  const { data: tones = [] } = useTones();
  const createTone = useCreateTone();
  const updateTone = useUpdateTone();
  const deleteTone = useDeleteTone();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  useHotkey("c", handleNew, !panelOpen);

  function handleChange(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function handleNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setPanelOpen(true);
  }

  function handleEdit(row: Tone) {
    setEditingId(row.id);
    setForm({
      name: row.name,
      slug: row.slug,
      description: row.description ?? "",
      sample: row.sample ?? "",
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
      slug: form.slug,
      ...(form.description ? { description: form.description } : { description: null }),
      ...(form.sample ? { sample: form.sample } : { sample: null }),
    };
    if (editingId) {
      updateTone.mutate(
        { id: editingId, data: payload },
        { onSuccess: handleClose },
      );
    } else {
      createTone.mutate(payload, { onSuccess: handleClose });
    }
  }

  const columns = [
    { header: "Name", cell: (row: Tone) => row.name },
    { header: "Slug", cell: (row: Tone) => row.slug },
    { header: "Description", cell: (row: Tone) => row.description ?? "" },
    {
      header: "Actions",
      cell: (row: Tone) => (
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="text-xs text-gray-500 hover:text-gray-900"
            onClick={() => handleEdit(row)}
          >
            Edit
          </button>
          <ConfirmButton onConfirm={() => deleteTone.mutate(row.id)}>Delete</ConfirmButton>
        </div>
      ),
    },
  ];

  return (
    <RequireAuth>
      <AppShell>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">Tones</h1>
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

          <DataTable rows={tones} columns={columns} empty="No tones yet." />
        </div>

        <SidePanel
          open={panelOpen}
          onClose={handleClose}
          title={editingId ? "Edit tone" : "New tone"}
        >
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
            <Field label="Name">
              <Input
                value={form.name}
                onChange={handleChange("name")}
                placeholder="Warm"
                aria-label="Name"
                required
              />
            </Field>
            <Field label="Slug">
              <Input
                value={form.slug}
                onChange={handleChange("slug")}
                placeholder="warm"
                aria-label="Slug"
                required
              />
            </Field>
            <Field label="Description">
              <Input
                value={form.description}
                onChange={handleChange("description")}
                placeholder="Friendly and approachable"
                aria-label="Description"
              />
            </Field>
            <Field label="Sample">
              <Input
                value={form.sample}
                onChange={handleChange("sample")}
                placeholder="A short passage written in this voice"
                aria-label="Sample"
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

export const tonesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tones",
  component: TonesPage,
});
