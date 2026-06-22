import { Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useReducer } from "react";
import { AppShell } from "../components/AppShell";
import { ConfirmButton } from "../components/ConfirmButton";
import { DataTable } from "../components/DataTable";
import { Pagination } from "../components/Pagination";
import { RequireAuth } from "../components/RequireAuth";
import { SidePanel } from "../components/SidePanel";
import { SlugField } from "../components/SlugField";
import { useHotkey } from "../lib/useHotkey";
import { resolvedSlug } from "../lib/slug";
import { Button, Field, Input, Select, Textarea } from "../components/ui";
import { useCompanies } from "../features/companies/api";
import { useContexts } from "../features/contexts/api";
import {
  useCreatePerson,
  useDeletePerson,
  usePeoplePage,
  useUpdatePerson,
} from "../features/people/api";
import { DEFAULT_PAGE_SIZE } from "../lib/pagination";
import type { Company, Person } from "../lib/types";

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

interface PeopleState {
  offset: number;
  search: string;
  form: FormState;
  editingId: string | null;
  panelOpen: boolean;
}

type PeopleAction =
  | { type: "setOffset"; offset: number }
  | { type: "setSearch"; search: string }
  | { type: "openNew" }
  | { type: "editPerson"; person: Person }
  | { type: "closePanel" }
  | { type: "updateForm"; key: keyof FormState; value: string };

function initialPeopleState(): PeopleState {
  return {
    offset: 0,
    search: "",
    form: EMPTY_FORM,
    editingId: null,
    panelOpen: false,
  };
}

function peopleReducer(state: PeopleState, action: PeopleAction): PeopleState {
  switch (action.type) {
    case "setOffset":
      return { ...state, offset: action.offset };
    case "setSearch":
      return { ...state, offset: 0, search: action.search };
    case "openNew":
      return { ...state, form: EMPTY_FORM, editingId: null, panelOpen: true };
    case "editPerson":
      return {
        ...state,
        editingId: action.person.id,
        form: {
          name: action.person.name,
          slug: action.person.slug,
          role: action.person.role ?? "",
          company_id: action.person.company_id ?? "",
          primary_context_id: action.person.primary_context_id ?? "",
          email: action.person.email ?? "",
          linkedin: action.person.linkedin ?? "",
          first_met: action.person.first_met ?? "",
          summary: action.person.summary ?? "",
        },
        panelOpen: true,
      };
    case "closePanel":
      return { ...state, form: EMPTY_FORM, editingId: null, panelOpen: false };
    case "updateForm":
      return { ...state, form: { ...state.form, [action.key]: action.value } };
  }
}

/** Build a PersonCreate/PersonUpdate payload.
 * On create: omit empty optional FK/date fields entirely.
 * On update: send null for cleared optional FK/date fields so the backend can unset them.
 */
function buildPayload(form: FormState, isEdit: boolean) {
  return {
    name: form.name,
    slug: resolvedSlug(form.slug, form.name),
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
  const [state, dispatch] = useReducer(peopleReducer, undefined, initialPeopleState);
  const { offset, search, form, editingId, panelOpen } = state;
  const query = search.trim();
  const { data: peoplePage } = usePeoplePage({
    limit: DEFAULT_PAGE_SIZE,
    offset,
    ...(query ? { q: query } : {}),
  });
  const people = peoplePage?.items ?? [];
  const { data: companies = [] } = useCompanies();
  const { data: contexts = [] } = useContexts();
  const createPerson = useCreatePerson();
  const updatePerson = useUpdatePerson();
  const deletePerson = useDeletePerson();

  useHotkey("c", handleNew, !panelOpen);

  function handleChange(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      dispatch({ type: "updateForm", key, value: e.target.value });
  }

  function handleSelectChange(key: keyof FormState) {
    return (value: string) => dispatch({ type: "updateForm", key, value });
  }

  function handleSearchChange(e: React.ChangeEvent<HTMLInputElement>) {
    dispatch({ type: "setSearch", search: e.target.value });
  }

  function handleNew() {
    dispatch({ type: "openNew" });
  }

  function handleEdit(row: Person) {
    dispatch({ type: "editPerson", person: row });
  }

  function handleClose() {
    dispatch({ type: "closePanel" });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = buildPayload(form, !!editingId);
    if (editingId) {
      updatePerson.mutate(
        { id: editingId, data: payload },
        { onSuccess: handleClose },
      );
    } else {
      createPerson.mutate(payload, { onSuccess: handleClose });
    }
  }

  const companyMap = Object.fromEntries(companies.map((c) => [c.id, c]));

  function renderCompany(companyId: string | null) {
    if (!companyId) return "";
    const company = companyMap[companyId] as Company | undefined;
    if (!company) return companyId;
    return (
      <Link
        to="/companies/$slug"
        params={{ slug: company.slug }}
        className="underline hover:text-gray-600"
      >
        {company.name}
      </Link>
    );
  }

  const columns = [
    {
      header: "Name",
      cell: (row: Person) => (
        <Link
          to="/people/$slug"
          params={{ slug: row.slug }}
          className="underline hover:text-gray-600"
        >
          {row.name}
        </Link>
      ),
    },
    { header: "Slug", cell: (row: Person) => row.slug },
    { header: "Role", cell: (row: Person) => row.role ?? "" },
    { header: "Company", cell: (row: Person) => renderCompany(row.company_id) },
    {
      header: "Actions",
      cell: (row: Person) => (
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="btn ghost sm"
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
        <div
          className="page"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          <div className="flex items-center justify-between">
            <h1 className="title">People</h1>
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
              placeholder="Search people"
              aria-label="Search people"
            />
          </form>

          <DataTable
            rows={people}
            columns={columns}
            empty={query ? `No people match "${query}".` : "No people yet."}
          />
          {peoplePage && (
            <Pagination
              page={peoplePage.page}
              onChange={(nextOffset) => dispatch({ type: "setOffset", offset: nextOffset })}
            />
          )}
        </div>

        <SidePanel
          open={panelOpen}
          onClose={handleClose}
          title={editingId ? "Edit person" : "New person"}
        >
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
            <Field label="Name">
              <Input
                value={form.name}
                onChange={handleChange("name")}
                placeholder="Jane Doe"
                aria-label="Name"
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
              <Textarea
                value={form.summary}
                onChange={handleChange("summary")}
                placeholder="Optional summary"
                aria-label="Summary"
                rows={5}
              />
            </Field>
            <SlugField
              value={form.slug}
              source={form.name}
              onChange={(value) => dispatch({ type: "updateForm", key: "slug", value })}
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
