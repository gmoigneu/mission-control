import { createRoute, Link } from "@tanstack/react-router";
import { Check, Flame } from "lucide-react";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { ConfirmButton } from "../components/ConfirmButton";
import { DataTable } from "../components/DataTable";
import { RequireAuth } from "../components/RequireAuth";
import { Button, Card, Field, Input, Select } from "../components/ui";
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

function todayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

export function HabitsPage() {
  const { data: habits = [] } = useHabits();
  const createHabit = useCreateHabit();
  const updateHabit = useUpdateHabit();
  const deleteHabit = useDeleteHabit();
  const logHabit = useLogHabit();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);

  function handleChange(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function handleEdit(row: Habit) {
    setEditingId(row.id);
    setForm({ name: row.name, slug: row.slug, cadence: row.cadence });
  }

  function handleCancel() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = { name: form.name, slug: form.slug, cadence: form.cadence };
    if (editingId) {
      updateHabit.mutate(
        { id: editingId, data: payload },
        {
          onSuccess: () => {
            setEditingId(null);
            setForm(EMPTY_FORM);
          },
        },
      );
    } else {
      createHabit.mutate(payload, { onSuccess: () => setForm(EMPTY_FORM) });
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
                  placeholder="Morning pages"
                  aria-label="Name"
                  required
                />
              </Field>
              <Field label="Slug">
                <Input
                  value={form.slug}
                  onChange={handleChange("slug")}
                  placeholder="morning-pages"
                  aria-label="Slug"
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
              <div className="col-span-2 flex gap-2">
                <Button type="submit">{editingId ? "Save" : "Add"}</Button>
                {editingId && (
                  <Button
                    type="button"
                    onClick={handleCancel}
                    className="bg-gray-400 hover:bg-gray-500"
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </Card>

          <DataTable rows={habits} columns={columns} empty="No habits yet." />
        </div>
      </AppShell>
    </RequireAuth>
  );
}

export const habitsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/habits",
  component: HabitsPage,
});
