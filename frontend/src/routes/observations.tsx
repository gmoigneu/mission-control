import { createRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { ConfirmButton } from "../components/ConfirmButton";
import { DataTable } from "../components/DataTable";
import { RequireAuth } from "../components/RequireAuth";
import { SidePanel } from "../components/SidePanel";
import { useHotkey } from "../lib/useHotkey";
import { SubjectPicker } from "../components/SubjectPicker";
import { Button, Field, Input, Select } from "../components/ui";
import {
  useCreateObservation,
  useDeleteObservation,
  useObservations,
  useUpdateObservation,
} from "../features/observations/api";
import type { Observation } from "../lib/types";
import { rootRoute } from "./root";

const KIND_OPTIONS = [
  { value: "observation", label: "observation" },
  { value: "preference", label: "preference" },
  { value: "fact", label: "fact" },
  { value: "open_loop", label: "open_loop" },
  { value: "decision", label: "decision" },
  { value: "key_point", label: "key_point" },
  { value: "open_question", label: "open_question" },
];

interface FormState {
  subject_type: string;
  subject_id: string;
  kind: string;
  body: string;
  date: string;
  source: string;
}

const EMPTY_FORM: FormState = {
  subject_type: "",
  subject_id: "",
  kind: "observation",
  body: "",
  date: "",
  source: "",
};

function buildPayload(form: FormState) {
  return {
    subject_type: form.subject_type,
    subject_id: form.subject_id,
    body: form.body,
    kind: form.kind || "observation",
    ...(form.date ? { date: form.date } : {}),
    ...(form.source ? { source: form.source } : {}),
  };
}

export function ObservationsPage() {
  const { data: observations = [] } = useObservations();
  const createObservation = useCreateObservation();
  const updateObservation = useUpdateObservation();
  const deleteObservation = useDeleteObservation();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  useHotkey("c", handleNew, !panelOpen);

  function handleChange(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function handleSelectChange(key: keyof FormState) {
    return (value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleSubjectChange(type: string, id: string) {
    setForm((prev) => ({ ...prev, subject_type: type, subject_id: id }));
  }

  function handleNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setPanelOpen(true);
  }

  function handleEdit(row: Observation) {
    setEditingId(row.id);
    setForm({
      subject_type: row.subject_type,
      subject_id: row.subject_id,
      kind: row.kind,
      body: row.body,
      date: row.date ?? "",
      source: row.source ?? "",
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
    const payload = buildPayload(form);
    if (editingId) {
      updateObservation.mutate(
        { id: editingId, data: payload },
        { onSuccess: handleClose },
      );
    } else {
      createObservation.mutate(payload, { onSuccess: handleClose });
    }
  }

  const columns = [
    { header: "Subject", cell: (row: Observation) => row.subject_type },
    { header: "Kind", cell: (row: Observation) => row.kind },
    {
      header: "Body",
      cell: (row: Observation) =>
        row.body.length > 60 ? `${row.body.slice(0, 60)}…` : row.body,
    },
    {
      header: "Actions",
      cell: (row: Observation) => (
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => handleEdit(row)}
          >
            Edit
          </button>
          <ConfirmButton onConfirm={() => deleteObservation.mutate(row.id)}>Delete</ConfirmButton>
        </div>
      ),
    },
  ];

  return (
    <RequireAuth>
      <AppShell>
        <div
          style={{
            padding: "24px 32px",
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          <div className="flex items-center justify-between">
            <h1 className="title">Observations</h1>
            <div className="flex items-center gap-4">
              <p className="meta">
                <Link to="/activity" className="underline">
                  Manage from the Activity page to undo changes.
                </Link>
              </p>
              <Button type="button" onClick={handleNew} className="row gap-2">
                <Plus size={15} /> Create
              </Button>
            </div>
          </div>

          <DataTable rows={observations} columns={columns} empty="No observations yet." />
        </div>

        <SidePanel
          open={panelOpen}
          onClose={handleClose}
          title={editingId ? "Edit observation" : "New observation"}
        >
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
            <Field label="Subject">
              <SubjectPicker
                type={form.subject_type}
                id={form.subject_id}
                onChange={handleSubjectChange}
              />
            </Field>
            <Field label="Kind">
              <Select
                value={form.kind}
                onChange={handleSelectChange("kind")}
                options={KIND_OPTIONS}
              />
            </Field>
            <Field label="Body">
              <Input
                value={form.body}
                onChange={handleChange("body")}
                placeholder="Observation body"
                aria-label="Body"
                required
              />
            </Field>
            <Field label="Date">
              <Input
                type="date"
                value={form.date}
                onChange={handleChange("date")}
                aria-label="Date"
              />
            </Field>
            <Field label="Source">
              <Input
                value={form.source}
                onChange={handleChange("source")}
                placeholder="Optional source"
                aria-label="Source"
              />
            </Field>
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={!form.subject_type || !form.subject_id || !form.body}
              >
                {editingId ? "Save" : "Add"}
              </Button>
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

export const observationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/observations",
  component: ObservationsPage,
});
