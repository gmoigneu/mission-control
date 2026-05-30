import { createRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { ConfirmButton } from "../components/ConfirmButton";
import { DataTable } from "../components/DataTable";
import { RequireAuth } from "../components/RequireAuth";
import { Button, Card, Field, Input, Select } from "../components/ui";
import { useContexts } from "../features/contexts/api";
import { usePeople } from "../features/people/api";
import {
  useCreateRelationship,
  useDeleteRelationship,
  useRelationships,
  useUpdateRelationship,
} from "../features/relationships/api";
import type { Relationship } from "../lib/types";
import { rootRoute } from "./root";

interface FormState {
  from_person_id: string;
  to_person_id: string;
  type: string;
  context_id: string;
  since: string;
  notes: string;
}

const EMPTY_FORM: FormState = {
  from_person_id: "",
  to_person_id: "",
  type: "knows",
  context_id: "",
  since: "",
  notes: "",
};

/** Build a RelationshipCreate/RelationshipUpdate payload.
 * On create: omit empty optional FK/date fields entirely.
 * On update: send null for cleared optional FK/date fields so the backend can unset them.
 */
function buildPayload(form: FormState, isEdit: boolean) {
  return {
    from_person_id: form.from_person_id,
    to_person_id: form.to_person_id,
    type: form.type || "knows",
    ...(isEdit
      ? { context_id: form.context_id || null }
      : form.context_id ? { context_id: form.context_id } : {}),
    ...(isEdit
      ? { since: form.since || null }
      : form.since ? { since: form.since } : {}),
    ...(form.notes ? { notes: form.notes } : { notes: null }),
  };
}

export function RelationshipsPage() {
  const { data: relationships = [] } = useRelationships();
  const { data: people = [] } = usePeople();
  const { data: contexts = [] } = useContexts();
  const createRelationship = useCreateRelationship();
  const updateRelationship = useUpdateRelationship();
  const deleteRelationship = useDeleteRelationship();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);

  const personMap = Object.fromEntries(people.map((p) => [p.id, p.name]));

  function handleChange(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function handleSelectChange(key: keyof FormState) {
    return (value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleEdit(row: Relationship) {
    setEditingId(row.id);
    setForm({
      from_person_id: row.from_person_id,
      to_person_id: row.to_person_id,
      type: row.type,
      context_id: row.context_id ?? "",
      since: row.since ?? "",
      notes: row.notes ?? "",
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
      updateRelationship.mutate(
        { id: editingId, data: payload },
        {
          onSuccess: () => {
            setEditingId(null);
            setForm(EMPTY_FORM);
          },
        },
      );
    } else {
      createRelationship.mutate(payload, {
        onSuccess: () => setForm(EMPTY_FORM),
      });
    }
  }

  const columns = [
    { header: "From", cell: (row: Relationship) => personMap[row.from_person_id] ?? row.from_person_id },
    { header: "To", cell: (row: Relationship) => personMap[row.to_person_id] ?? row.to_person_id },
    { header: "Type", cell: (row: Relationship) => row.type },
    {
      header: "Actions",
      cell: (row: Relationship) => (
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => handleEdit(row)}
          >
            Edit
          </button>
          <ConfirmButton onConfirm={() => deleteRelationship.mutate(row.id)}>Delete</ConfirmButton>
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
            <h1 className="title">Relationships</h1>
            <p className="meta">
              <Link to="/activity" className="underline">
                Manage from the Activity page to undo changes.
              </Link>
            </p>
          </div>

          <Card>
            <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
              <Field label="From person">
                <Select
                  value={form.from_person_id}
                  onChange={handleSelectChange("from_person_id")}
                  options={people.map((p) => ({ value: p.id, label: p.name }))}
                  placeholder="— select —"
                />
              </Field>
              <Field label="To person">
                <Select
                  value={form.to_person_id}
                  onChange={handleSelectChange("to_person_id")}
                  options={people.map((p) => ({ value: p.id, label: p.name }))}
                  placeholder="— select —"
                />
              </Field>
              <Field label="Type">
                <Input
                  value={form.type}
                  onChange={handleChange("type")}
                  placeholder="knows"
                  aria-label="Type"
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
              <Field label="Since">
                <Input
                  type="date"
                  value={form.since}
                  onChange={handleChange("since")}
                  aria-label="Since"
                />
              </Field>
              <Field label="Notes">
                <Input
                  value={form.notes}
                  onChange={handleChange("notes")}
                  placeholder="Optional notes"
                  aria-label="Notes"
                />
              </Field>
              <div className="col-span-2 flex gap-2">
                <Button type="submit" disabled={!form.from_person_id || !form.to_person_id}>
                  {editingId ? "Save" : "Add"}
                </Button>
                {editingId && (
                  <Button type="button" onClick={handleCancel} className="ghost">
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </Card>

          <DataTable rows={relationships} columns={columns} empty="No relationships yet." />
        </div>
      </AppShell>
    </RequireAuth>
  );
}

export const relationshipsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/relationships",
  component: RelationshipsPage,
});
