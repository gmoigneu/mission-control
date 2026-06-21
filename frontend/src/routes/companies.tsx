import { createRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { ConfirmButton } from "../components/ConfirmButton";
import { DataTable } from "../components/DataTable";
import { RequireAuth } from "../components/RequireAuth";
import { SidePanel } from "../components/SidePanel";
import { SlugField } from "../components/SlugField";
import { editSearch, useEditFromSearch } from "../lib/useEditFromSearch";
import { useHotkey } from "../lib/useHotkey";
import { resolvedSlug } from "../lib/slug";
import { Button, Field, Input, Textarea } from "../components/ui";
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
  const [search, setSearch] = useState("");
  const query = search.trim();
  const { data: companies = [] } = useCompanies(query ? { q: query } : undefined);
  useEditFromSearch(companies, handleEdit);
  const createCompany = useCreateCompany();
  const updateCompany = useUpdateCompany();
  const deleteCompany = useDeleteCompany();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  useHotkey("c", handleNew, !panelOpen);

  function handleChange(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    setSearch(e.target.value);
  }

  function handleNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setPanelOpen(true);
  }

  function handleEdit(row: Company) {
    setEditingId(row.id);
    setForm({
      name: row.name,
      slug: row.slug,
      domain: row.domain ?? "",
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
    const payload = {
      name: form.name,
      slug: resolvedSlug(form.slug, form.name),
      ...(form.domain ? { domain: form.domain } : { domain: null }),
      ...(form.notes ? { notes: form.notes } : { notes: null }),
    };
    if (editingId) {
      updateCompany.mutate(
        { id: editingId, data: payload },
        { onSuccess: handleClose },
      );
    } else {
      createCompany.mutate(payload, { onSuccess: handleClose });
    }
  }

  const columns = [
    {
      header: "Name",
      cell: (row: Company) => (
        <Link
          to="/companies/$slug"
          params={{ slug: row.slug }}
          className="underline hover:text-gray-600"
        >
          {row.name}
        </Link>
      ),
    },
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
          className="page"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          <div className="flex items-center justify-between">
            <h1 className="title">Companies</h1>
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

          <form role="search" className="row gap-2" onSubmit={(e) => e.preventDefault()}>
            <Input
              type="search"
              value={search}
              onChange={handleSearchChange}
              placeholder="Search companies"
              aria-label="Search companies"
            />
          </form>

          <DataTable
            rows={companies}
            columns={columns}
            empty={query ? `No companies match "${query}".` : "No companies yet."}
          />
        </div>

        <SidePanel
          open={panelOpen}
          onClose={handleClose}
          title={editingId ? "Edit company" : "New company"}
        >
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
            <Field label="Name">
              <Input
                value={form.name}
                onChange={handleChange("name")}
                placeholder="Acme Corp"
                aria-label="Name"
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
              <Textarea
                value={form.notes}
                onChange={handleChange("notes")}
                placeholder="Optional notes"
                aria-label="Notes"
                rows={5}
              />
            </Field>
            <SlugField
              value={form.slug}
              source={form.name}
              onChange={(value) => setForm((prev) => ({ ...prev, slug: value }))}
            />
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

export const companiesRoute = createRoute({
  getParentRoute: () => rootRoute,
  validateSearch: editSearch,
  path: "/companies",
  component: CompaniesPage,
});
