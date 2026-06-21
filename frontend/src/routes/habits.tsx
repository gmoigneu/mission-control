import { createRoute, Link } from "@tanstack/react-router";
import { Check, Edit2, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell } from "../components/AppShell";
import { ConfirmButton } from "../components/ConfirmButton";
import { RequireAuth } from "../components/RequireAuth";
import { SidePanel } from "../components/SidePanel";
import { SlugField } from "../components/SlugField";
import { SectionLabel } from "../components/console";
import { Button, Field, Input, Select } from "../components/ui";
import {
  useCreateHabit,
  useDeleteHabit,
  useHabitLogs,
  useHabits,
  useLogHabit,
  useUpdateHabit,
} from "../features/habits/api";
import { useDailyCheckIns, useSetDailyCheckIn } from "../features/journal/api";
import type { DailyCheckIn, Habit, HabitLog } from "../lib/types";
import { resolvedSlug } from "../lib/slug";
import { editSearch, useEditFromSearch } from "../lib/useEditFromSearch";
import { useHotkey } from "../lib/useHotkey";
import { rootRoute } from "./root";

type BuiltInMetric = "mood" | "energy" | "productivity";
type TrackingType = "boolean" | "score";

interface FormState {
  name: string;
  slug: string;
  cadence: string;
  tracking_type: TrackingType;
}

interface ReviewRow {
  id: string;
  label: string;
  type: TrackingType;
  tint: string;
  values: Map<string, number | boolean | null>;
  habit?: Habit;
  metric?: BuiltInMetric;
}

const EMPTY_FORM: FormState = {
  name: "",
  slug: "",
  cadence: "daily",
  tracking_type: "boolean",
};

const CADENCE_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
];

const TRACKING_OPTIONS = [
  { value: "boolean", label: "Done / not done" },
  { value: "score", label: "Score 0-5" },
];

const BUILT_INS: Array<{ key: BuiltInMetric; label: string; tint: string }> = [
  { key: "mood", label: "Mood", tint: "var(--ctx-personal)" },
  { key: "energy", label: "Energy", tint: "var(--signal)" },
  { key: "productivity", label: "Productivity", tint: "var(--st-done)" },
];

function todayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function addDays(iso: string, offset: number): string {
  const date = new Date(`${iso}T00:00:00`);
  date.setDate(date.getDate() + offset);
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${mm}-${dd}`;
}

function lastDays(end: string, count: number): string[] {
  return Array.from({ length: count }, (_, index) => addDays(end, index - count + 1));
}

function scoreBackground(value: number | null, tint: string): string {
  if (value == null) return "var(--surface-2)";
  return `color-mix(in oklch, ${tint} ${18 + value * 12}%, var(--surface-2))`;
}

function scoreStat(values: Array<number | null>): string {
  const logged = values.filter((value): value is number => value != null);
  if (logged.length === 0) return "No entries";
  const avg = logged.reduce((sum, value) => sum + value, 0) / logged.length;
  return `${avg.toFixed(1)} avg · ${logged.length} logged`;
}

function booleanStat(values: Array<boolean | null>): string {
  const done = values.filter(Boolean).length;
  const percent = Math.round((done / 30) * 100);
  return `${done}/30 · ${percent}%`;
}

function cellLabel(row: ReviewRow, day: string, value: number | boolean | null): string {
  if (row.type === "boolean") {
    return `${row.label} on ${day}: ${value ? "done" : "not done"}`;
  }
  return value == null
    ? `${row.label} on ${day}: no entry`
    : `${row.label} on ${day}: ${value} of 5`;
}

function HabitReviewGrid({
  days,
  rows,
  onEditHabit,
  onSetBuiltIn,
  onLogHabit,
}: {
  days: string[];
  rows: ReviewRow[];
  onEditHabit: (habit: Habit) => void;
  onSetBuiltIn: (metric: BuiltInMetric, date: string, value: number) => void;
  onLogHabit: (habit: Habit, date: string, value: number | boolean | null) => void;
}) {
  return (
    <section className="card" style={{ padding: 18 }}>
      <SectionLabel>30-day review</SectionLabel>
      <div style={{ overflowX: "auto", paddingBottom: 2 }}>
        <table
          aria-label="30-day habit and check-in review grid"
          style={{
            borderCollapse: "separate",
            borderSpacing: "4px 6px",
            width: "max-content",
            minWidth: "100%",
          }}
        >
          <thead>
            <tr>
              <th scope="col" style={headerStyle(170, "left")}>
                Habit
              </th>
              {days.map((day) => (
                <th key={day} scope="col" title={day} style={headerStyle(28, "center")}>
                  {day.slice(8)}
                </th>
              ))}
              <th scope="col" style={headerStyle(128, "left")}>
                30 days
              </th>
              <th scope="col" style={headerStyle(84, "right")}>
                Actions
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => {
              const values = days.map((day) => row.values.get(day) ?? null);
              const stat =
                row.type === "boolean"
                  ? booleanStat(values as Array<boolean | null>)
                  : scoreStat(values as Array<number | null>);
              return (
                <tr key={row.id}>
                  <th scope="row" style={rowHeaderStyle}>
                    <span>{row.label}</span>
                    <span className="meta">{row.type === "boolean" ? "done" : "0-5"}</span>
                  </th>
                  {days.map((day) => {
                    const value = row.values.get(day) ?? null;
                    return (
                      <td key={`${row.id}-${day}`} style={{ padding: 0 }}>
                        <button
                          type="button"
                          aria-label={cellLabel(row, day, value)}
                          title={cellLabel(row, day, value)}
                          onClick={() => {
                            if (row.metric) {
                              const current = typeof value === "number" ? value : 0;
                              onSetBuiltIn(row.metric, day, current >= 5 ? 1 : current + 1);
                              return;
                            }
                            if (!row.habit) return;
                            if (row.type === "boolean") {
                              onLogHabit(row.habit, day, !(value === true));
                              return;
                            }
                            const current = typeof value === "number" ? value : -1;
                            onLogHabit(row.habit, day, current >= 5 ? 0 : current + 1);
                          }}
                          style={{
                            width: 24,
                            height: 22,
                            borderRadius: 5,
                            border: "1px solid var(--line-soft)",
                            background:
                              row.type === "boolean"
                                ? value
                                  ? "var(--st-done)"
                                  : "var(--surface-2)"
                                : scoreBackground(value as number | null, row.tint),
                            color: value ? "var(--fg)" : "var(--fg-faint)",
                            display: "inline-flex",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: 0,
                            cursor: "pointer",
                            fontSize: 12,
                            fontVariantNumeric: "tabular-nums",
                          }}
                        >
                          {row.type === "boolean" ? (
                            value ? <Check size={12} strokeWidth={2.5} /> : ""
                          ) : (
                            (value ?? "·")
                          )}
                        </button>
                      </td>
                    );
                  })}
                  <td style={{ ...bodyCellStyle, color: "var(--fg-muted)" }}>{stat}</td>
                  <td style={{ ...bodyCellStyle, textAlign: "right" }}>
                    {row.habit ? (
                      <button
                        type="button"
                        className="iconbtn"
                        aria-label={`Edit ${row.habit.name}`}
                        title={`Edit ${row.habit.name}`}
                        onClick={() => onEditHabit(row.habit!)}
                        style={{ width: 26, height: 26 }}
                      >
                        <Edit2 size={13} />
                      </button>
                    ) : (
                      <span className="meta">Built-in</span>
                    )}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function headerStyle(width: number, textAlign: "left" | "center" | "right") {
  return {
    width,
    minWidth: width,
    textAlign,
    fontSize: 10,
    color: "var(--fg-faint)",
    fontWeight: 600,
  } as const;
}

const rowHeaderStyle = {
  width: 170,
  minWidth: 170,
  textAlign: "left",
  fontSize: 12,
  color: "var(--fg-muted)",
  fontWeight: 600,
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  gap: 12,
} as const;

const bodyCellStyle = {
  fontSize: 12,
  padding: "0 6px",
  whiteSpace: "nowrap",
} as const;

function buildRows(
  habits: Habit[],
  habitLogs: HabitLog[],
  checkIns: DailyCheckIn[],
): ReviewRow[] {
  const checkInsByDate = new Map(checkIns.map((entry) => [entry.date, entry]));
  const logsByHabit = new Map<string, Map<string, HabitLog>>();
  for (const log of habitLogs) {
    if (!logsByHabit.has(log.habit_id)) logsByHabit.set(log.habit_id, new Map());
    logsByHabit.get(log.habit_id)!.set(log.date, log);
  }

  const builtInRows = BUILT_INS.map((metric) => ({
    id: metric.key,
    label: metric.label,
    type: "score" as const,
    tint: metric.tint,
    metric: metric.key,
    values: new Map(
      checkIns.map((entry) => [entry.date, checkInsByDate.get(entry.date)?.[metric.key] ?? null]),
    ),
  }));

  const habitRows = habits.map((habit) => {
    const logs = logsByHabit.get(habit.id) ?? new Map<string, HabitLog>();
    return {
      id: habit.id,
      label: habit.name,
      type: habit.tracking_type,
      tint: habit.tracking_type === "score" ? "var(--st-warn)" : "var(--st-done)",
      habit,
      values: new Map(
        Array.from(logs.values()).map((log) => [
          log.date,
          habit.tracking_type === "score" ? log.score : log.done,
        ]),
      ),
    };
  });

  return [...builtInRows, ...habitRows];
}

export function HabitsPage() {
  const today = todayISO();
  const days = useMemo(() => lastDays(today, 30), [today]);
  const { data: habits = [] } = useHabits({ active: "true" });
  const { data: habitLogs = [] } = useHabitLogs({ days: 30, end: today, active: "true" });
  const { data: checkIns = [] } = useDailyCheckIns({ days: 30, end: today });
  useEditFromSearch(habits, handleEdit);
  const createHabit = useCreateHabit();
  const updateHabit = useUpdateHabit();
  const deleteHabit = useDeleteHabit();
  const logHabit = useLogHabit();
  const setDailyCheckIn = useSetDailyCheckIn();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  useHotkey("c", handleNew, !panelOpen);

  const rows = useMemo(
    () => buildRows(habits, habitLogs, checkIns),
    [habits, habitLogs, checkIns],
  );

  function handleChange(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function handleNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setPanelOpen(true);
  }

  function handleEdit(row: Habit) {
    setEditingId(row.id);
    setForm({
      name: row.name,
      slug: row.slug,
      cadence: row.cadence,
      tracking_type: row.tracking_type,
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
      slug: resolvedSlug(form.slug, form.name),
      cadence: form.cadence,
      tracking_type: form.tracking_type,
    };
    if (editingId) {
      updateHabit.mutate({ id: editingId, data: payload }, { onSuccess: handleClose });
    } else {
      createHabit.mutate(payload, { onSuccess: handleClose });
    }
  }

  function handleSetBuiltIn(metric: BuiltInMetric, date: string, value: number) {
    setDailyCheckIn.mutate({ date, data: { [metric]: value } });
  }

  function handleLogHabit(habit: Habit, date: string, value: number | boolean | null) {
    if (habit.tracking_type === "score") {
      logHabit.mutate({ id: habit.id, data: { date, score: Number(value ?? 0) } });
      return;
    }
    logHabit.mutate({ id: habit.id, data: { date, done: value === true } });
  }

  return (
    <RequireAuth>
      <AppShell>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">Habits</h1>
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

          <HabitReviewGrid
            days={days}
            rows={rows}
            onEditHabit={handleEdit}
            onSetBuiltIn={handleSetBuiltIn}
            onLogHabit={handleLogHabit}
          />
        </div>

        <SidePanel
          open={panelOpen}
          onClose={handleClose}
          title={editingId ? "Edit habit" : "New habit"}
        >
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
            <Field label="Name">
              <Input
                value={form.name}
                onChange={handleChange("name")}
                placeholder="Morning pages"
                aria-label="Name"
                required
              />
            </Field>
            <SlugField
              value={form.slug}
              source={form.name}
              onChange={(value) => setForm((prev) => ({ ...prev, slug: value }))}
            />
            <Field label="Cadence">
              <Select
                value={form.cadence}
                onChange={(value) => setForm((prev) => ({ ...prev, cadence: value }))}
                options={CADENCE_OPTIONS}
              />
            </Field>
            <Field label="Tracking">
              <Select
                value={form.tracking_type}
                onChange={(value) =>
                  setForm((prev) => ({ ...prev, tracking_type: value as TrackingType }))
                }
                options={TRACKING_OPTIONS}
              />
            </Field>
            <div className="flex gap-2">
              <Button type="submit">{editingId ? "Save" : "Add"}</Button>
              <Button type="button" onClick={handleClose} className="ghost">
                Cancel
              </Button>
              {editingId && (
                <ConfirmButton
                  onConfirm={() => {
                    deleteHabit.mutate(editingId, { onSuccess: handleClose });
                  }}
                >
                  Delete
                </ConfirmButton>
              )}
            </div>
          </form>
        </SidePanel>
      </AppShell>
    </RequireAuth>
  );
}

export const habitsRoute = createRoute({
  getParentRoute: () => rootRoute,
  validateSearch: editSearch,
  path: "/habits",
  component: HabitsPage,
});
