import { createRoute, Link, useParams } from "@tanstack/react-router";
import { AppShell } from "../components/AppShell";
import { DataTable } from "../components/DataTable";
import { RequireAuth } from "../components/RequireAuth";
import { Card } from "../components/ui";
import { useCompanyBySlug } from "../features/companies/api";
import { usePeople } from "../features/people/api";
import type { Company, Person } from "../lib/types";
import { rootRoute } from "./root";

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

function domainHref(domain: string) {
  return domain.startsWith("http://") || domain.startsWith("https://")
    ? domain
    : `https://${domain}`;
}

function CompanyDetailContent({ company }: { company: Company }) {
  const { data: people = [], isLoading: peopleLoading } = usePeople({
    company_id: company.id,
    limit: "200",
  });

  const peopleColumns = [
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
    { header: "Role", cell: (row: Person) => row.role ?? "" },
    {
      header: "Email",
      cell: (row: Person) => (row.email ? <a href={`mailto:${row.email}`}>{row.email}</a> : ""),
    },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{company.name}</h1>
          {company.domain && <p className="text-sm text-gray-400">{company.domain}</p>}
        </div>
        <Link to="/companies" className="text-sm underline hover:text-gray-600">
          ← Back to Companies
        </Link>
      </div>

      <Card>
        <div className="grid grid-cols-3 gap-4">
          <DetailField label="Slug" value={company.slug} />
          <DetailField
            label="Domain"
            value={
              company.domain ? (
                <a href={domainHref(company.domain)} target="_blank" rel="noreferrer">
                  {company.domain}
                </a>
              ) : null
            }
          />
          <DetailField label="Notes" value={company.notes} />
        </div>
      </Card>

      <section className="space-y-2">
        <h2 className="text-lg font-medium">People</h2>
        {peopleLoading ? (
          <p style={{ fontSize: 13, color: "var(--fg-dim)" }}>Loading people…</p>
        ) : (
          <DataTable
            rows={people}
            columns={peopleColumns}
            empty="No known people at this company yet."
          />
        )}
      </section>
    </div>
  );
}

export function CompanyDetailPage() {
  const { slug } = useParams({ from: "/companies/$slug" });
  const { data: company, isLoading } = useCompanyBySlug(slug);

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <div className="p-6">
        <p style={{ fontSize: 13, color: "var(--fg-dim)" }}>Loading…</p>
      </div>
    );
  } else if (!company) {
    body = (
      <div className="p-6 space-y-2">
        <h1 className="text-xl font-semibold">Company not found</h1>
        <Link to="/companies" className="text-sm underline hover:text-gray-600">
          ← Back to Companies
        </Link>
      </div>
    );
  } else {
    body = <CompanyDetailContent company={company} />;
  }

  return (
    <RequireAuth>
      <AppShell>{body}</AppShell>
    </RequireAuth>
  );
}

export const companyDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/companies/$slug",
  component: CompanyDetailPage,
});
