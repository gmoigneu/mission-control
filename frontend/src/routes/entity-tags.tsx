import { createRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { ConfirmButton } from "../components/ConfirmButton";
import { DataTable } from "../components/DataTable";
import { RequireAuth } from "../components/RequireAuth";
import { SubjectPicker } from "../components/SubjectPicker";
import { Button, Card, Field, Select } from "../components/ui";
import { useDeleteEntityTag, useCreateEntityTag, useEntityTags } from "../features/entityTags/api";
import { useTags } from "../features/tags/api";
import type { EntityTag } from "../lib/types";
import { rootRoute } from "./root";

interface FormState {
  tag_id: string;
  subject_type: string;
  subject_id: string;
}

const EMPTY_FORM: FormState = {
  tag_id: "",
  subject_type: "",
  subject_id: "",
};

export function EntityTagsPage() {
  const { data: entityTags = [] } = useEntityTags();
  const { data: tags = [] } = useTags();
  const createEntityTag = useCreateEntityTag();
  const deleteEntityTag = useDeleteEntityTag();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  const tagMap = Object.fromEntries(tags.map((t) => [t.id, t.name]));

  function handleSubjectChange(type: string, id: string) {
    setForm((prev) => ({ ...prev, subject_type: type, subject_id: id }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createEntityTag.mutate(
      {
        tag_id: form.tag_id,
        subject_type: form.subject_type,
        subject_id: form.subject_id,
      },
      { onSuccess: () => setForm(EMPTY_FORM) },
    );
  }

  const columns = [
    { header: "Tag", cell: (row: EntityTag) => tagMap[row.tag_id] ?? row.tag_id },
    { header: "Subject type", cell: (row: EntityTag) => row.subject_type },
    { header: "Subject id", cell: (row: EntityTag) => row.subject_id.slice(0, 8) },
    {
      header: "Actions",
      cell: (row: EntityTag) => (
        <ConfirmButton onConfirm={() => deleteEntityTag.mutate(row.id)}>Delete</ConfirmButton>
      ),
    },
  ];

  return (
    <RequireAuth>
      <AppShell>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">Entity Tags</h1>
            <p className="text-sm text-gray-400">
              <Link to="/activity" className="underline hover:text-gray-600">
                Manage from the Activity page to undo changes.
              </Link>
            </p>
          </div>

          <Card>
            <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
              <Field label="Tag">
                <Select
                  value={form.tag_id}
                  onChange={(v) => setForm((prev) => ({ ...prev, tag_id: v }))}
                  options={tags.map((t) => ({ value: t.id, label: t.name }))}
                  placeholder="— select tag —"
                />
              </Field>
              <Field label="Subject">
                <SubjectPicker
                  type={form.subject_type}
                  id={form.subject_id}
                  onChange={handleSubjectChange}
                />
              </Field>
              <div className="col-span-2">
                <Button
                  type="submit"
                  disabled={!form.tag_id || !form.subject_type || !form.subject_id}
                >
                  Add
                </Button>
              </div>
            </form>
          </Card>

          <DataTable rows={entityTags} columns={columns} empty="No entity tags yet." />
        </div>
      </AppShell>
    </RequireAuth>
  );
}

export const entityTagsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/entity-tags",
  component: EntityTagsPage,
});
