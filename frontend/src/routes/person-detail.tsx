import { createRoute, Link } from "@tanstack/react-router";
import { AppShell } from "../components/AppShell";
import { DataTable } from "../components/DataTable";
import { RequireAuth } from "../components/RequireAuth";
import { Card } from "../components/ui";
import { useCompanies } from "../features/companies/api";
import { useContexts } from "../features/contexts/api";
import { EmbeddedGraph } from "../features/graph/EmbeddedGraph";
import { useNeighbors } from "../features/graph/api";
import { useObservations } from "../features/observations/api";
import { usePersonBySlug } from "../features/people/api";
import type { Company, Observation, Person } from "../lib/types";
import { rootRoute } from "./root";

/** A single labelled field in the person summary card. */
function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="label" style={{ marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 13 }}>{value ?? <span style={{ color: "var(--fg-faint)" }}>—</span>}</div>
    </div>
  );
}

/** Observations timeline + mini relationship graph for a resolved person. */
function PersonDetailContent({
  person,
  company,
  contextName,
}: {
  person: Person;
  company: Company | null;
  contextName: string | null;
}) {
  // Observations filtered to this person (subject_type=person + subject_id).
  const { data: observations = [] } = useObservations({
    subject_type: "person",
    subject_id: person.id,
  });
  // Mini relationship graph via POST /graph/query (neighbors intent).
  const { data: neighbors = [], isLoading: neighborsLoading } = useNeighbors(person.id);

  const sortedObservations = observations.toSorted((a, b) => {
    const da = a.date ?? a.created_at;
    const db = b.date ?? b.created_at;
    return db.localeCompare(da);
  });

  const observationColumns = [
    { header: "Date", cell: (row: Observation) => row.date ?? row.created_at.slice(0, 10) },
    { header: "Kind", cell: (row: Observation) => row.kind },
    { header: "Body", cell: (row: Observation) => row.body },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{person.name}</h1>
          {person.role && <p className="text-sm text-gray-400">{person.role}</p>}
        </div>
        <Link to="/people" className="text-sm underline hover:text-gray-600">
          ← Back to People
        </Link>
      </div>

      <Card>
        <div className="grid grid-cols-3 gap-4">
          <DetailField label="Slug" value={person.slug} />
          <DetailField label="Role" value={person.role} />
          <DetailField
            label="Company"
            value={
              company ? (
                <Link
                  to="/companies/$slug"
                  params={{ slug: company.slug }}
                  className="underline hover:text-gray-600"
                >
                  {company.name}
                </Link>
              ) : null
            }
          />
          <DetailField label="Primary context" value={contextName} />
          <DetailField
            label="Email"
            value={person.email ? <a href={`mailto:${person.email}`}>{person.email}</a> : null}
          />
          <DetailField
            label="LinkedIn"
            value={
              person.linkedin ? (
                <a href={person.linkedin} target="_blank" rel="noreferrer">
                  Profile
                </a>
              ) : null
            }
          />
          <DetailField label="First met" value={person.first_met} />
          <DetailField label="Summary" value={person.summary} />
        </div>
      </Card>

      <EmbeddedGraph nodeId={person.id} title="Person map" depth={2} />

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Connections</h2>
        <Card>
          {neighborsLoading ? (
            <p style={{ fontSize: 13, color: "var(--fg-dim)" }}>Loading graph…</p>
          ) : neighbors.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--fg-dim)" }}>No graph connections yet.</p>
          ) : (
            <ul style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {neighbors.map((n) => {
                const connectionName = n.label_text ?? n.id;
                let connection: React.ReactNode = <span>{connectionName}</span>;
                if (n.label === "Person" && n.slug) {
                  connection = (
                    <Link
                      to="/people/$slug"
                      params={{ slug: n.slug }}
                      className="underline hover:text-gray-600"
                    >
                      {connectionName}
                    </Link>
                  );
                } else if (n.label === "Company" && n.slug) {
                  connection = (
                    <Link
                      to="/companies/$slug"
                      params={{ slug: n.slug }}
                      className="underline hover:text-gray-600"
                    >
                      {connectionName}
                    </Link>
                  );
                }
                return (
                  <li key={`${n.rel}-${n.id}`} className="row gap-2" style={{ fontSize: 13 }}>
                    <span
                      className="badge"
                      style={{ border: "1px solid var(--line)", color: "var(--fg-dim)" }}
                    >
                      {n.rel}
                    </span>
                    <span style={{ color: "var(--fg-faint)" }}>{n.label}</span>
                    {connection}
                  </li>
                );
              })}
            </ul>
          )}
        </Card>
      </section>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">Observations</h2>
        <DataTable
          rows={sortedObservations}
          columns={observationColumns}
          empty="No observations for this person yet."
        />
      </section>
    </div>
  );
}

export function PersonDetailPage() {
  const { slug } = personDetailRoute.useParams();
  const { data: person, isLoading } = usePersonBySlug(slug);
  const { data: companies = [] } = useCompanies();
  const { data: contexts = [] } = useContexts();

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <div className="p-6">
        <p style={{ fontSize: 13, color: "var(--fg-dim)" }}>Loading…</p>
      </div>
    );
  } else if (!person) {
    body = (
      <div className="p-6 space-y-2">
        <h1 className="text-xl font-semibold">Person not found</h1>
        <Link to="/people" className="text-sm underline hover:text-gray-600">
          ← Back to People
        </Link>
      </div>
    );
  } else {
    const company = person.company_id
      ? (companies.find((c) => c.id === person.company_id) ?? null)
      : null;
    const contextName = person.primary_context_id
      ? (contexts.find((c) => c.id === person.primary_context_id)?.name ?? person.primary_context_id)
      : null;
    body = (
      <PersonDetailContent person={person} company={company} contextName={contextName} />
    );
  }

  return (
    <RequireAuth>
      <AppShell>{body}</AppShell>
    </RequireAuth>
  );
}

export const personDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/people/$slug",
  component: PersonDetailPage,
});
