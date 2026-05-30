import { createRoute, Link } from "@tanstack/react-router";
import { useMemo, useState } from "react";
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

// Order and labels for the board columns / status groups.
const BOARD_STATUSES = ["open", "in_progress", "done", "archived"];

function statusLabel(status: string): string {
  return STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

type ViewMode = "table" | "list" | "board";
type GroupMode = "status" | "due";

const VIEW_OPTIONS = [
  { value: "table", label: "Table" },
  { value: "list", label: "List" },
  { value: "board", label: "Board" },
];

const GROUP_OPTIONS = [
  { value: "status", label: "Status" },
  { value: "due", label: "Due Date" },
];

// Due-date buckets, in display order.
const DUE_BUCKETS = [
  "Overdue",
  "Today",
  "This Week",
  "Later",
  "No Due Date",
] as const;
type DueBucket = (typeof DUE_BUCKETS)[number];

const DUE_FILTER_OPTIONS = DUE_BUCKETS.map((b) => ({ value: b, label: b }));

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function dueBucket(due: string | null, now: Date): DueBucket {
  if (!due) return "No Due Date";
  const target = startOfDay(new Date(due));
  if (Number.isNaN(target.getTime())) return "No Due Date";
  const today = startOfDay(now);
  const diffDays = Math.round(
    (target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
  );
  if (diffDays < 0) return "Overdue";
  if (diffDays === 0) return "Today";
  if (diffDays <= 7) return "This Week";
  return "Later";
}

export function TasksPage() {
  const { data: tasks = [] } = useTasks();
  const { data: contexts = [] } = useContexts();
  const { data: projects = [] } = useProjects();
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);

  const [view, setView] = useState<ViewMode>("table");
  const [groupBy, setGroupBy] = useState<GroupMode>("status");
  const [dueFilter, setDueFilter] = useState<string>("");
  const [contextFilter, setContextFilter] = useState<string>("");
  const [projectFilter, setProjectFilter] = useState<string>("");

  const now = useMemo(() => new Date(), []);

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

  // Inline edits from the list/board views reuse the same update mutation,
  // so audit/undo continues to work.
  function handleInlineStatus(row: Task, status: string) {
    updateTask.mutate({ id: row.id, data: { status } });
  }

  function handleInlinePriority(row: Task, priority: string) {
    updateTask.mutate({ id: row.id, data: { priority } });
  }

  const contextMap = Object.fromEntries(contexts.map((c) => [c.id, c.name]));
  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.title]));

  const filteredTasks = useMemo(() => {
    return tasks.filter((t) => {
      if (dueFilter && dueBucket(t.due, now) !== dueFilter) return false;
      if (contextFilter && (t.context_id ?? "") !== contextFilter) return false;
      if (projectFilter && (t.project_id ?? "") !== projectFilter) return false;
      return true;
    });
  }, [tasks, dueFilter, contextFilter, projectFilter, now]);

  const columns = [
    { header: "Title", cell: (row: Task) => row.title },
    {
      header: "Status",
      cell: (row: Task) => (
        <Select
          value={row.status}
          onChange={(value) => handleInlineStatus(row, value)}
          options={STATUS_OPTIONS}
        />
      ),
    },
    {
      header: "Priority",
      cell: (row: Task) => (
        <Select
          value={row.priority}
          onChange={(value) => handleInlinePriority(row, value)}
          options={PRIORITY_OPTIONS}
        />
      ),
    },
    { header: "Due", cell: (row: Task) => row.due ?? "" },
    { header: "Context", cell: (row: Task) => (row.context_id ? (contextMap[row.context_id] ?? row.context_id) : "") },
    {
      header: "Actions",
      cell: (row: Task) => (
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="text-xs text-gray-500 hover:text-gray-900"
            onClick={() => handleEdit(row)}
          >
            Edit
          </button>
          <ConfirmButton onConfirm={() => deleteTask.mutate(row.id)}>Delete</ConfirmButton>
        </div>
      ),
    },
  ];

  const groups: { key: string; label: string; items: Task[] }[] =
    groupBy === "due"
      ? DUE_BUCKETS.map((bucket) => ({
          key: bucket,
          label: bucket,
          items: filteredTasks.filter((t) => dueBucket(t.due, now) === bucket),
        })).filter((g) => g.items.length > 0)
      : BOARD_STATUSES.map((status) => ({
          key: status,
          label: statusLabel(status),
          items: filteredTasks.filter((t) => t.status === status),
        })).filter((g) => g.items.length > 0);

  return (
    <RequireAuth>
      <AppShell>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">Tasks</h1>
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
                  <Button type="button" onClick={handleCancel} className="bg-gray-400 hover:bg-gray-500">
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </Card>

          <div className="flex flex-wrap items-end gap-4">
            <Field label="View">
              <Select
                value={view}
                onChange={(value) => setView(value as ViewMode)}
                options={VIEW_OPTIONS}
              />
            </Field>
            {view === "list" && (
              <Field label="Group by">
                <Select
                  value={groupBy}
                  onChange={(value) => setGroupBy(value as GroupMode)}
                  options={GROUP_OPTIONS}
                />
              </Field>
            )}
            <Field label="Filter due">
              <Select
                value={dueFilter}
                onChange={setDueFilter}
                options={DUE_FILTER_OPTIONS}
                placeholder="All"
              />
            </Field>
            <Field label="Filter context">
              <Select
                value={contextFilter}
                onChange={setContextFilter}
                options={contexts.map((c) => ({ value: c.id, label: c.name }))}
                placeholder="All"
              />
            </Field>
            <Field label="Filter project">
              <Select
                value={projectFilter}
                onChange={setProjectFilter}
                options={projects.map((p) => ({ value: p.id, label: p.title }))}
                placeholder="All"
              />
            </Field>
          </div>

          {view === "table" && (
            <DataTable rows={filteredTasks} columns={columns} empty="No tasks yet." />
          )}

          {view === "list" && (
            <div className="space-y-6">
              {groups.length === 0 ? (
                <p className="text-sm text-gray-400">No tasks yet.</p>
              ) : (
                groups.map((group) => (
                  <section key={group.key} className="space-y-2">
                    <h2 className="text-sm font-semibold text-gray-600">
                      {group.label} ({group.items.length})
                    </h2>
                    <div className="space-y-2">
                      {group.items.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          contextLabel={
                            task.context_id
                              ? (contextMap[task.context_id] ?? task.context_id)
                              : ""
                          }
                          projectLabel={
                            task.project_id
                              ? (projectMap[task.project_id] ?? task.project_id)
                              : ""
                          }
                          onEdit={handleEdit}
                          onStatusChange={handleInlineStatus}
                          onPriorityChange={handleInlinePriority}
                        />
                      ))}
                    </div>
                  </section>
                ))
              )}
            </div>
          )}

          {view === "board" && (
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
              {BOARD_STATUSES.map((status) => {
                const items = filteredTasks.filter((t) => t.status === status);
                return (
                  <div key={status} className="space-y-2 rounded-md bg-gray-50 p-3">
                    <h2 className="text-sm font-semibold text-gray-600">
                      {statusLabel(status)} ({items.length})
                    </h2>
                    <div className="space-y-2">
                      {items.map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          contextLabel={
                            task.context_id
                              ? (contextMap[task.context_id] ?? task.context_id)
                              : ""
                          }
                          projectLabel={
                            task.project_id
                              ? (projectMap[task.project_id] ?? task.project_id)
                              : ""
                          }
                          onEdit={handleEdit}
                          onStatusChange={handleInlineStatus}
                          onPriorityChange={handleInlinePriority}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </AppShell>
    </RequireAuth>
  );
}

function TaskCard({
  task,
  contextLabel,
  projectLabel,
  onEdit,
  onStatusChange,
  onPriorityChange,
}: {
  task: Task;
  contextLabel: string;
  projectLabel: string;
  onEdit: (task: Task) => void;
  onStatusChange: (task: Task, status: string) => void;
  onPriorityChange: (task: Task, priority: string) => void;
}) {
  return (
    <div className="space-y-2 rounded-md border border-gray-200 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between gap-2">
        <span className="font-medium">{task.title}</span>
        <button
          type="button"
          className="text-xs text-gray-500 hover:text-gray-900"
          onClick={() => onEdit(task)}
        >
          Edit
        </button>
      </div>
      {(contextLabel || projectLabel || task.due) && (
        <div className="flex flex-wrap gap-x-3 text-xs text-gray-400">
          {task.due && <span>Due {task.due}</span>}
          {contextLabel && <span>{contextLabel}</span>}
          {projectLabel && <span>{projectLabel}</span>}
        </div>
      )}
      <div className="flex items-center gap-2">
        <Select
          value={task.status}
          onChange={(value) => onStatusChange(task, value)}
          options={STATUS_OPTIONS}
        />
        <Select
          value={task.priority}
          onChange={(value) => onPriorityChange(task, value)}
          options={PRIORITY_OPTIONS}
        />
      </div>
    </div>
  );
}

export const tasksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tasks",
  component: TasksPage,
});
