import { createRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { ConfirmButton } from "../components/ConfirmButton";
import { DataTable } from "../components/DataTable";
import { RequireAuth } from "../components/RequireAuth";
import { Button, Card, Field, Input, Select } from "../components/ui";
import { useCompanies } from "../features/companies/api";
import { useContexts } from "../features/contexts/api";
import {
  PEOPLE_PAGE_SIZE,
  useCreatePerson,
  useDeletePerson,
  usePeoplePage,
  useUpdatePerson,
} from "../features/people/api";
import type { Person } from "../lib/types";
import { rootRoute } from "./root";

interface FormState {
  name: string;
  slug: string;
  role: string;
  company_id: string;
  primary_context_id: string;
  email: string;
  linkedin: string;
  first_met: string;
  summary: string;
}

const EMPTY_FORM: FormState = {
  name: "",
  slug: "",
  role: "",
  company_id: "",
  primary_context_id: "",
  email: "",
  linkedin: "",
  first_met: "",
  summary: "",
};

/** Build a PersonCreate/PersonUpdate payload.
 * On create: omit empty optional FK/date fields entirely.
 * On update: send null for cleared optional FK/date fields so the backend can unset them.
 */
function buildPayload(form: FormState, isEdit: boolean) {
  return {
    name: form.name,
    slug: form.slug,
    ...(form.role ? { role: form.role } : { role: null }),
    ...(isEdit
      ? { company_id: form.company_id || null }
      : form.company_id ? { company_id: form.company_id } : {}),
    ...(isEdit
      ? { primary_context_id: form.primary_context_id || null }
      : form.primary_context_id ? { primary_context_id: form.primary_context_id } : {}),
    ...(form.email ? { email: form.email } : { email: null }),
    ...(form.linkedin ? { linkedin: form.linkedin } : { linkedin: null }),
    ...(isEdit
      ? { first_met: form.first_met || null }
      : form.first_met ? { first_met: form.first_met } : {}),
    ...(form.summary ? { summary: form.summary } : { summary: null }),
  };
}

export function PeoplePage() {
  const [offset, setOffset] = useState(0);
  const { data: peoplePage } = usePeoplePage({ limit: PEOPLE_PAGE_SIZE, offset });
  const people = peoplePage?.data ?? [];
  const total = peoplePage?.total ?? 0;
  const hasPrev = offset > 0;
  const hasNext = offset + PEOPLE_PAGE_SIZE < total;
  const rangeEnd = total === 0 ? 0 : Math.min(offset + people.length, total);
  const rangeStart = total === 0 ? 0 : offset + 1;
  const { data: companies = [] } = useCompanies();
  const { data: contexts = [] } = useContexts();
  const createPerson = useCreatePerson();
  const updatePerson = useUpdatePerson();
  const deletePerson = useDeletePerson();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);

  function handleChange(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function handleSelectChange(key: keyof FormState) {
    return (value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleEdit(row: Person) {
    setEditingId(row.id);
    setForm({
      name: row.name,
      slug: row.slug,
      role: row.role ?? "",
      company_id: row.company_id ?? "",
      primary_context_id: row.primary_context_id ?? "",
      email: row.email ?? "",
      linkedin: row.linkedin ?? "",
      first_met: row.first_met ?? "",
      summary: row.summary ?? "",
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
      updatePerson.mutate(
        { id: editingId, data: payload },
        {
          onSuccess: () => {
            setEditingId(null);
            setForm(EMPTY_FORM);
          },
        },
      );
    } else {
      createPerson.mutate(payload, {
        onSuccess: () => setForm(EMPTY_FORM),
      });
    }
  }

  const companyMap = Object.fromEntries(companies.map((c) => [c.id, c.name]));

  const columns = [
    { header: "Name", cell: (row: Person) => row.name },
    { header: "Slug", cell: (row: Person) => row.slug },
    { header: "Role", cell: (row: Person) => row.role ?? "" },
    { header: "Company", cell: (row: Person) => (row.company_id ? (companyMap[row.company_id] ?? row.company_id) : "") },
    {
      header: "Actions",
      cell: (row: Person) => (
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="text-xs text-gray-500 hover:text-gray-900"
            onClick={() => handleEdit(row)}
          >
            Edit
          </button>
          <ConfirmButton onConfirm={() => deletePerson.mutate(row.id)}>Delete</ConfirmButton>
        </div>
      ),
    },
  ];

  return (
    <RequireAuth>
      <AppShell>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">People</h1>
            <p className="text-sm text-gray-400">
              <Link to="/activity" className="underline hover:text-gray-600">
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
                  placeholder="Jane Doe"
                  aria-label="Name"
                  required
                />
              </Field>
              <Field label="Slug">
                <Input
                  value={form.slug}
                  onChange={handleChange("slug")}
                  placeholder="jane-doe"
                  aria-label="Slug"
                  required
                />
              </Field>
              <Field label="Role">
                <Input
                  value={form.role}
                  onChange={handleChange("role")}
                  placeholder="Engineer"
                  aria-label="Role"
                />
              </Field>
              <Field label="Company">
                <Select
                  value={form.company_id}
                  onChange={handleSelectChange("company_id")}
                  options={companies.map((c) => ({ value: c.id, label: c.name }))}
                  placeholder="— none —"
                />
              </Field>
              <Field label="Primary context">
                <Select
                  value={form.primary_context_id}
                  onChange={handleSelectChange("primary_context_id")}
                  options={contexts.map((c) => ({ value: c.id, label: c.name }))}
                  placeholder="— none —"
                />
              </Field>
              <Field label="Email">
                <Input
                  type="email"
                  value={form.email}
                  onChange={handleChange("email")}
                  placeholder="jane@example.com"
                  aria-label="Email"
                />
              </Field>
              <Field label="LinkedIn">
                <Input
                  value={form.linkedin}
                  onChange={handleChange("linkedin")}
                  placeholder="https://linkedin.com/in/jane-doe"
                  aria-label="LinkedIn"
                />
              </Field>
              <Field label="First met">
                <Input
                  type="date"
                  value={form.first_met}
                  onChange={handleChange("first_met")}
                  aria-label="First met"
                />
              </Field>
              <Field label="Summary">
                <Input
                  value={form.summary}
                  onChange={handleChange("summary")}
                  placeholder="Optional summary"
                  aria-label="Summary"
                />
              </Field>
              <div className="col-span-2 flex gap-2">
                <Button type="submit">{editingId ? "Save" : "Add"}</Button>
                {editingId && (
                  <Button type="button" onClick={handleCancel} className="bg-gray-400 hover:bg-gray-500">
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </Card>

          <DataTable rows={people} columns={columns} empty="No people yet." />
          <div className="flex items-center justify-between text-sm text-gray-500">
            <span>
              {rangeStart}–{rangeEnd} of {total}
            </span>
            <div className="flex gap-2">
              <Button
                type="button"
                disabled={!hasPrev}
                onClick={() => setOffset((o) => Math.max(0, o - PEOPLE_PAGE_SIZE))}
                className="bg-gray-400 hover:bg-gray-500 disabled:opacity-40"
              >
                Previous
              </Button>
              <Button
                type="button"
                disabled={!hasNext}
                onClick={() => setOffset((o) => o + PEOPLE_PAGE_SIZE)}
                className="bg-gray-400 hover:bg-gray-500 disabled:opacity-40"
              >
                Next
              </Button>
            </div>
          </div>
        </div>
      </AppShell>
    </RequireAuth>
  );
}

export const peopleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/people",
  component: PeoplePage,
});
