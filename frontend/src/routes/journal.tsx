import { createRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { ConfirmButton } from "../components/ConfirmButton";
import { DataTable } from "../components/DataTable";
import { RequireAuth } from "../components/RequireAuth";
import { SidePanel } from "../components/SidePanel";
import { useHotkey } from "../lib/useHotkey";
import { Button, Field, Input } from "../components/ui";
import {
  useCreateJournalEntry,
  useDeleteJournalEntry,
  useJournalEntries,
  useUpdateJournalEntry,
} from "../features/journal/api";
import type { JournalEntry } from "../lib/types";
import { rootRoute } from "./root";

interface FormState {
  date: string;
  title: string;
  body: string;
  mood: string;
  energy: string;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyForm(): FormState {
  return { date: todayISO(), title: "", body: "", mood: "", energy: "" };
}

export function JournalPage() {
  const { data: entries = [] } = useJournalEntries();
  const createEntry = useCreateJournalEntry();
  const updateEntry = useUpdateJournalEntry();
  const deleteEntry = useDeleteJournalEntry();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  useHotkey("c", handleNew, !panelOpen);

  function handleChange(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function handleNew() {
    setEditingId(null);
    setForm(emptyForm());
    setPanelOpen(true);
  }

  function handleEdit(row: JournalEntry) {
    setEditingId(row.id);
    setForm({
      date: row.date,
      title: row.title ?? "",
      body: row.body,
      mood: row.mood != null ? String(row.mood) : "",
      energy: row.energy != null ? String(row.energy) : "",
    });
    setPanelOpen(true);
  }

  function handleClose() {
    setPanelOpen(false);
    setEditingId(null);
    setForm(emptyForm());
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      date: form.date,
      body: form.body,
      title: form.title ? form.title : null,
      mood: form.mood ? Number(form.mood) : null,
      energy: form.energy ? Number(form.energy) : null,
    };
    if (editingId) {
      updateEntry.mutate(
        { id: editingId, data: payload },
        { onSuccess: handleClose },
      );
    } else {
      createEntry.mutate(payload, { onSuccess: handleClose });
    }
  }

  const columns = [
    { header: "Date", cell: (row: JournalEntry) => row.date },
    { header: "Title", cell: (row: JournalEntry) => row.title ?? "" },
    {
      header: "Entry",
      cell: (row: JournalEntry) => (
        <span style={{ display: "block", maxWidth: 420, color: "var(--fg-dim)" }}>
          {row.body.length > 120 ? `${row.body.slice(0, 120)}…` : row.body}
        </span>
      ),
    },
    { header: "Mood", cell: (row: JournalEntry) => (row.mood != null ? String(row.mood) : "") },
    {
      header: "Energy",
      cell: (row: JournalEntry) => (row.energy != null ? String(row.energy) : ""),
    },
    {
      header: "Actions",
      cell: (row: JournalEntry) => (
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="text-xs text-gray-500 hover:text-gray-900"
            onClick={() => handleEdit(row)}
          >
            Edit
          </button>
          <ConfirmButton onConfirm={() => deleteEntry.mutate(row.id)}>Delete</ConfirmButton>
        </div>
      ),
    },
  ];

  return (
    <RequireAuth>
      <AppShell>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">Journal</h1>
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

          <DataTable rows={entries} columns={columns} empty="No journal entries yet." />
        </div>

        <SidePanel
          open={panelOpen}
          onClose={handleClose}
          title={editingId ? "Edit journal entry" : "New journal entry"}
        >
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
            <Field label="Date">
              <Input
                type="date"
                value={form.date}
                onChange={handleChange("date")}
                aria-label="Date"
                required
              />
            </Field>
            <Field label="Title">
              <Input
                value={form.title}
                onChange={handleChange("title")}
                placeholder="Optional title"
                aria-label="Title"
              />
            </Field>
            <Field label="Entry">
              <textarea
                className="input"
                value={form.body}
                onChange={handleChange("body")}
                placeholder="How did the day go?"
                aria-label="Entry"
                rows={4}
                required
              />
            </Field>
            <Field label="Mood (1-5)">
              <Input
                type="number"
                min={1}
                max={5}
                value={form.mood}
                onChange={handleChange("mood")}
                placeholder="3"
                aria-label="Mood"
              />
            </Field>
            <Field label="Energy (1-5)">
              <Input
                type="number"
                min={1}
                max={5}
                value={form.energy}
                onChange={handleChange("energy")}
                placeholder="3"
                aria-label="Energy"
              />
            </Field>
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

export const journalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/journal",
  component: JournalPage,
});
