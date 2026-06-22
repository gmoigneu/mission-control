import { createRoute, Link, useParams } from "@tanstack/react-router";
import { AppShell } from "../components/AppShell";
import { RequireAuth } from "../components/RequireAuth";
import { Card } from "../components/ui";
import { useContexts } from "../features/contexts/api";
import { EmbeddedGraph } from "../features/graph/EmbeddedGraph";
import { useProjectBySlug } from "../features/projects/api";
import type { Project } from "../lib/types";
import { rootRoute } from "./root";

function DetailField({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div>
      <div className="label" style={{ marginBottom: 4 }}>
        {label}
      </div>
      <div style={{ fontSize: 13 }}>{value ?? <span style={{ color: "var(--fg-faint)" }}>-</span>}</div>
    </div>
  );
}

function ProjectDetailContent({ project }: { project: Project }) {
  const { data: contexts = [] } = useContexts();
  const context = contexts.find((c) => c.id === project.context_id);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">{project.title}</h1>
          <p className="text-sm text-gray-400">{project.status}</p>
        </div>
        <Link to="/projects" className="text-sm underline hover:text-gray-600">
          Back to Projects
        </Link>
      </div>

      <Card>
        <div className="grid grid-cols-3 gap-4">
          <DetailField label="Slug" value={project.slug} />
          <DetailField label="Context" value={context?.name ?? project.context_id} />
          <DetailField label="Purpose" value={project.purpose} />
          <DetailField label="Body" value={project.body} />
        </div>
      </Card>

      <EmbeddedGraph nodeId={project.id} title="Project map" depth={2} />
    </div>
  );
}

export function ProjectDetailPage() {
  const { slug } = useParams({ from: "/projects/$slug" });
  const { data: project, isLoading } = useProjectBySlug(slug);

  let body: React.ReactNode;
  if (isLoading) {
    body = (
      <div className="p-6">
        <p style={{ fontSize: 13, color: "var(--fg-dim)" }}>Loading...</p>
      </div>
    );
  } else if (!project) {
    body = (
      <div className="p-6 space-y-2">
        <h1 className="text-xl font-semibold">Project not found</h1>
        <Link to="/projects" className="text-sm underline hover:text-gray-600">
          Back to Projects
        </Link>
      </div>
    );
  } else {
    body = <ProjectDetailContent project={project} />;
  }

  return (
    <RequireAuth>
      <AppShell>{body}</AppShell>
    </RequireAuth>
  );
}

export const projectDetailRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/projects/$slug",
  component: ProjectDetailPage,
});
