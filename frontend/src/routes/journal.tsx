import { createRoute, Link } from "@tanstack/react-router";
import { Edit2, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell } from "../components/AppShell";
import { ConfirmButton } from "../components/ConfirmButton";
import { Markdown } from "../components/Markdown";
import { RequireAuth } from "../components/RequireAuth";
import { editSearch, useEditFromSearch } from "../lib/useEditFromSearch";
import { useHotkey } from "../lib/useHotkey";
import { Button, Field, Input, Textarea } from "../components/ui";
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

interface SelectionState {
  selectedId: string | null | undefined;
  pendingCreatedEntry: JournalEntry | null;
  hiddenEntryIds: Set<string>;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function emptyForm(): FormState {
  return { date: todayISO(), title: "", body: "", mood: "", energy: "" };
}

function entryTitle(entry: JournalEntry): string {
  return entry.title?.trim() || entry.date;
}

function shortPreview(entry: JournalEntry): string {
  return entry.body
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#{1,6}\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/^>\s?/gm, "")
    .replace(/[*_~]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
}

function metric(value: number | null, label: string) {
  if (value == null) return null;
  return (
    <span className="chip" title={`${label}: ${value} of 5`}>
      {label} {value}/5
    </span>
  );
}

export function JournalPage() {
  const { data: entries = [] } = useJournalEntries();
  useEditFromSearch(entries, handleEdit);
  const createEntry = useCreateJournalEntry();
  const updateEntry = useUpdateJournalEntry();
  const deleteEntry = useDeleteJournalEntry();

  const [form, setForm] = useState<FormState>(emptyForm);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [selection, setSelection] = useState<SelectionState>(() => ({
    selectedId: undefined,
    pendingCreatedEntry: null,
    hiddenEntryIds: new Set(),
  }));
  useHotkey("c", handleNew, !editorOpen);

  const sortedEntries = useMemo(
    () => {
      const hidden = selection.hiddenEntryIds;
      const base = entries.filter((entry) => !hidden.has(entry.id));
      const withPending =
        selection.pendingCreatedEntry &&
        !base.some((entry) => entry.id === selection.pendingCreatedEntry?.id)
          ? [selection.pendingCreatedEntry, ...base]
          : base;
      return withPending.toSorted((a, b) => b.date.localeCompare(a.date));
    },
    [entries, selection],
  );
  const selected =
    selection.selectedId === undefined
      ? (sortedEntries[0] ?? null)
      : selection.selectedId
        ? (sortedEntries.find((entry) => entry.id === selection.selectedId) ?? null)
        : null;

  function handleChange(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function handleNew() {
    setEditingId(null);
    setForm(emptyForm());
    setEditorOpen(true);
  }

  function handleEdit(row: JournalEntry) {
    setEditingId(row.id);
    setSelection((prev) => ({ ...prev, selectedId: row.id }));
    setForm({
      date: row.date,
      title: row.title ?? "",
      body: row.body,
      mood: row.mood != null ? String(row.mood) : "",
      energy: row.energy != null ? String(row.energy) : "",
    });
    setEditorOpen(true);
  }

  function handleClose() {
    setEditorOpen(false);
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
        {
          onSuccess: () => {
            setSelection((prev) => ({ ...prev, selectedId: editingId }));
            handleClose();
          },
        },
      );
    } else {
      createEntry.mutate(payload, {
        onSuccess: (entry) => {
          setSelection((prev) => {
            const hiddenEntryIds = new Set(prev.hiddenEntryIds);
            hiddenEntryIds.delete(entry.id);
            return {
              selectedId: entry.id,
              pendingCreatedEntry: entry,
              hiddenEntryIds,
            };
          });
          handleClose();
        },
      });
    }
  }

  function handleDelete(id: string) {
    deleteEntry.mutate(id, {
      onSuccess: () => {
        const nextEntry = sortedEntries.find((entry) => entry.id !== id);
        setSelection((prev) => {
          const hiddenEntryIds = new Set(prev.hiddenEntryIds);
          hiddenEntryIds.add(id);
          return {
            ...prev,
            hiddenEntryIds,
            selectedId:
              prev.selectedId === id || prev.selectedId === undefined
                ? (nextEntry?.id ?? null)
                : prev.selectedId,
          };
        });
        handleClose();
      },
    });
  }

  return (
    <RequireAuth>
      <AppShell>
        <div className="page space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="title">Journal</h1>
            <div className="flex items-center gap-4">
              <p className="meta desktop-only">
                <Link to="/activity" className="underline hover:text-gray-600">
                  Manage from the Activity page to undo changes.
                </Link>
              </p>
              <Button type="button" onClick={handleNew} className="row gap-2">
                <Plus size={15} /> Create
              </Button>
            </div>
          </div>

          <div className="journal-grid">
            <aside className="card" style={{ padding: 10 }}>
              <div className="label" style={{ padding: "6px 8px 10px" }}>
                Entries
              </div>
              {sortedEntries.length === 0 ? (
                <p className="meta" style={{ padding: "8px" }}>
                  No journal entries yet.
                </p>
              ) : (
                <div className="col gap-1">
                  {sortedEntries.map((entry) => {
                    const isSelected = selected?.id === entry.id && !editorOpen;
                    return (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => {
                          setSelection((prev) => ({ ...prev, selectedId: entry.id }));
                          setEditorOpen(false);
                        }}
                        className="journal-entry-row"
                        aria-pressed={isSelected}
                      >
                        <span className="meta">{entry.date}</span>
                        <span style={{ fontWeight: 600 }}>{entryTitle(entry)}</span>
                        <span className="dim">{shortPreview(entry)}</span>
                      </button>
                    );
                  })}
                </div>
              )}
            </aside>

            {editorOpen ? (
              <section className="card" style={{ padding: 18 }}>
                <div className="row" style={{ justifyContent: "space-between", gap: 12, marginBottom: 16 }}>
                  <h2 className="title-sm" style={{ margin: 0 }}>
                    {editingId ? "Edit journal entry" : "New journal entry"}
                  </h2>
                  <Button type="button" onClick={handleClose} className="ghost sm">
                    Cancel
                  </Button>
                </div>
                <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
                  <div className="journal-form-grid">
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
                  </div>
                  <Field label="Entry">
                    <Textarea
                      value={form.body}
                      onChange={handleChange("body")}
                      placeholder="Write the day as markdown..."
                      aria-label="Entry"
                      rows={16}
                      required
                    />
                  </Field>
                  <div className="journal-form-grid">
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
                  </div>
                  <div className="flex gap-2">
                    <Button type="submit">{editingId ? "Save" : "Add"}</Button>
                    {editingId && (
                      <ConfirmButton onConfirm={() => handleDelete(editingId)}>
                        Delete
                      </ConfirmButton>
                    )}
                  </div>
                </form>
              </section>
            ) : selected ? (
              <article className="card" style={{ padding: 24 }}>
                <div className="row wrap" style={{ justifyContent: "space-between", gap: 12, marginBottom: 18 }}>
                  <div>
                    <div className="meta">{selected.date}</div>
                    <h2 className="title" style={{ margin: "4px 0 0" }}>
                      {entryTitle(selected)}
                    </h2>
                  </div>
                  <Button
                    type="button"
                    onClick={() => handleEdit(selected)}
                    className="row gap-2"
                  >
                    <Edit2 size={14} /> Edit
                  </Button>
                </div>
                <div className="row wrap gap-2" style={{ marginBottom: 18 }}>
                  {metric(selected.mood, "Mood")}
                  {metric(selected.energy, "Energy")}
                  {metric(selected.productivity, "Productivity")}
                </div>
                <Markdown>{selected.body}</Markdown>
              </article>
            ) : (
              <section className="card" style={{ padding: 24 }}>
                <h2 className="title-sm" style={{ marginTop: 0 }}>
                  Start today&apos;s note
                </h2>
                <p className="dim">
                  Capture the day in one readable place. Markdown is supported.
                </p>
                <Button type="button" onClick={handleNew} className="row gap-2">
                  <Plus size={15} /> Start note
                </Button>
              </section>
            )}
          </div>
        </div>
      </AppShell>
    </RequireAuth>
  );
}

export const journalRoute = createRoute({
  getParentRoute: () => rootRoute,
  validateSearch: editSearch,
  path: "/journal",
  component: JournalPage,
});
