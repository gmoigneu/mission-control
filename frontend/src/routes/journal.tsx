import "@uiw/react-md-editor/markdown-editor.css";
import "@uiw/react-markdown-preview/markdown.css";
import { createRoute, Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Save } from "lucide-react";
import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "../components/AppShell";
import { RequireAuth } from "../components/RequireAuth";
import { editSearch, useEditFromSearch } from "../lib/useEditFromSearch";
import { Button, Field, Input } from "../components/ui";
import {
  useCreateJournalEntry,
  useJournalEntries,
  useUpdateJournalEntry,
} from "../features/journal/api";
import type { JournalEntry } from "../lib/types";
import { rootRoute } from "./root";

const MDEditor = lazy(() => import("@uiw/react-md-editor/nohighlight"));

type SaveStatus = "idle" | "unsaved" | "saving" | "saved" | "error";

interface DraftState {
  id: string | null;
  title: string;
  body: string;
  mood: string;
  energy: string;
  lastSavedSignature: string;
  status: SaveStatus;
  error: string | null;
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

function titleForDate(date: string): string {
  return date;
}

function signature(values: {
  title: string;
  body: string;
  mood: string;
  energy: string;
}): string {
  return JSON.stringify(values);
}

function draftFromEntry(entry: JournalEntry | null): DraftState {
  const values = {
    title: entry?.title ?? "",
    body: entry?.body ?? "",
    mood: entry?.mood != null ? String(entry.mood) : "",
    energy: entry?.energy != null ? String(entry.energy) : "",
  };
  return {
    id: entry?.id ?? null,
    ...values,
    lastSavedSignature: signature(values),
    status: entry ? "saved" : "idle",
    error: null,
  };
}

function hasDraftContent(draft: DraftState): boolean {
  return Boolean(
    draft.title.trim() || draft.body.trim() || draft.mood.trim() || draft.energy.trim(),
  );
}

function statusLabel(status: SaveStatus, hasEntry: boolean): string {
  if (status === "saving") return "Saving...";
  if (status === "saved") return "Saved";
  if (status === "error") return "Save failed";
  if (status === "unsaved") return "Unsaved changes";
  return hasEntry ? "Saved" : "Ready";
}

export function JournalPage() {
  const { data: entries = [] } = useJournalEntries();
  const today = useMemo(() => todayISO(), []);
  const [activeDate, setActiveDate] = useState(today);

  const editRequest = useEditFromSearch(entries);

  const entriesByDate = useMemo(() => {
    const map = new Map<string, JournalEntry>();
    for (const entry of entries) {
      if (!map.has(entry.date)) map.set(entry.date, entry);
    }
    return map;
  }, [entries]);

  const dates = useMemo(() => {
    return [...new Set([today, ...entries.map((entry) => entry.date)])].toSorted();
  }, [entries, today]);
  if (editRequest && activeDate !== editRequest.date) setActiveDate(editRequest.date);

  const activeEntry = entriesByDate.get(activeDate) ?? null;
  const activeIndex = dates.indexOf(activeDate);
  const previousDate = activeIndex > 0 ? dates[activeIndex - 1] : null;
  const nextDate = activeIndex >= 0 && activeIndex < dates.length - 1 ? dates[activeIndex + 1] : null;

  function handleEntryCreated(entry: JournalEntry) {
    setActiveDate(entry.date);
  }

  return (
    <RequireAuth>
      <AppShell>
        <div className="page journal-editor-page">
          <div className="journal-editor-header">
            <div>
              <h1 className="title">Journal</h1>
              <p className="meta">
                Write directly in markdown. Changes autosave after two quiet seconds.
              </p>
            </div>
            <Link to="/activity" className="meta underline hover:text-gray-600">
              Activity
            </Link>
          </div>

          <JournalEditor
            key={activeEntry?.id ?? `draft-${activeDate}`}
            date={activeDate}
            entry={activeEntry}
            previousDate={previousDate}
            nextDate={nextDate}
            onDateChange={setActiveDate}
            onEntryCreated={handleEntryCreated}
          />
        </div>
      </AppShell>
    </RequireAuth>
  );
}

function JournalEditor({
  date,
  entry,
  previousDate,
  nextDate,
  onDateChange,
  onEntryCreated,
}: {
  date: string;
  entry: JournalEntry | null;
  previousDate: string | null;
  nextDate: string | null;
  onDateChange: (date: string) => void;
  onEntryCreated: (entry: JournalEntry) => void;
}) {
  const createEntry = useCreateJournalEntry();
  const updateEntry = useUpdateJournalEntry();
  const [draft, setDraft] = useState(() => draftFromEntry(entry));

  const currentSignature = useMemo(
    () =>
      signature({
        title: draft.title,
        body: draft.body,
        mood: draft.mood,
        energy: draft.energy,
      }),
    [draft.body, draft.energy, draft.mood, draft.title],
  );

  const isDirty = currentSignature !== draft.lastSavedSignature;

  const saveNow = useCallback(async () => {
    if (!isDirty) return true;
    if (!draft.id && !hasDraftContent(draft)) return true;

    const requestedSignature = currentSignature;
    const payload = {
      date,
      body: draft.body,
      title: draft.title.trim() ? draft.title : null,
      mood: draft.mood ? Number(draft.mood) : null,
      energy: draft.energy ? Number(draft.energy) : null,
    };

    setDraft((prev) => ({ ...prev, status: "saving", error: null }));

    try {
      const saved = draft.id
        ? await updateEntry.mutateAsync({ id: draft.id, data: payload })
        : await createEntry.mutateAsync(payload);

      if (!draft.id) onEntryCreated(saved);

      setDraft((prev) => {
        const latestSignature = signature({
          title: prev.title,
          body: prev.body,
          mood: prev.mood,
          energy: prev.energy,
        });
        return {
          ...prev,
          id: saved.id,
          lastSavedSignature: requestedSignature,
          status: latestSignature === requestedSignature ? "saved" : "unsaved",
          error: null,
        };
      });
      return true;
    } catch {
      setDraft((prev) => ({
        ...prev,
        status: "error",
        error: "Could not save this entry. Try again when the connection is back.",
      }));
      return false;
    }
  }, [createEntry, currentSignature, date, draft, isDirty, onEntryCreated, updateEntry]);

  useEffect(() => {
    if (!isDirty || draft.status === "saving") return;
    if (!draft.id && !hasDraftContent(draft)) return;
    const timer = window.setTimeout(() => {
      void saveNow();
    }, 2000);
    return () => window.clearTimeout(timer);
  }, [draft, isDirty, saveNow]);

  function updateDraft(key: "title" | "body" | "mood" | "energy", value: string) {
    setDraft((prev) => ({
      ...prev,
      [key]: value,
      status: "unsaved",
      error: null,
    }));
  }

  async function navigateTo(targetDate: string | null) {
    if (!targetDate) return;
    const saved = await saveNow();
    if (saved) onDateChange(targetDate);
  }

  return (
    <section className="journal-editor-shell" data-color-mode="dark">
      <div className="journal-editor-toolbar">
        <div className="row gap-2">
          <Button
            type="button"
            className="ghost icon"
            aria-label="Previous journal day"
            disabled={!previousDate || draft.status === "saving"}
            onClick={() => void navigateTo(previousDate)}
            title={previousDate ? `Go to ${previousDate}` : "No previous entry"}
          >
            <ChevronLeft size={16} />
          </Button>
          <div>
            <div className="label">Entry date</div>
            <h2 className="title-sm" style={{ margin: "2px 0 0" }}>
              {titleForDate(date)}
            </h2>
          </div>
          <Button
            type="button"
            className="ghost icon"
            aria-label="Next journal day"
            disabled={!nextDate || draft.status === "saving"}
            onClick={() => void navigateTo(nextDate)}
            title={nextDate ? `Go to ${nextDate}` : "No next entry"}
          >
            <ChevronRight size={16} />
          </Button>
        </div>

        <div className="row gap-2">
          <output className={`journal-save-status ${draft.status}`}>
            {statusLabel(draft.status, Boolean(draft.id))}
          </output>
          <Button
            type="button"
            className="row gap-2"
            disabled={!isDirty || draft.status === "saving"}
            onClick={() => void saveNow()}
          >
            <Save size={15} /> Save
          </Button>
        </div>
      </div>

      <div className="journal-meta-grid">
        <Field label="Title">
          <Input
            value={draft.title}
            onChange={(event) => updateDraft("title", event.target.value)}
            placeholder="Optional title"
            aria-label="Title"
          />
        </Field>
        <Field label="Mood">
          <Input
            type="number"
            min={1}
            max={5}
            value={draft.mood}
            onChange={(event) => updateDraft("mood", event.target.value)}
            placeholder="1-5"
            aria-label="Mood"
          />
        </Field>
        <Field label="Energy">
          <Input
            type="number"
            min={1}
            max={5}
            value={draft.energy}
            onChange={(event) => updateDraft("energy", event.target.value)}
            placeholder="1-5"
            aria-label="Energy"
          />
        </Field>
      </div>

      {draft.error && (
        <p className="journal-save-error" role="alert">
          {draft.error}
        </p>
      )}

      <Suspense fallback={<div className="journal-editor-loading">Loading editor...</div>}>
        <MDEditor
          value={draft.body}
          onChange={(value) => updateDraft("body", value ?? "")}
          height="calc(100vh - 320px)"
          minHeight={360}
          preview="edit"
          visibleDragbar={false}
          textareaProps={{
            "aria-label": "Journal entry",
            placeholder: "Start writing today's journal...",
          }}
        />
      </Suspense>
    </section>
  );
}

export const journalRoute = createRoute({
  getParentRoute: () => rootRoute,
  validateSearch: editSearch,
  path: "/journal",
  component: JournalPage,
});
