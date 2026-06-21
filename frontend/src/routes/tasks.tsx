import { createRoute, Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Plus, SlidersHorizontal } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell } from "../components/AppShell";
import { BottomSheet } from "../components/BottomSheet";
import { useIsMobile } from "../lib/useIsMobile";
import {
  PriorityIcon,
  STATUS,
  StatusBadgeMenu,
  contextTint,
} from "../components/console";
import { ConfirmButton } from "../components/ConfirmButton";
import { DataTable } from "../components/DataTable";
import { Markdown } from "../components/Markdown";
import { RequireAuth } from "../components/RequireAuth";
import { SidePanel } from "../components/SidePanel";
import { useEditFromSearch } from "../lib/useEditFromSearch";
import { useHotkey } from "../lib/useHotkey";
import { Button, Field, Input, Select, Textarea } from "../components/ui";
import { useContexts } from "../features/contexts/api";
import { useProjects } from "../features/projects/api";
import { useCreateTask, useDeleteTask, useTasks, useUpdateTask } from "../features/tasks/api";
import type { Context, Task } from "../lib/types";
import { rootRoute } from "./root";
import { tasksSearch, type TasksSearch } from "./tasks-search";

interface FormState {
  title: string;
  status: string;
  priority: string;
  due: string;
  scheduled: string;
  context_id: string;
  project_id: string;
  outcome: string;
  body: string;
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
  body: "",
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
    ...(form.body ? { body: form.body } : { body: null }),
  };
}

/** Status values whose tasks are hidden until "Show completed" is enabled. */
const COMPLETED_STATUSES = new Set(["done", "archived"]);

/** Stable display order for status groups/columns — in progress first. */
const STATUS_ORDER = ["in_progress", "open", "done", "archived"];
const STATUS_OPTIONS = STATUS_ORDER.map((value) => ({
  value,
  label: STATUS[value]?.label ?? value,
}));

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
];

type ViewMode = "list" | "board";
type GroupBy = "status" | "due";
type DescTab = "write" | "preview";

const VIEW_OPTIONS: { value: ViewMode; label: string }[] = [
  { value: "list", label: "List" },
  { value: "board", label: "Board" },
];

const GROUP_OPTIONS = [
  { value: "status", label: "Status" },
  { value: "due", label: "Due" },
];

/** Selector for descendants that handle their own clicks (so a card/row click
 * doesn't also fire when one of these is the target). */
const INTERACTIVE = "button, a, select, input, textarea, label, [role='menu']";

/** Shared width so every toolbar filter select is the same size. */
const FILTER_WIDTH: React.CSSProperties = { width: 180 };

/** A leading dot tinted by the task's context; muted/hollow when none. */
function ContextDot({ ctx }: { ctx?: Context }) {
  return (
    <span
      aria-hidden
      style={{
        width: 9,
        height: 9,
        borderRadius: 9,
        flexShrink: 0,
        background: ctx ? contextTint(ctx) : "transparent",
        border: ctx ? "none" : "1px solid var(--line-bright)",
      }}
    />
  );
}

/** Plain-text button used for a clickable task title. */
const titleButtonStyle: React.CSSProperties = {
  display: "inline-flex",
  alignItems: "center",
  gap: 8,
  background: "none",
  border: 0,
  padding: 0,
  margin: 0,
  font: "inherit",
  color: "inherit",
  cursor: "pointer",
  textAlign: "left",
};

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
      label: STATUS[status]?.label ?? status,
      color: STATUS[status]?.color,
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
  useEditFromSearch(tasks, handleEdit);
  const { data: contexts = [] } = useContexts();
  const { data: projects = [] } = useProjects();
  const location = useLocation();
  const navigate = useNavigate();
  const routeSearch = tasksSearch(location.search as Record<string, unknown>);
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  useHotkey("c", handleNew, !panelOpen);
  const [descTab, setDescTab] = useState<DescTab>("write");
  const [view, setView] = useState<ViewMode>("list");
  const [groupBy, setGroupBy] = useState<GroupBy>("status");
  const contextFilter = routeSearch.context ?? "";
  const projectFilter = routeSearch.project ?? "";
  const showCompleted = routeSearch.completed ?? false;
  const isMobile = useIsMobile();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const activeFilterCount =
    (contextFilter ? 1 : 0) + (projectFilter ? 1 : 0) + (showCompleted ? 1 : 0);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  function handleChange(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function handleSelectChange(key: keyof FormState) {
    return (value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDescTab("write");
    setPanelOpen(true);
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
      body: row.body ?? "",
    });
    setDescTab("write");
    setPanelOpen(true);
  }

  function handleClose() {
    setPanelOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDescTab("write");
  }

  function updateTaskFilters(
    patch: Partial<Pick<TasksSearch, "context" | "project" | "completed">>,
  ) {
    const next = { ...routeSearch, ...patch };
    navigate({
      to: "/tasks",
      search: {
        edit: next.edit,
        context: next.context || undefined,
        project: next.project || undefined,
        completed: next.completed || undefined,
      },
    } as unknown as Parameters<typeof navigate>[0]);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = buildPayload(form, !!editingId);
    if (editingId) {
      updateTask.mutate(
        { id: editingId, data: payload },
        { onSuccess: handleClose },
      );
    } else {
      createTask.mutate(payload, { onSuccess: handleClose });
    }
  }

  function handleDelete() {
    if (!editingId) return;
    deleteTask.mutate(editingId, { onSuccess: handleClose });
  }

  /** Inline status change — reuses the shared update hook. */
  function handleStatusChange(row: Task, status: string) {
    if (status === row.status) return;
    updateTask.mutate({ id: row.id, data: { status } });
  }

  const contextById = useMemo(
    () => Object.fromEntries(contexts.map((c) => [c.id, c])),
    [contexts],
  );
  const contextMap = useMemo(
    () => Object.fromEntries(contexts.map((c) => [c.id, c.name])),
    [contexts],
  );
  const projectMap = useMemo(
    () => Object.fromEntries(projects.map((p) => [p.id, p.title])),
    [projects],
  );

  const visibleTasks = useMemo(() => {
    let list = tasks;
    if (contextFilter) list = list.filter((t) => t.context_id === contextFilter);
    if (projectFilter) list = list.filter((t) => t.project_id === projectFilter);
    if (!showCompleted) list = list.filter((t) => !COMPLETED_STATUSES.has(t.status));
    return list;
  }, [tasks, contextFilter, projectFilter, showCompleted]);

  const hasFilter = Boolean(contextFilter || projectFilter);

  const groups = useMemo(
    () => groupTasks(visibleTasks, groupBy, today),
    [visibleTasks, groupBy, today],
  );

  const columns = [
    {
      header: "Title",
      cell: (row: Task) => (
        <button
          type="button"
          style={titleButtonStyle}
          onClick={() => handleEdit(row)}
        >
          <ContextDot ctx={row.context_id ? contextById[row.context_id] : undefined} />
          {row.title}
        </button>
      ),
    },
    {
      header: "Status",
      cell: (row: Task) => (
        <StatusBadgeMenu
          status={row.status}
          options={STATUS_OPTIONS}
          onChange={(status) => handleStatusChange(row, status)}
        />
      ),
    },
    { header: "Priority", cell: (row: Task) => <PriorityIcon priority={row.priority} withLabel /> },
    {
      header: "Context",
      cell: (row: Task) => (row.context_id ? (contextMap[row.context_id] ?? "") : ""),
    },
    {
      header: "Project",
      cell: (row: Task) => (row.project_id ? (projectMap[row.project_id] ?? "") : ""),
    },
    { header: "Due", cell: (row: Task) => row.due ?? "" },
  ];

  // Filter controls, shared between the desktop inline row and the mobile sheet.
  // `full` makes each control span its container (for the stacked sheet layout).
  function renderFilters(full: boolean) {
    const w: React.CSSProperties = full ? { width: "100%" } : FILTER_WIDTH;
    return (
      <>
        {view === "list" && (
          <Field label="Group by">
            <div style={w}>
              <Select
                value={groupBy}
                onChange={(value) => setGroupBy(value as GroupBy)}
                options={GROUP_OPTIONS}
              />
            </div>
          </Field>
        )}
        <Field label="Context filter">
          <div style={w}>
            <Select
              value={contextFilter}
              onChange={(value) =>
                updateTaskFilters({ context: value || undefined })
              }
              options={contexts.map((c) => ({ value: c.id, label: c.name }))}
              placeholder="All contexts"
            />
          </div>
        </Field>
        <Field label="Project filter">
          <div style={w}>
            <Select
              value={projectFilter}
              onChange={(value) =>
                updateTaskFilters({ project: value || undefined })
              }
              options={projects.map((p) => ({ value: p.id, label: p.title }))}
              placeholder="All projects"
            />
          </div>
        </Field>
        <Button
          type="button"
          aria-pressed={showCompleted}
          className={showCompleted ? "primary" : "ghost"}
          onClick={() =>
            updateTaskFilters({ completed: showCompleted ? undefined : true })
          }
        >
          Show completed
        </Button>
      </>
    );
  }

  return (
    <RequireAuth>
      <AppShell>
        <div
          className="page"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="title">Tasks</h1>
            <div className="flex items-center gap-4">
              <p className="meta desktop-only">
                <Link to="/activity" className="underline">
                  Manage from the Activity page to undo changes.
                </Link>
              </p>
              <Button type="button" onClick={handleNew} className="row gap-2">
                <Plus size={15} /> Create
              </Button>
            </div>
          </div>

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
            {isMobile ? (
              <Button
                type="button"
                className="ghost row gap-2"
                onClick={() => setFiltersOpen(true)}
              >
                <SlidersHorizontal size={15} /> Filters
                {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
              </Button>
            ) : (
              renderFilters(false)
            )}
          </div>

          {isMobile && (
            <BottomSheet
              open={filtersOpen}
              onClose={() => setFiltersOpen(false)}
              title="Filters"
            >
              {renderFilters(true)}
            </BottomSheet>
          )}

          {view === "list" ? (
            <ListView
              groups={groups}
              columns={columns}
              isMobile={isMobile}
              contextById={contextById}
              contextMap={contextMap}
              projectMap={projectMap}
              onStatusChange={handleStatusChange}
              onRowClick={handleEdit}
              empty={hasFilter ? "No tasks match these filters." : "No tasks yet."}
            />
          ) : (
            <BoardView
              tasks={visibleTasks}
              contextById={contextById}
              contextMap={contextMap}
              onStatusChange={handleStatusChange}
              onEdit={handleEdit}
            />
          )}
        </div>

        <SidePanel
          open={panelOpen}
          onClose={handleClose}
          title={editingId ? "Edit task" : "New task"}
        >
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
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
            <div>
              <div className="flex items-center justify-between" style={{ marginBottom: 6 }}>
                <span className="label">Description</span>
                <div role="group" aria-label="Description editor mode" className="flex gap-2">
                  <Button
                    type="button"
                    aria-pressed={descTab === "write"}
                    className={descTab === "write" ? "primary sm" : "ghost sm"}
                    onClick={() => setDescTab("write")}
                  >
                    Write
                  </Button>
                  <Button
                    type="button"
                    aria-pressed={descTab === "preview"}
                    className={descTab === "preview" ? "primary sm" : "ghost sm"}
                    onClick={() => setDescTab("preview")}
                  >
                    Preview
                  </Button>
                </div>
              </div>
              {descTab === "write" ? (
                <Textarea
                  value={form.body}
                  onChange={handleChange("body")}
                  placeholder="Details — markdown supported"
                  aria-label="Description"
                  rows={8}
                />
              ) : (
                <div
                  data-testid="description-preview"
                  style={{
                    minHeight: 160,
                    padding: "10px 12px",
                    background: "var(--bg-deep)",
                    border: "1px solid var(--line)",
                    borderRadius: "var(--r-sm)",
                  }}
                >
                  <Markdown>{form.body || "_Nothing to preview._"}</Markdown>
                </div>
              )}
            </div>
            <div className="flex gap-2">
              <Button type="submit">{editingId ? "Save" : "Add"}</Button>
              <Button type="button" onClick={handleClose} className="ghost">
                Cancel
              </Button>
            </div>
            {editingId && (
              <>
                <hr className="hr" />
                <div className="flex justify-end">
                  <ConfirmButton onConfirm={handleDelete}>Delete task</ConfirmButton>
                </div>
              </>
            )}
          </form>
        </SidePanel>
      </AppShell>
    </RequireAuth>
  );
}

function ListView({
  groups,
  columns,
  isMobile,
  contextById,
  contextMap,
  projectMap,
  onStatusChange,
  onRowClick,
  empty,
}: {
  groups: Group[];
  columns: { header: string; cell: (row: Task) => React.ReactNode }[];
  isMobile: boolean;
  contextById: Record<string, Context>;
  contextMap: Record<string, string>;
  projectMap: Record<string, string>;
  onStatusChange: (row: Task, status: string) => void;
  onRowClick: (row: Task) => void;
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
          {isMobile ? (
            <div className="space-y-2">
              {group.tasks.map((task) => (
                <MobileTaskCard
                  key={task.id}
                  task={task}
                  contextById={contextById}
                  contextMap={contextMap}
                  projectMap={projectMap}
                  onEdit={onRowClick}
                  onStatusChange={onStatusChange}
                />
              ))}
            </div>
          ) : (
            <DataTable rows={group.tasks} columns={columns} onRowClick={onRowClick} empty={empty} />
          )}
        </section>
      ))}
    </div>
  );
}

function MobileTaskCard({
  task,
  contextById,
  contextMap,
  projectMap,
  onEdit,
  onStatusChange,
}: {
  task: Task;
  contextById: Record<string, Context>;
  contextMap: Record<string, string>;
  projectMap: Record<string, string>;
  onEdit: (row: Task) => void;
  onStatusChange: (row: Task, status: string) => void;
}) {
  const ctx = task.context_id ? contextById[task.context_id] : undefined;
  const contextName = task.context_id ? (contextMap[task.context_id] ?? task.context_id) : null;
  const projectName = task.project_id ? (projectMap[task.project_id] ?? task.project_id) : null;

  return (
    <article
      className="card task-card"
      style={{ padding: 12 }}
    >
      <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
        <button
          type="button"
          style={{ ...titleButtonStyle, fontSize: 14, fontWeight: 600 }}
          onClick={() => onEdit(task)}
        >
          <ContextDot ctx={ctx} />
          {task.title}
        </button>
        <PriorityIcon priority={task.priority} withLabel />
      </div>
      {(contextName || projectName || task.due) && (
        <div className="row wrap gap-2" style={{ marginTop: 10 }}>
          {contextName && <span className="chip">{contextName}</span>}
          {projectName && <span className="chip">{projectName}</span>}
          {task.due && <span className="chip">Due {task.due}</span>}
        </div>
      )}
      <div className="row" style={{ marginTop: 10 }}>
        <StatusBadgeMenu
          status={task.status}
          options={STATUS_OPTIONS}
          onChange={(status) => onStatusChange(task, status)}
        />
      </div>
    </article>
  );
}

function BoardView({
  tasks,
  contextById,
  contextMap,
  onStatusChange,
  onEdit,
}: {
  tasks: Task[];
  contextById: Record<string, Context>;
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
            aria-label={STATUS[status]?.label ?? status}
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
                  background: STATUS[status]?.color,
                }}
              />
              <h2 className="label" style={{ fontWeight: 600 }}>
                {STATUS[status]?.label ?? status}
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
                    contextById={contextById}
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
  contextById,
  contextMap,
  onStatusChange,
  onEdit,
}: {
  task: Task;
  contextById: Record<string, Context>;
  contextMap: Record<string, string>;
  onStatusChange: (row: Task, status: string) => void;
  onEdit: (row: Task) => void;
}) {
  const ctx = task.context_id ? contextById[task.context_id] : undefined;
  const contextName = task.context_id
    ? (contextMap[task.context_id] ?? task.context_id)
    : null;
  return (
    <article
      onClick={(e) => {
        if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
        onEdit(task);
      }}
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--line-soft)",
        borderRadius: "var(--r-sm)",
        padding: "10px",
        cursor: "pointer",
      }}
    >
      <button
        type="button"
        style={{ ...titleButtonStyle, fontSize: "13px", fontWeight: 500 }}
        onClick={() => onEdit(task)}
      >
        <ContextDot ctx={ctx} />
        {task.title}
      </button>
      <div
        className="flex flex-wrap items-center gap-2"
        style={{ fontSize: "11px", marginTop: "6px" }}
      >
        <PriorityIcon priority={task.priority} withLabel />
        {task.due && <span style={{ color: "var(--fg-dim)" }}>· {task.due}</span>}
        {contextName && <span style={{ color: "var(--fg-dim)" }}>· {contextName}</span>}
      </div>
      <div className="row" style={{ marginTop: "8px" }}>
        <StatusBadgeMenu
          status={task.status}
          options={STATUS_OPTIONS}
          onChange={(status) => onStatusChange(task, status)}
        />
      </div>
    </article>
  );
}

export const tasksRoute = createRoute({
  getParentRoute: () => rootRoute,
  validateSearch: tasksSearch,
  path: "/tasks",
  component: TasksPage,
});
