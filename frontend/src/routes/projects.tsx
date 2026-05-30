import { createRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { ConfirmButton } from "../components/ConfirmButton";
import { DataTable } from "../components/DataTable";
import { RequireAuth } from "../components/RequireAuth";
import { Button, Card, Field, Input, Select } from "../components/ui";
import { useContexts } from "../features/contexts/api";
import { useCreateProject, useDeleteProject, useProjects, useUpdateProject } from "../features/projects/api";
import type { Project } from "../lib/types";
import { rootRoute } from "./root";

const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "on_hold", label: "On Hold" },
  { value: "done", label: "Done" },
  { value: "archived", label: "Archived" },
];

interface FormState {
  context_id: string;
  title: string;
  slug: string;
  status: string;
  purpose: string;
  body: string;
}

const EMPTY_FORM: FormState = {
  context_id: "",
  title: "",
  slug: "",
  status: "active",
  purpose: "",
  body: "",
};

export function ProjectsPage() {
  const { data: projects = [] } = useProjects();
  const { data: contexts = [] } = useContexts();
  const createProject = useCreateProject();
  const updateProject = useUpdateProject();
  const deleteProject = useDeleteProject();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);

  function handleChange(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function handleSelectChange(key: keyof FormState) {
    return (value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleEdit(row: Project) {
    setEditingId(row.id);
    setForm({
      context_id: row.context_id,
      title: row.title,
      slug: row.slug,
      status: row.status,
      purpose: row.purpose ?? "",
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
      context_id: form.context_id,
      title: form.title,
      slug: form.slug,
      status: form.status,
      purpose: form.purpose || null,
      body: form.body || null,
    };
    if (editingId) {
      updateProject.mutate(
        { id: editingId, data: payload },
        {
          onSuccess: () => {
            setEditingId(null);
            setForm(EMPTY_FORM);
          },
        },
      );
    } else {
      createProject.mutate(payload, {
        onSuccess: () => setForm(EMPTY_FORM),
      });
    }
  }

  const contextMap = Object.fromEntries(contexts.map((c) => [c.id, c.name]));

  const columns = [
    { header: "Title", cell: (row: Project) => row.title },
    { header: "Slug", cell: (row: Project) => row.slug },
    { header: "Context", cell: (row: Project) => contextMap[row.context_id] ?? row.context_id },
    { header: "Status", cell: (row: Project) => row.status },
    {
      header: "Actions",
      cell: (row: Project) => (
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="text-xs text-gray-500 hover:text-gray-900"
            onClick={() => handleEdit(row)}
          >
            Edit
          </button>
          <ConfirmButton onConfirm={() => deleteProject.mutate(row.id)}>Delete</ConfirmButton>
        </div>
      ),
    },
  ];

  return (
    <RequireAuth>
      <AppShell>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">Projects</h1>
            <p className="text-sm text-gray-400">
              <Link to="/activity" className="underline hover:text-gray-600">
                Manage from the Activity page to undo changes.
              </Link>
            </p>
          </div>

          <Card>
            <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
              <Field label="Context">
                <Select
                  value={form.context_id}
                  onChange={handleSelectChange("context_id")}
                  options={contexts.map((c) => ({ value: c.id, label: c.name }))}
                  placeholder="— select context —"
                />
              </Field>
              <Field label="Title">
                <Input
                  value={form.title}
                  onChange={handleChange("title")}
                  placeholder="My Project"
                  aria-label="Title"
                  required
                />
              </Field>
              <Field label="Slug">
                <Input
                  value={form.slug}
                  onChange={handleChange("slug")}
                  placeholder="my-project"
                  aria-label="Slug"
                  required
                />
              </Field>
              <Field label="Status">
                <Select
                  value={form.status}
                  onChange={handleSelectChange("status")}
                  options={STATUS_OPTIONS}
                />
              </Field>
              <Field label="Purpose">
                <Input
                  value={form.purpose}
                  onChange={handleChange("purpose")}
                  placeholder="Optional purpose"
                  aria-label="Purpose"
                />
              </Field>
              <Field label="Body">
                <Input
                  value={form.body}
                  onChange={handleChange("body")}
                  placeholder="Optional body"
                  aria-label="Body"
                />
              </Field>
              <div className="col-span-2 flex gap-2">
                <Button type="submit" disabled={!form.context_id}>{editingId ? "Save" : "Add"}</Button>
                {editingId && (
                  <Button type="button" onClick={handleCancel} className="bg-gray-400 hover:bg-gray-500">
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </Card>

          <DataTable rows={projects} columns={columns} empty="No projects yet." />
        </div>
      </AppShell>
    </RequireAuth>
  );
}

export const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects",
  component: ProjectsPage,
});
