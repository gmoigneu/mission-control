import { createRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { ConfirmButton } from "../components/ConfirmButton";
import { DataTable } from "../components/DataTable";
import { RequireAuth } from "../components/RequireAuth";
import { Button, Card, Field, Input, Select } from "../components/ui";
import { useContexts } from "../features/contexts/api";
import { useProjects } from "../features/projects/api";
import { useCreateTask, useDeleteTask, useTasks, useUpdateTask } from "../features/tasks/api";
import type { Task } from "../lib/types";
import { rootRoute } from "./root";

interface FormState {
  title: string;
  status: string;
  priority: string;
  due: string;
  scheduled: string;
  context_id: string;
  project_id: string;
  outcome: string;
}

const EMPTY_FORM: FormState = {
  title: "",
  status: "open",
  priority: "normal",
  due: "",
  scheduled: "",
  context_id: "",
  project_id: "",
  outcome: "",
};

/** Build a TaskCreate/TaskUpdate payload.
 * On create: omit empty optional FK/date fields entirely.
 * On update: send null for cleared optional FK/date fields so the backend can unset them.
 */
function buildPayload(form: FormState, isEdit: boolean) {
  return {
    title: form.title,
    status: form.status,
    priority: form.priority,
    ...(isEdit
      ? { due: form.due || null }
      : form.due ? { due: form.due } : {}),
    ...(isEdit
      ? { scheduled: form.scheduled || null }
      : form.scheduled ? { scheduled: form.scheduled } : {}),
    ...(isEdit
      ? { context_id: form.context_id || null }
      : form.context_id ? { context_id: form.context_id } : {}),
    ...(isEdit
      ? { project_id: form.project_id || null }
      : form.project_id ? { project_id: form.project_id } : {}),
    ...(form.outcome ? { outcome: form.outcome } : { outcome: null }),
  };
}

const STATUS_OPTIONS = [
  { value: "open", label: "Open" },
  { value: "in_progress", label: "In Progress" },
  { value: "done", label: "Done" },
  { value: "archived", label: "Archived" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
];

export function TasksPage() {
  const { data: tasks = [] } = useTasks();
  const { data: contexts = [] } = useContexts();
  const { data: projects = [] } = useProjects();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);

  function handleChange(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function handleSelectChange(key: keyof FormState) {
    return (value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleEdit(row: Task) {
    setEditingId(row.id);
    setForm({
      title: row.title,
      status: row.status,
      priority: row.priority,
      due: row.due ?? "",
      scheduled: row.scheduled ?? "",
      context_id: row.context_id ?? "",
      project_id: row.project_id ?? "",
      outcome: row.outcome ?? "",
    });
  }

  function handleCancel() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = buildPayload(form, !!editingId);
    if (editingId) {
      updateTask.mutate(
        { id: editingId, data: payload },
        {
          onSuccess: () => {
            setEditingId(null);
            setForm(EMPTY_FORM);
          },
        },
      );
    } else {
      createTask.mutate(payload, {
        onSuccess: () => setForm(EMPTY_FORM),
      });
    }
  }

  const contextMap = Object.fromEntries(contexts.map((c) => [c.id, c.name]));

  const columns = [
    { header: "Title", cell: (row: Task) => row.title },
    { header: "Status", cell: (row: Task) => row.status },
    { header: "Priority", cell: (row: Task) => row.priority },
    { header: "Due", cell: (row: Task) => row.due ?? "" },
    { header: "Context", cell: (row: Task) => (row.context_id ? (contextMap[row.context_id] ?? row.context_id) : "") },
    {
      header: "Actions",
      cell: (row: Task) => (
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => handleEdit(row)}
          >
            Edit
          </button>
          <ConfirmButton onConfirm={() => deleteTask.mutate(row.id)}>Delete</ConfirmButton>
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
            <h1 className="title">Tasks</h1>
            <p className="meta">
              <Link to="/activity" className="underline">
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
                  placeholder="Task title"
                  aria-label="Title"
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
              <Field label="Priority">
                <Select
                  value={form.priority}
                  onChange={handleSelectChange("priority")}
                  options={PRIORITY_OPTIONS}
                />
              </Field>
              <Field label="Due">
                <Input
                  type="date"
                  value={form.due}
                  onChange={handleChange("due")}
                  aria-label="Due"
                />
              </Field>
              <Field label="Scheduled">
                <Input
                  type="date"
                  value={form.scheduled}
                  onChange={handleChange("scheduled")}
                  aria-label="Scheduled"
                />
              </Field>
              <Field label="Context">
                <Select
                  value={form.context_id}
                  onChange={handleSelectChange("context_id")}
                  options={contexts.map((c) => ({ value: c.id, label: c.name }))}
                  placeholder="— none —"
                />
              </Field>
              <Field label="Project">
                <Select
                  value={form.project_id}
                  onChange={handleSelectChange("project_id")}
                  options={projects.map((p) => ({ value: p.id, label: p.title }))}
                  placeholder="— none —"
                />
              </Field>
              <Field label="Outcome">
                <Input
                  value={form.outcome}
                  onChange={handleChange("outcome")}
                  placeholder="Optional outcome"
                  aria-label="Outcome"
                />
              </Field>
              <div className="col-span-2 flex gap-2">
                <Button type="submit">{editingId ? "Save" : "Add"}</Button>
                {editingId && (
                  <Button type="button" onClick={handleCancel} className="ghost">
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </Card>

          <DataTable rows={tasks} columns={columns} empty="No tasks yet." />
        </div>
      </AppShell>
    </RequireAuth>
  );
}

export const tasksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tasks",
  component: TasksPage,
});
