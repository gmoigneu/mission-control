import { createRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { ConfirmButton } from "../components/ConfirmButton";
import { DataTable } from "../components/DataTable";
import { RequireAuth } from "../components/RequireAuth";
import { Button, Card, Field, Input } from "../components/ui";
import { useCompanies, useCreateCompany, useDeleteCompany, useUpdateCompany } from "../features/companies/api";
import type { Company } from "../lib/types";
import { rootRoute } from "./root";

interface FormState {
  name: string;
  slug: string;
  domain: string;
  notes: string;
}

const EMPTY_FORM: FormState = { name: "", slug: "", domain: "", notes: "" };

export function CompaniesPage() {
  const { data: companies = [] } = useCompanies();
  const createCompany = useCreateCompany();
  const updateCompany = useUpdateCompany();
  const deleteCompany = useDeleteCompany();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);

  function handleChange(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function handleEdit(row: Company) {
    setEditingId(row.id);
    setForm({
      name: row.name,
      slug: row.slug,
      domain: row.domain ?? "",
      notes: row.notes ?? "",
    });
  }

  function handleCancel() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      name: form.name,
      slug: form.slug,
      ...(form.domain ? { domain: form.domain } : { domain: null }),
      ...(form.notes ? { notes: form.notes } : { notes: null }),
    };
    if (editingId) {
      updateCompany.mutate(
        { id: editingId, data: payload },
        {
          onSuccess: () => {
            setEditingId(null);
            setForm(EMPTY_FORM);
          },
        },
      );
    } else {
      createCompany.mutate(payload, {
        onSuccess: () => setForm(EMPTY_FORM),
      });
    }
  }

  const columns = [
    { header: "Name", cell: (row: Company) => row.name },
    { header: "Slug", cell: (row: Company) => row.slug },
    { header: "Domain", cell: (row: Company) => row.domain ?? "" },
    {
      header: "Actions",
      cell: (row: Company) => (
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="btn ghost sm"
            onClick={() => handleEdit(row)}
          >
            Edit
          </button>
          <ConfirmButton onConfirm={() => deleteCompany.mutate(row.id)}>Delete</ConfirmButton>
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
            <h1 className="title">Companies</h1>
            <p className="meta">
              <Link to="/activity" className="underline">
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
                  placeholder="Acme Corp"
                  aria-label="Name"
                  required
                />
              </Field>
              <Field label="Slug">
                <Input
                  value={form.slug}
                  onChange={handleChange("slug")}
                  placeholder="acme-corp"
                  aria-label="Slug"
                  required
                />
              </Field>
              <Field label="Domain">
                <Input
                  value={form.domain}
                  onChange={handleChange("domain")}
                  placeholder="acme.com"
                  aria-label="Domain"
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
                <Button type="submit">{editingId ? "Save" : "Add"}</Button>
                {editingId && (
                  <Button type="button" onClick={handleCancel} className="ghost">
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </Card>

          <DataTable rows={companies} columns={columns} empty="No companies yet." />
        </div>
      </AppShell>
    </RequireAuth>
  );
}

export const companiesRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/companies",
  component: CompaniesPage,
});
