import { createRoute, Link } from "@tanstack/react-router";
import { Check, Flame, Plus } from "lucide-react";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { ConfirmButton } from "../components/ConfirmButton";
import { DataTable } from "../components/DataTable";
import { RequireAuth } from "../components/RequireAuth";
import { SidePanel } from "../components/SidePanel";
import { SlugField } from "../components/SlugField";
import { SectionLabel } from "../components/console";
import { editSearch, useEditFromSearch } from "../lib/useEditFromSearch";
import { useHotkey } from "../lib/useHotkey";
import { resolvedSlug } from "../lib/slug";
import { Button, Field, Input, Select } from "../components/ui";
import { useDailyCheckIns } from "../features/journal/api";
import {
  useCreateHabit,
  useDeleteHabit,
  useHabits,
  useLogHabit,
  useUpdateHabit,
} from "../features/habits/api";
import type { Habit } from "../lib/types";
import { rootRoute } from "./root";

interface FormState {
  name: string;
  slug: string;
  cadence: string;
}

const EMPTY_FORM: FormState = { name: "", slug: "", cadence: "daily" };

const CADENCE_OPTIONS = [
  { value: "daily", label: "Daily" },
  { value: "weekly", label: "Weekly" },
];

const CHECKIN_METRICS = [
  { key: "mood", label: "Mood", tint: "var(--ctx-personal)" },
  { key: "energy", label: "Energy", tint: "var(--signal)" },
  { key: "productivity", label: "Productivity", tint: "var(--st-done)" },
] as const;

function todayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function shortDate(iso: string): string {
  return iso.slice(5);
}

function CheckInHistory({
  checkIns,
}: {
  checkIns: Array<{
    date: string;
    mood: number | null;
    energy: number | null;
    productivity: number | null;
  }>;
}) {
  return (
    <section className="card" style={{ padding: 18 }}>
      <SectionLabel>Daily check-in · past 30 days</SectionLabel>
      <div style={{ overflowX: "auto", paddingBottom: 2 }}>
        <table
          aria-label="Daily check-in history for past 30 days"
          style={{
            borderCollapse: "separate",
            borderSpacing: "4px 6px",
            width: "max-content",
            minWidth: "100%",
          }}
        >
          <thead>
            <tr>
              <th
                scope="col"
                style={{
                  width: 96,
                  textAlign: "left",
                  fontSize: 11,
                  color: "var(--fg-faint)",
                  fontWeight: 600,
                }}
              >
                Metric
              </th>
              {checkIns.map((entry) => (
                <th
                  key={entry.date}
                  scope="col"
                  title={entry.date}
                  style={{
                    width: 26,
                    minWidth: 26,
                    textAlign: "center",
                    fontSize: 10,
                    color: "var(--fg-faint)",
                    fontWeight: 500,
                  }}
                >
                  {entry.date.slice(8)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {CHECKIN_METRICS.map((metric) => (
              <tr key={metric.key}>
                <th
                  scope="row"
                  style={{
                    width: 96,
                    textAlign: "left",
                    fontSize: 12,
                    color: "var(--fg-muted)",
                    fontWeight: 600,
                  }}
                >
                  {metric.label}
                </th>
                {checkIns.map((entry) => {
                  const value = entry[metric.key];
                  const label =
                    value == null
                      ? `${metric.label} on ${entry.date}: no entry`
                      : `${metric.label} on ${entry.date}: ${value} of 5`;
                  return (
                    <td key={`${metric.key}-${entry.date}`} style={{ padding: 0 }}>
                      <span
                        role="img"
                        aria-label={label}
                        title={`${shortDate(entry.date)} · ${metric.label}: ${value ?? "-"}`}
                        style={{
                          display: "inline-flex",
                          width: 24,
                          height: 22,
                          alignItems: "center",
                          justifyContent: "center",
                          borderRadius: 5,
                          border: "1px solid var(--line-soft)",
                          background:
                            value == null
                              ? "var(--surface-2)"
                              : `color-mix(in oklch, ${metric.tint} ${18 + value * 12}%, var(--surface-2))`,
                          color: value == null ? "var(--fg-faint)" : "var(--fg)",
                          fontSize: 11,
                          fontVariantNumeric: "tabular-nums",
                        }}
                      >
                        {value ?? "·"}
                      </span>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export function HabitsPage() {
  const { data: habits = [] } = useHabits();
  const { data: checkIns = [] } = useDailyCheckIns({ days: 30, end: todayISO() });
  useEditFromSearch(habits, handleEdit);
  const createHabit = useCreateHabit();
  const updateHabit = useUpdateHabit();
  const deleteHabit = useDeleteHabit();
  const logHabit = useLogHabit();

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

  function handleEdit(row: Habit) {
    setEditingId(row.id);
    setForm({ name: row.name, slug: row.slug, cadence: row.cadence });
    setPanelOpen(true);
  }

  function handleClose() {
    setPanelOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { name: form.name, slug: resolvedSlug(form.slug, form.name), cadence: form.cadence };
    if (editingId) {
      updateHabit.mutate(
        { id: editingId, data: payload },
        { onSuccess: handleClose },
      );
    } else {
      createHabit.mutate(payload, { onSuccess: handleClose });
    }
  }

  function toggleToday(row: Habit) {
    logHabit.mutate({ id: row.id, data: { date: todayISO(), done: !row.logged_today } });
  }

  const columns = [
    {
      header: "Today",
      cell: (row: Habit) => (
        <button
          type="button"
          aria-label={`Toggle ${row.name} for today`}
          onClick={() => toggleToday(row)}
          style={{
            width: 22,
            height: 22,
            borderRadius: 7,
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            border: `1px solid ${row.logged_today ? "var(--st-done)" : "var(--line-bright)"}`,
            background: row.logged_today ? "var(--st-done)" : "transparent",
            color: row.logged_today ? "var(--signal-ink)" : "var(--fg-dim)",
          }}
        >
          {row.logged_today && <Check size={13} strokeWidth={2.4} />}
        </button>
      ),
    },
    { header: "Name", cell: (row: Habit) => row.name },
    { header: "Slug", cell: (row: Habit) => row.slug },
    {
      header: "Streak",
      cell: (row: Habit) => (
        <span
          className="row gap-1"
          style={{
            alignItems: "center",
            color: row.streak > 0 ? "var(--st-warn)" : "var(--fg-faint)",
          }}
        >
          <Flame size={12} />
          {row.streak}
        </span>
      ),
    },
    { header: "Cadence", cell: (row: Habit) => row.cadence },
    { header: "Active", cell: (row: Habit) => (row.active ? "Yes" : "No") },
    {
      header: "Actions",
      cell: (row: Habit) => (
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="text-xs text-gray-500 hover:text-gray-900"
            onClick={() => handleEdit(row)}
          >
            Edit
          </button>
          <ConfirmButton onConfirm={() => deleteHabit.mutate(row.id)}>Delete</ConfirmButton>
        </div>
      ),
    },
  ];

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

          <CheckInHistory checkIns={checkIns} />

          <DataTable rows={habits} columns={columns} empty="No habits yet." />
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
            <Field label="Cadence">
              <Select
                value={form.cadence}
                onChange={(value) => setForm((prev) => ({ ...prev, cadence: value }))}
                options={CADENCE_OPTIONS}
              />
            </Field>
            <SlugField
              value={form.slug}
              source={form.name}
              onChange={(value) => setForm((prev) => ({ ...prev, slug: value }))}
            />
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

export const habitsRoute = createRoute({
  getParentRoute: () => rootRoute,
  validateSearch: editSearch,
  path: "/habits",
  component: HabitsPage,
});
