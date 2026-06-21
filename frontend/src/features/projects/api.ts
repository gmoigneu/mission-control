import { makeResourceHooks } from "../../lib/hooks";
import { resource } from "../../lib/resource";
import type { Project, ProjectCreate, ProjectUpdate } from "../../lib/types";

const projectsResource = resource<Project, ProjectCreate, ProjectUpdate>("/projects");

export const {
  useList: useProjects,
  useCreate: useCreateProject,
  useUpdate: useUpdateProject,
  useRemove: useDeleteProject,
} = makeResourceHooks<Project, ProjectCreate, ProjectUpdate>("projects", projectsResource);
