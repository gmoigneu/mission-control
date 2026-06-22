import { makeResourceHooks } from "../../lib/hooks";
import { resource } from "../../lib/resource";
import { apiFetch } from "../../lib/api";
import { useAuthenticatedQueryEnabled } from "../../lib/auth";
import { useQuery } from "@tanstack/react-query";
import type { Project, ProjectCreate, ProjectUpdate } from "../../lib/types";

const projectsResource = resource<Project, ProjectCreate, ProjectUpdate>("/projects");

export const {
  useList: useProjects,
  useCreate: useCreateProject,
  useUpdate: useUpdateProject,
  useRemove: useDeleteProject,
} = makeResourceHooks<Project, ProjectCreate, ProjectUpdate>("projects", projectsResource);

export function useProjectBySlug(slug: string) {
  const enabled = useAuthenticatedQueryEnabled(Boolean(slug));
  return useQuery({
    queryKey: ["projects", "slug", slug],
    enabled,
    queryFn: () => apiFetch<Project>(`/projects/by-slug/${encodeURIComponent(slug)}`),
  });
}
