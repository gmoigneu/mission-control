import { createRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { ConfirmButton } from "../components/ConfirmButton";
import { DataTable } from "../components/DataTable";
import { RequireAuth } from "../components/RequireAuth";
import { SubjectPicker } from "../components/SubjectPicker";
import { Button, Card, Field, Input } from "../components/ui";
import { useCreateEntityLink, useDeleteEntityLink, useEntityLinks } from "../features/entityLinks/api";
import type { EntityLink } from "../lib/types";
import { rootRoute } from "./root";

interface FormState {
  from_type: string;
  from_id: string;
  to_type: string;
  to_id: string;
  kind: string;
}

const EMPTY_FORM: FormState = {
  from_type: "",
  from_id: "",
  to_type: "",
  to_id: "",
  kind: "related",
};

export function EntityLinksPage() {
  const { data: entityLinks = [] } = useEntityLinks();
  const createEntityLink = useCreateEntityLink();
  const deleteEntityLink = useDeleteEntityLink();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  function handleFromChange(type: string, id: string) {
    setForm((prev) => ({ ...prev, from_type: type, from_id: id }));
  }

  function handleToChange(type: string, id: string) {
    setForm((prev) => ({ ...prev, to_type: type, to_id: id }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createEntityLink.mutate(
      {
        from_type: form.from_type,
        from_id: form.from_id,
        to_type: form.to_type,
        to_id: form.to_id,
        kind: form.kind || "related",
      },
      { onSuccess: () => setForm(EMPTY_FORM) },
    );
  }

  const columns = [
    {
      header: "From",
      cell: (row: EntityLink) => `${row.from_type} / ${row.from_id.slice(0, 8)}`,
    },
    {
      header: "To",
      cell: (row: EntityLink) => `${row.to_type} / ${row.to_id.slice(0, 8)}`,
    },
    { header: "Kind", cell: (row: EntityLink) => row.kind },
    {
      header: "Actions",
      cell: (row: EntityLink) => (
        <ConfirmButton onConfirm={() => deleteEntityLink.mutate(row.id)}>Delete</ConfirmButton>
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
            <h1 className="title">Entity Links</h1>
            <p className="meta">
              <Link to="/activity" className="underline">
                Manage from the Activity page to undo changes.
              </Link>
            </p>
          </div>

          <Card>
            <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
              <Field label="From">
                <SubjectPicker
                  type={form.from_type}
                  id={form.from_id}
                  onChange={handleFromChange}
                />
              </Field>
              <Field label="To">
                <SubjectPicker
                  type={form.to_type}
                  id={form.to_id}
                  onChange={handleToChange}
                />
              </Field>
              <Field label="Kind">
                <Input
                  value={form.kind}
                  onChange={(e) => setForm((prev) => ({ ...prev, kind: e.target.value }))}
                  placeholder="related"
                  aria-label="Kind"
                />
              </Field>
              <div className="col-span-2">
                <Button
                  type="submit"
                  disabled={!form.from_type || !form.from_id || !form.to_type || !form.to_id}
                >
                  Add
                </Button>
              </div>
            </form>
          </Card>

          <DataTable rows={entityLinks} columns={columns} empty="No entity links yet." />
        </div>
      </AppShell>
    </RequireAuth>
  );
}

export const entityLinksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/entity-links",
  component: EntityLinksPage,
});
