import { createRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { ConfirmButton } from "../components/ConfirmButton";
import { DataTable } from "../components/DataTable";
import { RequireAuth } from "../components/RequireAuth";
import { Button, Card, Field, Input, Select } from "../components/ui";
import {
  useAddJournalLog,
  useCreateJournalEntry,
  useDeleteJournalEntry,
  useDeleteJournalLog,
  useJournalEntries,
  useJournalLogs,
  useUpdateJournalEntry,
} from "../features/journal/api";
import type { JournalEntry } from "../lib/types";
import { rootRoute } from "./root";

function todayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

interface FormState {
  date: string;
  summary: string;
  mood: string;
  energy: string;
  telos_alignment: string;
  body: string;
}

const EMPTY_FORM: FormState = {
  date: todayISO(),
  summary: "",
  mood: "",
  energy: "",
  telos_alignment: "",
  body: "",
};

const RATING_OPTIONS = [
  { value: "1", label: "1" },
  { value: "2", label: "2" },
  { value: "3", label: "3" },
  { value: "4", label: "4" },
  { value: "5", label: "5" },
];

/** Build a JournalEntryCreate/Update payload.
 * On update: send null for cleared mood/energy/text fields so the backend can unset them.
 */
function buildPayload(form: FormState, isEdit: boolean) {
  return {
    ...(isEdit ? {} : { date: form.date }),
    ...(form.summary ? { summary: form.summary } : { summary: null }),
    ...(form.mood ? { mood: Number(form.mood) } : { mood: null }),
    ...(form.energy ? { energy: Number(form.energy) } : { energy: null }),
    ...(form.telos_alignment
      ? { telos_alignment: form.telos_alignment }
      : { telos_alignment: null }),
    ...(form.body ? { body: form.body } : { body: null }),
  };
}

function JournalLogs({ entryId }: { entryId: string }) {
  const { data: logs = [] } = useJournalLogs(entryId);
  const addLog = useAddJournalLog();
  const deleteLog = useDeleteJournalLog();
  const [text, setText] = useState("");

  function handleAdd(e: React.FormEvent) {
    e.preventDefault();
    if (!text.trim()) return;
    addLog.mutate(
      { entryId, data: { text: text.trim() } },
      { onSuccess: () => setText("") },
    );
  }

  return (
    <Card>
      <h2 className="text-sm font-semibold mb-3">Log lines</h2>
      <div className="space-y-2 mb-4">
        {logs.length === 0 && <p className="text-sm text-gray-400">No log lines yet.</p>}
        {logs.map((l) => (
          <div key={l.id} className="flex items-center gap-3">
            <span className="text-xs text-gray-500 tnum" style={{ width: 56, flexShrink: 0 }}>
              {l.at.slice(11, 16)}
            </span>
            <span className="flex-1 text-sm">{l.text}</span>
            <ConfirmButton onConfirm={() => deleteLog.mutate(l.id)}>Delete</ConfirmButton>
          </div>
        ))}
      </div>
      <form onSubmit={handleAdd} className="flex gap-2">
        <Input
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Add a log line…"
          aria-label="Log line"
          className="flex-1"
        />
        <Button type="submit">Add log</Button>
      </form>
    </Card>
  );
}

export function JournalPage() {
  const { data: entries = [] } = useJournalEntries();
  const createEntry = useCreateJournalEntry();
  const updateEntry = useUpdateJournalEntry();
  const deleteEntry = useDeleteJournalEntry();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);

  function handleChange(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function handleSelectChange(key: keyof FormState) {
    return (value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleEdit(row: JournalEntry) {
    setEditingId(row.id);
    setForm({
      date: row.date,
      summary: row.summary ?? "",
      mood: row.mood != null ? String(row.mood) : "",
      energy: row.energy != null ? String(row.energy) : "",
      telos_alignment: row.telos_alignment ?? "",
      body: row.body ?? "",
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
      updateEntry.mutate(
        { id: editingId, data: payload },
        {
          onSuccess: () => {
            setEditingId(null);
            setForm(EMPTY_FORM);
          },
        },
      );
    } else {
      createEntry.mutate(payload, {
        onSuccess: () => setForm(EMPTY_FORM),
      });
    }
  }

  const columns = [
    { header: "Date", cell: (row: JournalEntry) => row.date },
    { header: "Summary", cell: (row: JournalEntry) => row.summary ?? "" },
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
            <p className="text-sm text-gray-400">
              <Link to="/activity" className="underline hover:text-gray-600">
                Manage from the Activity page to undo changes.
              </Link>
            </p>
          </div>

          <Card>
            <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
              <Field label="Date">
                <Input
                  type="date"
                  value={form.date}
                  onChange={handleChange("date")}
                  aria-label="Date"
                  required
                  disabled={!!editingId}
                />
              </Field>
              <Field label="Summary">
                <Input
                  value={form.summary}
                  onChange={handleChange("summary")}
                  placeholder="Daily review prose"
                  aria-label="Summary"
                />
              </Field>
              <Field label="Mood">
                <Select
                  value={form.mood}
                  onChange={handleSelectChange("mood")}
                  options={RATING_OPTIONS}
                  placeholder="— none —"
                />
              </Field>
              <Field label="Energy">
                <Select
                  value={form.energy}
                  onChange={handleSelectChange("energy")}
                  options={RATING_OPTIONS}
                  placeholder="— none —"
                />
              </Field>
              <Field label="TELOS alignment">
                <Input
                  value={form.telos_alignment}
                  onChange={handleChange("telos_alignment")}
                  placeholder="How did today align with your goals?"
                  aria-label="TELOS alignment"
                />
              </Field>
              <Field label="Body">
                <textarea
                  className="input"
                  value={form.body}
                  onChange={handleChange("body")}
                  placeholder="Markdown for anything unstructured…"
                  aria-label="Body"
                  rows={4}
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

          {editingId && <JournalLogs entryId={editingId} />}

          <DataTable rows={entries} columns={columns} empty="No journal entries yet." />
        </div>
      </AppShell>
    </RequireAuth>
  );
}

export const journalRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/journal",
  component: JournalPage,
});
