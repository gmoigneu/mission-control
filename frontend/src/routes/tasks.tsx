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

/** Stable display order for status groups/columns. */
const STATUS_ORDER = STATUS_OPTIONS.map((o) => o.value);
const STATUS_LABELS: Record<string, string> = Object.fromEntries(
  STATUS_OPTIONS.map((o) => [o.value, o.label]),
);

type ViewMode = "list" | "board";
type GroupBy = "status" | "due";

const VIEW_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: "list", label: "List" },
  { value: "board", label: "Board" },
];

const GROUP_OPTIONS = [
  { value: "status", label: "Status" },
  { value: "due", label: "Due" },
];

/** Map a status value to its CSS color token. */
function statusColor(status: string): string {
  switch (status) {
    case "in_progress":
      return "var(--st-progress)";
    case "done":
      return "var(--st-done)";
    case "archived":
      return "var(--st-archived)";
    default:
      return "var(--st-open)";
  }
}

/** Bucket a task's due date into a human group key, ordered. */
const DUE_GROUP_ORDER = ["overdue", "today", "soon", "later", "none"];
const DUE_GROUP_LABELS: Record<string, string> = {
  overdue: "Overdue",
  today: "Due today",
  soon: "Next 7 days",
  later: "Later",
  none: "No due date",
};

function dueGroup(due: string | null, today: string): string {
  if (!due) return "none";
  if (due < today) return "overdue";
  if (due === today) return "today";
  // within 7 days (string compare works for ISO YYYY-MM-DD when same length)
  const todayDate = new Date(`${today}T00:00:00`);
  const dueDate = new Date(`${due}T00:00:00`);
  const days = Math.round((dueDate.getTime() - todayDate.getTime()) / 86_400_000);
  if (days <= 7) return "soon";
  return "later";
}

interface Group {
  key: string;
  label: string;
  color?: string;
  tasks: Task[];
}

/** Group tasks by status or by due bucket, preserving a stable order. */
function groupTasks(tasks: Task[], groupBy: GroupBy, today: string): Group[] {
  if (groupBy === "status") {
    return STATUS_ORDER.map((status) => ({
      key: status,
      label: STATUS_LABELS[status] ?? status,
      color: statusColor(status),
      tasks: tasks.filter((t) => t.status === status),
    }));
  }
  return DUE_GROUP_ORDER.map((bucket) => ({
    key: bucket,
    label: DUE_GROUP_LABELS[bucket],
    tasks: tasks.filter((t) => dueGroup(t.due, today) === bucket),
  }));
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
  const [view, setView] = useState<ViewMode>("list");
  const [groupBy, setGroupBy] = useState<GroupBy>("status");
  const [contextFilter, setContextFilter] = useState<string>("");

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

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

  /** Inline status change — reuses the shared update hook. */
  function handleStatusChange(row: Task, status: string) {
    if (status === row.status) return;
    updateTask.mutate({ id: row.id, data: { status } });
  }

  const contextMap = Object.fromEntries(contexts.map((c) => [c.id, c.name]));

  const visibleTasks = useMemo(
    () => (contextFilter ? tasks.filter((t) => t.context_id === contextFilter) : tasks),
    [tasks, contextFilter],
  );

  const groups = useMemo(
    () => groupTasks(visibleTasks, groupBy, today),
    [visibleTasks, groupBy, today],
  );

  const columns = [
    { header: "Title", cell: (row: Task) => row.title },
    {
      header: "Status",
      cell: (row: Task) => (
        <Select
          value={row.status}
          onChange={(value) => handleStatusChange(row, value)}
          options={STATUS_OPTIONS}
        />
      ),
    },
    { header: "Priority", cell: (row: Task) => row.priority },
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
            <div role="group" aria-label="View" className="flex gap-2">
              {VIEW_OPTIONS.map((o) => (
                <Button
                  key={o.value}
                  type="button"
                  aria-pressed={view === o.value}
                  className={view === o.value ? "primary" : "ghost"}
                  onClick={() => setView(o.value)}
                >
                  {o.label}
                </Button>
              ))}
            </div>
            {view === "list" && (
              <Field label="Group by">
                <Select
                  value={groupBy}
                  onChange={(value) => setGroupBy(value as GroupBy)}
                  options={GROUP_OPTIONS}
                />
              </Field>
            )}
            <Field label="Context filter">
              <Select
                value={contextFilter}
                onChange={setContextFilter}
                options={contexts.map((c) => ({ value: c.id, label: c.name }))}
                placeholder="All contexts"
              />
            </Field>
          </div>

          {view === "list" ? (
            <ListView
              groups={groups}
              columns={columns}
              empty={contextFilter ? "No tasks in this context." : "No tasks yet."}
            />
          ) : (
            <BoardView
              tasks={visibleTasks}
              contextMap={contextMap}
              onStatusChange={handleStatusChange}
              onEdit={handleEdit}
            />
          )}
        </div>
      </AppShell>
    </RequireAuth>
  );
}

function ListView({
  groups,
  columns,
  empty,
}: {
  groups: Group[];
  columns: { header: string; cell: (row: Task) => React.ReactNode }[];
  empty: string;
}) {
  const nonEmpty = groups.filter((g) => g.tasks.length > 0);
  if (nonEmpty.length === 0) {
    return (
      <p style={{ padding: "16px", fontSize: "13px", color: "var(--fg-dim)" }}>{empty}</p>
    );
  }
  return (
    <div className="space-y-6">
      {nonEmpty.map((group) => (
        <section key={group.key} aria-label={group.label}>
          <div className="flex items-center gap-2" style={{ marginBottom: "8px" }}>
            {group.color && (
              <span
                aria-hidden
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "999px",
                  background: group.color,
                }}
              />
            )}
            <h2 className="label" style={{ fontWeight: 600 }}>
              {group.label}
            </h2>
            <span className="label" style={{ color: "var(--fg-faint)" }}>
              {group.tasks.length}
            </span>
          </div>
          <DataTable rows={group.tasks} columns={columns} empty={empty} />
        </section>
      ))}
    </div>
  );
}

function BoardView({
  tasks,
  contextMap,
  onStatusChange,
  onEdit,
}: {
  tasks: Task[];
  contextMap: Record<string, string>;
  onStatusChange: (row: Task, status: string) => void;
  onEdit: (row: Task) => void;
}) {
  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: `repeat(${STATUS_ORDER.length}, minmax(220px, 1fr))`,
        gap: "16px",
        alignItems: "start",
        overflowX: "auto",
      }}
    >
      {STATUS_ORDER.map((status) => {
        const columnTasks = tasks.filter((t) => t.status === status);
        return (
          <section
            key={status}
            aria-label={STATUS_LABELS[status] ?? status}
            className="card"
            style={{ padding: "12px" }}
          >
            <div className="flex items-center gap-2" style={{ marginBottom: "10px" }}>
              <span
                aria-hidden
                style={{
                  width: "8px",
                  height: "8px",
                  borderRadius: "999px",
                  background: statusColor(status),
                }}
              />
              <h2 className="label" style={{ fontWeight: 600 }}>
                {STATUS_LABELS[status] ?? status}
              </h2>
              <span className="label" style={{ color: "var(--fg-faint)" }}>
                {columnTasks.length}
              </span>
            </div>
            <div className="space-y-2">
              {columnTasks.length === 0 ? (
                <p style={{ fontSize: "12px", color: "var(--fg-faint)" }}>No tasks</p>
              ) : (
                columnTasks.map((task) => (
                  <BoardCard
                    key={task.id}
                    task={task}
                    contextMap={contextMap}
                    onStatusChange={onStatusChange}
                    onEdit={onEdit}
                  />
                ))
              )}
            </div>
          </section>
        );
      })}
    </div>
  );
}

function BoardCard({
  task,
  contextMap,
  onStatusChange,
  onEdit,
}: {
  task: Task;
  contextMap: Record<string, string>;
  onStatusChange: (row: Task, status: string) => void;
  onEdit: (row: Task) => void;
}) {
  const contextName = task.context_id
    ? (contextMap[task.context_id] ?? task.context_id)
    : null;
  return (
    <article
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--line-soft)",
        borderRadius: "var(--r-sm)",
        padding: "10px",
      }}
    >
      <div style={{ fontSize: "13px", fontWeight: 500, marginBottom: "6px" }}>
        {task.title}
      </div>
      <div className="flex flex-wrap items-center gap-2" style={{ fontSize: "11px" }}>
        <span style={{ color: "var(--fg-dim)" }}>{task.priority}</span>
        {task.due && <span style={{ color: "var(--fg-dim)" }}>· {task.due}</span>}
        {contextName && <span style={{ color: "var(--fg-dim)" }}>· {contextName}</span>}
      </div>
      <div className="flex items-center gap-2" style={{ marginTop: "8px" }}>
        <Select
          value={task.status}
          onChange={(value) => onStatusChange(task, value)}
          options={STATUS_OPTIONS}
        />
        <button
          type="button"
          className="text-xs text-gray-500 hover:text-gray-900"
          onClick={() => onEdit(task)}
        >
          Edit
        </button>
      </div>
    </article>
  );
}

export const tasksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/tasks",
  component: TasksPage,
});
