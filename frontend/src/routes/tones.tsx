import { createRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { ConfirmButton } from "../components/ConfirmButton";
import { DataTable } from "../components/DataTable";
import { RequireAuth } from "../components/RequireAuth";
import { Button, Card, Field, Input } from "../components/ui";
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

  function handleChange(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function handleEdit(row: Tone) {
    setEditingId(row.id);
    setForm({
      name: row.name,
      slug: row.slug,
      description: row.description ?? "",
      sample: row.sample ?? "",
    });
  }

  function handleCancel() {
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
        {
          onSuccess: () => {
            setEditingId(null);
            setForm(EMPTY_FORM);
          },
        },
      );
    } else {
      createTone.mutate(payload, {
        onSuccess: () => setForm(EMPTY_FORM),
      });
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

          <DataTable rows={tones} columns={columns} empty="No tones yet." />
        </div>
      </AppShell>
    </RequireAuth>
  );
}

export const tonesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tones",
  component: TonesPage,
});
