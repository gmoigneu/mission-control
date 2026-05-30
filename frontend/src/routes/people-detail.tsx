import { createRoute, Link, useParams } from "@tanstack/react-router";
import { AppShell } from "../components/AppShell";
import { DataTable } from "../components/DataTable";
import { RequireAuth } from "../components/RequireAuth";
import { Card } from "../components/ui";
import { useCompanies } from "../features/companies/api";
import { useContexts } from "../features/contexts/api";
import { useEntityLinks } from "../features/entityLinks/api";
import { type GraphNeighbor, useNeighbors } from "../features/graph/api";
import { useObservations } from "../features/observations/api";
import { usePeople } from "../features/people/api";
import type { EntityLink, Observation } from "../lib/types";
import { rootRoute } from "./root";

function PersonField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <span className="label" style={{ display: "block", marginBottom: "2px" }}>{label}</span>
      <span className="text-sm">{value || <span className="text-gray-400">—</span>}</span>
    </div>
  );
}

export function PersonDetailPage() {
  const { slug } = useParams({ from: "/people/$slug" });
  const { data: people = [] } = usePeople();
  const { data: companies = [] } = useCompanies();
  const { data: contexts = [] } = useContexts();
  const { data: observations = [] } = useObservations();
  const { data: entityLinks = [] } = useEntityLinks();

  const person = people.find((p) => p.slug === slug);
  const { data: neighbors = [] } = useNeighbors(person?.id);

  if (!person) {
    return (
      <RequireAuth>
        <AppShell>
          <div className="p-6 space-y-4">
            <Link to="/people" className="text-sm underline hover:text-gray-600">
              ← Back to People
            </Link>
            <p className="text-sm text-gray-400">Person not found.</p>
          </div>
        </AppShell>
      </RequireAuth>
    );
  }

  const company = companies.find((c) => c.id === person.company_id);
  const context = contexts.find((c) => c.id === person.primary_context_id);

  const personObservations = observations
    .filter((o) => o.subject_type === "person" && o.subject_id === person.id)
    .sort((a, b) => (b.date ?? b.created_at).localeCompare(a.date ?? a.created_at));

  const personLinks = entityLinks.filter(
    (l) =>
      (l.from_type === "person" && l.from_id === person.id) ||
      (l.to_type === "person" && l.to_id === person.id),
  );

  const observationColumns = [
    {
      header: "Date",
      cell: (row: Observation) => (row.date ?? row.created_at.slice(0, 10)),
    },
    { header: "Kind", cell: (row: Observation) => row.kind },
    { header: "Body", cell: (row: Observation) => row.body },
    { header: "Source", cell: (row: Observation) => row.source ?? "" },
  ];

  const linkColumns = [
    {
      header: "From",
      cell: (row: EntityLink) => `${row.from_type}:${row.from_id}`,
    },
    { header: "Kind", cell: (row: EntityLink) => row.kind },
    {
      header: "To",
      cell: (row: EntityLink) => `${row.to_type}:${row.to_id}`,
    },
  ];

  const neighborColumns = [
    { header: "Type", cell: (row: GraphNeighbor) => row.label },
    { header: "Relationship", cell: (row: GraphNeighbor) => row.rel },
    { header: "Name", cell: (row: GraphNeighbor) => row.label_text },
  ];

  return (
    <RequireAuth>
      <AppShell>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">{person.name}</h1>
            <Link to="/people" className="text-sm underline hover:text-gray-600">
              ← Back to People
            </Link>
          </div>

          <Card>
            <div className="grid grid-cols-2 gap-4">
              <PersonField label="Role" value={person.role} />
              <PersonField label="Company" value={company?.name ?? person.company_id} />
              <PersonField label="Primary context" value={context?.name ?? person.primary_context_id} />
              <PersonField label="Email" value={person.email} />
              <PersonField label="LinkedIn" value={person.linkedin} />
              <PersonField label="First met" value={person.first_met} />
              <PersonField label="Summary" value={person.summary} />
            </div>
          </Card>

          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Observations</h2>
            <DataTable
              rows={personObservations}
              columns={observationColumns}
              empty="No observations for this person."
            />
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Relationship graph</h2>
            <DataTable
              rows={neighbors}
              columns={neighborColumns}
              empty="No connected entities."
            />
          </div>

          <div className="space-y-2">
            <h2 className="text-lg font-semibold">Linked entities</h2>
            <DataTable rows={personLinks} columns={linkColumns} empty="No linked entities." />
          </div>
        </div>
      </AppShell>
    </RequireAuth>
  );
}

export const peopleDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/people/$slug",
  component: PersonDetailPage,
});
