import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { Ban, Plus, Save, SlidersHorizontal } from "lucide-react";
import { useMemo, useReducer } from "react";
import { AppShell } from "../components/AppShell";
import { BottomSheet } from "../components/BottomSheet";
import { useIsMobile } from "../lib/useIsMobile";
import {
  PriorityIcon,
  StatusBadgeMenu,
} from "../components/console";
import { STATUS, contextTint } from "../components/console-data";
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
import {
  useCreateTask,
  useDeleteTask,
  useDisableTaskRecurrence,
  useTasks,
  useUpdateTask,
  useUpdateTaskRecurrence,
} from "../features/tasks/api";
import type { Context, Project, Task, TaskRecurrenceFrequency } from "../lib/types";
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
  repeat: boolean;
  recurrence_start_date: string;
  recurrence_frequency: string;
  recurrence_weekday: string;
  recurrence_month_day: string;
}

function todayIso() {
  return new Date().toISOString().slice(0, 10);
}

function weekdayFromIso(value: string) {
  return String((new Date(`${value}T00:00:00`).getDay() + 6) % 7);
}

function monthDayFromIso(value: string) {
  return String(new Date(`${value}T00:00:00`).getDate());
}

function emptyForm(): FormState {
  const today = todayIso();
  return {
    title: "",
    status: "open",
    priority: "normal",
    due: "",
    scheduled: "",
    context_id: "",
    project_id: "",
    outcome: "",
    body: "",
    repeat: false,
    recurrence_start_date: today,
    recurrence_frequency: "daily",
    recurrence_weekday: weekdayFromIso(today),
    recurrence_month_day: monthDayFromIso(today),
  };
}

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
    ...(!isEdit && form.repeat ? { recurrence: buildRecurrenceRule(form) } : {}),
  };
}

function buildRecurrenceRule(form: FormState) {
  const frequency = form.recurrence_frequency as TaskRecurrenceFrequency;
  return {
    frequency,
    start_date: form.recurrence_start_date || todayIso(),
    ...(frequency === "weekly"
      ? { weekday: Number(form.recurrence_weekday) }
      : {}),
    ...(frequency === "monthly"
      ? { month_day: Number(form.recurrence_month_day) }
      : {}),
  };
}

function buildRecurrenceUpdatePayload(form: FormState) {
  return {
    title: form.title,
    priority: form.priority,
    context_id: form.context_id || null,
    project_id: form.project_id || null,
    outcome: form.outcome || null,
    body: form.body || null,
    active: form.repeat,
    ...buildRecurrenceRule(form),
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

const FREQUENCY_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
  { value: "monthly", label: "Monthly" },
];

const WEEKDAY_OPTIONS = [
  { value: "0", label: "Monday" },
  { value: "1", label: "Tuesday" },
  { value: "2", label: "Wednesday" },
  { value: "3", label: "Thursday" },
  { value: "4", label: "Friday" },
  { value: "5", label: "Saturday" },
  { value: "6", label: "Sunday" },
];

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

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

interface TasksState {
  form: FormState;
  editingId: string | null;
  panelOpen: boolean;
  descTab: DescTab;
  view: ViewMode;
  groupBy: GroupBy;
  contextFilter: string;
  projectFilter: string;
  showCompleted: boolean;
  filtersOpen: boolean;
}

type TasksAction =
  | { type: "openNew" }
  | { type: "editTask"; task: Task }
  | { type: "closePanel" }
  | { type: "updateForm"; key: keyof FormState; value: FormState[keyof FormState] }
  | { type: "setDescTab"; tab: DescTab }
  | { type: "setView"; view: ViewMode }
  | { type: "setGroupBy"; groupBy: GroupBy }
  | { type: "setContextFilter"; contextId: string }
  | { type: "setProjectFilter"; projectId: string }
  | { type: "toggleCompleted" }
  | { type: "setFiltersOpen"; open: boolean };

function initialTasksState(): TasksState {
  return {
    form: emptyForm(),
    editingId: null,
    panelOpen: false,
    descTab: "write",
    view: "list",
    groupBy: "status",
    contextFilter: "",
    projectFilter: "",
    showCompleted: false,
    filtersOpen: false,
  };
}

function formFromTask(task: Task): FormState {
  const recurrence = task.recurrence;
  const fallbackDate = recurrence?.start_date ?? task.scheduled ?? todayIso();
  return {
    title: task.title,
    status: task.status,
    priority: task.priority,
    due: task.due ?? "",
    scheduled: task.scheduled ?? "",
    context_id: task.context_id ?? "",
    project_id: task.project_id ?? "",
    outcome: task.outcome ?? "",
    body: task.body ?? "",
    repeat: recurrence?.active ?? false,
    recurrence_start_date: fallbackDate,
    recurrence_frequency: recurrence?.frequency ?? "daily",
    recurrence_weekday:
      recurrence?.weekday != null ? String(recurrence.weekday) : weekdayFromIso(fallbackDate),
    recurrence_month_day:
      recurrence?.month_day != null ? String(recurrence.month_day) : monthDayFromIso(fallbackDate),
  };
}

function tasksReducer(state: TasksState, action: TasksAction): TasksState {
  switch (action.type) {
    case "openNew":
      return {
        ...state,
        form: emptyForm(),
        editingId: null,
        descTab: "write",
        panelOpen: true,
      };
    case "editTask":
      return {
        ...state,
        editingId: action.task.id,
        form: formFromTask(action.task),
        descTab: "write",
        panelOpen: true,
      };
    case "closePanel":
      return {
        ...state,
        form: emptyForm(),
        editingId: null,
        descTab: "write",
        panelOpen: false,
      };
    case "updateForm":
      return { ...state, form: { ...state.form, [action.key]: action.value } };
    case "setDescTab":
      return { ...state, descTab: action.tab };
    case "setView":
      return { ...state, view: action.view };
    case "setGroupBy":
      return { ...state, groupBy: action.groupBy };
    case "setContextFilter":
      return { ...state, contextFilter: action.contextId };
    case "setProjectFilter":
      return { ...state, projectFilter: action.projectId };
    case "toggleCompleted":
      return { ...state, showCompleted: !state.showCompleted };
    case "setFiltersOpen":
      return { ...state, filtersOpen: action.open };
  }
}

function recurrenceSummary(task: Task) {
  const recurrence = task.recurrence;
  if (!recurrence) return "";
  const suffix = recurrence.active ? "" : " paused";
  if (recurrence.frequency === "daily") return `Daily${suffix}`;
  if (recurrence.frequency === "weekly") {
    return `Weekly ${WEEKDAY_SHORT[recurrence.weekday ?? 0]}${suffix}`;
  }
  return `Monthly day ${recurrence.month_day ?? 1}${suffix}`;
}

/** Shared width so every toolbar filter select is the same size. */
const FILTER_WIDTH: React.CSSProperties = { width: 180 };

interface TaskFiltersProps {
  full: boolean;
  view: ViewMode;
  groupBy: GroupBy;
  onGroupByChange: (value: GroupBy) => void;
  contextFilter: string;
  onContextFilterChange: (value: string) => void;
  contexts: Context[];
  projectFilter: string;
  onProjectFilterChange: (value: string) => void;
  projects: Project[];
  showCompleted: boolean;
  onToggleCompleted: () => void;
}

function TaskFilters({
  full,
  view,
  groupBy,
  onGroupByChange,
  contextFilter,
  onContextFilterChange,
  contexts,
  projectFilter,
  onProjectFilterChange,
  projects,
  showCompleted,
  onToggleCompleted,
}: TaskFiltersProps) {
  const w: React.CSSProperties = full ? { width: "100%" } : FILTER_WIDTH;
  return (
    <>
      {view === "list" && (
        <Field label="Group by">
          <div style={w}>
            <Select
              value={groupBy}
              onChange={(value) => onGroupByChange(value as GroupBy)}
              options={GROUP_OPTIONS}
            />
          </div>
        </Field>
      )}
      <Field label="Context filter">
        <div style={w}>
          <Select
            value={contextFilter}
            onChange={onContextFilterChange}
            options={contexts.map((c) => ({ value: c.id, label: c.name }))}
            placeholder="All contexts"
          />
        </div>
      </Field>
      <Field label="Project filter">
        <div style={w}>
          <Select
            value={projectFilter}
            onChange={onProjectFilterChange}
            options={projects.map((p) => ({ value: p.id, label: p.title }))}
            placeholder="All projects"
          />
        </div>
      </Field>
      <Button
        type="button"
        aria-pressed={showCompleted}
        className={showCompleted ? "primary" : "ghost"}
        onClick={onToggleCompleted}
      >
        Show completed
      </Button>
    </>
  );
}

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
  const editRequest = useEditFromSearch(tasks);
  const { data: contexts = [] } = useContexts();
  const { data: projects = [] } = useProjects();
  const location = useLocation();
  const navigate = useNavigate();
  const routeSearch = tasksSearch(location.search as Record<string, unknown>);
  const createTask = useCreateTask();
  const updateTask = useUpdateTask();
  const deleteTask = useDeleteTask();
  const updateTaskRecurrence = useUpdateTaskRecurrence();
  const disableTaskRecurrence = useDisableTaskRecurrence();

  const [state, dispatch] = useReducer(tasksReducer, undefined, initialTasksState);
  const {
    form,
    editingId,
    panelOpen,
    descTab,
    view,
    groupBy,
    filtersOpen,
  } = state;
  const contextFilter = routeSearch.context ?? "";
  const projectFilter = routeSearch.project ?? "";
  const showCompleted = routeSearch.completed ?? false;
  useHotkey("c", handleNew, !panelOpen);
  const isMobile = useIsMobile();
  const activeFilterCount =
    (contextFilter ? 1 : 0) + (projectFilter ? 1 : 0) + (showCompleted ? 1 : 0);

  const today = useMemo(() => new Date().toISOString().slice(0, 10), []);

  function updateForm(key: keyof FormState, value: FormState[keyof FormState]) {
    dispatch({ type: "updateForm", key, value });
  }

  function handleNew() {
    dispatch({ type: "openNew" });
  }

  function handleEdit(row: Task) {
    dispatch({ type: "editTask", task: row });
  }

  function handleClose() {
    dispatch({ type: "closePanel" });
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

  const editingTask = editingId ? (tasks.find((task) => task.id === editingId) ?? null) : null;

  function handleUpdateRecurrence() {
    if (!editingTask?.recurrence_id) return;
    updateTaskRecurrence.mutate({
      id: editingTask.recurrence_id,
      data: buildRecurrenceUpdatePayload(form),
    });
  }

  function handleDisableRecurrence() {
    if (!editingTask?.recurrence_id) return;
    disableTaskRecurrence.mutate(editingTask.recurrence_id, {
      onSuccess: () => updateForm("repeat", false),
    });
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
  if (editRequest) handleEdit(editRequest);

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
    { header: "Repeat", cell: (row: Task) => recurrenceSummary(row) },
    { header: "Due", cell: (row: Task) => row.due ?? "" },
  ];

  const filterProps = {
    view,
    groupBy,
    onGroupByChange: (nextGroupBy: GroupBy) =>
      dispatch({ type: "setGroupBy", groupBy: nextGroupBy }),
    contextFilter,
    onContextFilterChange: (contextId: string) =>
      updateTaskFilters({ context: contextId || undefined }),
    contexts,
    projectFilter,
    onProjectFilterChange: (projectId: string) =>
      updateTaskFilters({ project: projectId || undefined }),
    projects,
    showCompleted,
    onToggleCompleted: () =>
      updateTaskFilters({ completed: showCompleted ? undefined : true }),
  };

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
            <fieldset aria-label="View" className="control-group flex gap-2">
              {VIEW_OPTIONS.map((o) => (
                <Button
                  key={o.value}
                  type="button"
                  aria-pressed={view === o.value}
                  className={view === o.value ? "primary" : "ghost"}
                  onClick={() => dispatch({ type: "setView", view: o.value })}
                >
                  {o.label}
                </Button>
              ))}
            </fieldset>
            {isMobile ? (
              <Button
                type="button"
                className="ghost row gap-2"
                onClick={() => dispatch({ type: "setFiltersOpen", open: true })}
              >
                <SlidersHorizontal size={15} /> Filters
                {activeFilterCount > 0 ? ` (${activeFilterCount})` : ""}
              </Button>
            ) : (
              <TaskFilters {...filterProps} full={false} />
            )}
          </div>

          {isMobile && (
            <BottomSheet
              open={filtersOpen}
              onClose={() => dispatch({ type: "setFiltersOpen", open: false })}
              title="Filters"
            >
              <TaskFilters {...filterProps} full />
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

        <TaskEditorPanel
          open={panelOpen}
          editing={Boolean(editingId)}
          task={editingTask}
          form={form}
          descTab={descTab}
          contexts={contexts}
          projects={projects}
          onClose={handleClose}
          onSubmit={handleSubmit}
          onDelete={handleDelete}
          onUpdateRecurrence={handleUpdateRecurrence}
          onDisableRecurrence={handleDisableRecurrence}
          onFormChange={updateForm}
          onDescTabChange={(tab) => dispatch({ type: "setDescTab", tab })}
        />
      </AppShell>
    </RequireAuth>
  );
}

function TaskEditorPanel({
  open,
  editing,
  task,
  form,
  descTab,
  contexts,
  projects,
  onClose,
  onSubmit,
  onDelete,
  onUpdateRecurrence,
  onDisableRecurrence,
  onFormChange,
  onDescTabChange,
}: {
  open: boolean;
  editing: boolean;
  task: Task | null;
  form: FormState;
  descTab: DescTab;
  contexts: Context[];
  projects: Project[];
  onClose: () => void;
  onSubmit: (e: React.FormEvent) => void;
  onDelete: () => void;
  onUpdateRecurrence: () => void;
  onDisableRecurrence: () => void;
  onFormChange: (key: keyof FormState, value: FormState[keyof FormState]) => void;
  onDescTabChange: (tab: DescTab) => void;
}) {
  function handleChange(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      onFormChange(key, e.target.value);
  }

  function handleSelectChange(key: keyof FormState) {
    return (value: string) => onFormChange(key, value);
  }

  const repeatControlsVisible = form.repeat || Boolean(task?.recurrence_id);
  const repeatSummary = task ? recurrenceSummary(task) : "";

  return (
    <SidePanel
      open={open}
      onClose={onClose}
      title={editing ? "Edit task" : "New task"}
    >
      <form onSubmit={onSubmit} className="grid grid-cols-1 gap-4">
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
        {(!editing || task?.recurrence_id) && (
          <div className="grid grid-cols-1 gap-3">
            <label className="row gap-2" style={{ alignItems: "center" }}>
              <input
                type="checkbox"
                checked={form.repeat}
                onChange={(event) => onFormChange("repeat", event.target.checked)}
              />
              <span className="label">Repeat</span>
            </label>
            {repeatSummary && (
              <span className="chip" style={{ width: "fit-content" }}>
                {repeatSummary}
              </span>
            )}
            {repeatControlsVisible && (
              <div className="grid grid-cols-1 gap-3">
                <Field label="Start date">
                  <Input
                    type="date"
                    value={form.recurrence_start_date}
                    onChange={handleChange("recurrence_start_date")}
                    aria-label="Start date"
                  />
                </Field>
                <Field label="Frequency">
                  <Select
                    value={form.recurrence_frequency}
                    onChange={handleSelectChange("recurrence_frequency")}
                    options={FREQUENCY_OPTIONS}
                  />
                </Field>
                {form.recurrence_frequency === "weekly" && (
                  <Field label="Weekday">
                    <Select
                      value={form.recurrence_weekday}
                      onChange={handleSelectChange("recurrence_weekday")}
                      options={WEEKDAY_OPTIONS}
                    />
                  </Field>
                )}
                {form.recurrence_frequency === "monthly" && (
                  <Field label="Day of month">
                    <Input
                      type="number"
                      min={1}
                      max={31}
                      value={form.recurrence_month_day}
                      onChange={handleChange("recurrence_month_day")}
                      aria-label="Day of month"
                    />
                  </Field>
                )}
              </div>
            )}
          </div>
        )}
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
            <fieldset
              aria-label="Description editor mode"
              className="control-group flex gap-2"
            >
              <Button
                type="button"
                aria-pressed={descTab === "write"}
                className={descTab === "write" ? "primary sm" : "ghost sm"}
                onClick={() => onDescTabChange("write")}
              >
                Write
              </Button>
              <Button
                type="button"
                aria-pressed={descTab === "preview"}
                className={descTab === "preview" ? "primary sm" : "ghost sm"}
                onClick={() => onDescTabChange("preview")}
              >
                Preview
              </Button>
            </fieldset>
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
          <Button type="submit">{editing ? "Save" : "Add"}</Button>
          <Button type="button" onClick={onClose} className="ghost">
            Cancel
          </Button>
        </div>
        {editing && (
          <>
            <hr className="hr" />
            <div className="flex flex-wrap justify-between gap-2">
              {task?.recurrence_id && (
                <div className="flex flex-wrap gap-2">
                  <Button
                    type="button"
                    className="ghost row gap-2"
                    onClick={onUpdateRecurrence}
                  >
                    <Save size={14} /> Save future repeat
                  </Button>
                  <Button
                    type="button"
                    className="ghost row gap-2"
                    onClick={onDisableRecurrence}
                  >
                    <Ban size={14} /> Disable repeat
                  </Button>
                </div>
              )}
              <ConfirmButton onConfirm={onDelete}>Delete task</ConfirmButton>
            </div>
          </>
        )}
      </form>
    </SidePanel>
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
  const repeat = recurrenceSummary(task);

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
      {(contextName || projectName || task.due || repeat) && (
        <div className="row wrap gap-2" style={{ marginTop: 10 }}>
          {contextName && <span className="chip">{contextName}</span>}
          {projectName && <span className="chip">{projectName}</span>}
          {task.due && <span className="chip">Due {task.due}</span>}
          {repeat && <span className="chip">{repeat}</span>}
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
  const repeat = recurrenceSummary(task);
  return (
    <article
      style={{
        background: "var(--surface-2)",
        border: "1px solid var(--line-soft)",
        borderRadius: "var(--r-sm)",
        padding: "10px",
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
        style={{ fontSize: "12px", marginTop: "6px" }}
      >
        <PriorityIcon priority={task.priority} withLabel />
        {task.due && <span style={{ color: "var(--fg-dim)" }}>· {task.due}</span>}
        {contextName && <span style={{ color: "var(--fg-dim)" }}>· {contextName}</span>}
        {repeat && <span style={{ color: "var(--fg-dim)" }}>· {repeat}</span>}
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
