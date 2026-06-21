import { createRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { ConfirmButton } from "../components/ConfirmButton";
import { DataTable } from "../components/DataTable";
import { RequireAuth } from "../components/RequireAuth";
import { SidePanel } from "../components/SidePanel";
import { editSearch, useEditFromSearch } from "../lib/useEditFromSearch";
import { useHotkey } from "../lib/useHotkey";
import { Button, Field, Input, Select, Textarea } from "../components/ui";
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

function derivedPersonName(id: string) {
  const compactId = id.length > 12 ? id.slice(0, 8) : id;
  return `Unknown person ${compactId}`;
}

export function RelationshipsPage() {
  const [searchText, setSearchText] = useState("");
  const searchQuery = searchText.trim();
  const { data: relationships = [] } = useRelationships(
    searchQuery ? { q: searchQuery } : undefined,
  );
  useEditFromSearch(relationships, handleEdit);
  const { data: people = [] } = usePeople();
  const { data: contexts = [] } = useContexts();
  const createRelationship = useCreateRelationship();
  const updateRelationship = useUpdateRelationship();
  const deleteRelationship = useDeleteRelationship();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  useHotkey("c", handleNew, !panelOpen);

  const personMap = Object.fromEntries(people.map((p) => [p.id, p]));

  function personReference(row: Relationship, side: "from" | "to") {
    const personId = side === "from" ? row.from_person_id : row.to_person_id;
    const person = personMap[personId];
    const name =
      side === "from"
        ? (row.from_person_name ?? person?.name ?? derivedPersonName(personId))
        : (row.to_person_name ?? person?.name ?? derivedPersonName(personId));
    const slug =
      side === "from" ? (row.from_person_slug ?? person?.slug) : (row.to_person_slug ?? person?.slug);

    if (!slug) return <span>{name}</span>;

    return (
      <Link
        to="/people/$slug"
        params={{ slug }}
        className="underline hover:text-gray-600"
      >
        {name}
      </Link>
    );
  }

  function handleChange(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function handleSelectChange(key: keyof FormState) {
    return (value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setPanelOpen(true);
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
    setPanelOpen(true);
  }

  function handleClose() {
    setPanelOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = buildPayload(form, !!editingId);
    if (editingId) {
      updateRelationship.mutate(
        { id: editingId, data: payload },
        { onSuccess: handleClose },
      );
    } else {
      createRelationship.mutate(payload, { onSuccess: handleClose });
    }
  }

  const columns = [
    { header: "From", cell: (row: Relationship) => personReference(row, "from") },
    { header: "To", cell: (row: Relationship) => personReference(row, "to") },
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
          className="page"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          <div className="flex items-center justify-between">
            <h1 className="title">Relationships</h1>
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

          <search className="flex items-center gap-3">
            <Input
              type="search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search by person name"
              aria-label="Search relationships"
            />
          </search>

          <DataTable rows={relationships} columns={columns} empty="No relationships yet." />
        </div>

        <SidePanel
          open={panelOpen}
          onClose={handleClose}
          title={editingId ? "Edit relationship" : "New relationship"}
        >
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
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
              <Textarea
                value={form.notes}
                onChange={handleChange("notes")}
                placeholder="Optional notes"
                aria-label="Notes"
                rows={5}
              />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" disabled={!form.from_person_id || !form.to_person_id}>
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

export const relationshipsRoute = createRoute({
  getParentRoute: () => rootRoute,
  validateSearch: editSearch,
  path: "/relationships",
  component: RelationshipsPage,
});
