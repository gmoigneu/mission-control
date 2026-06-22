import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { editSearch } from "../lib/useEditFromSearch";
import { rootRoute } from "./root";

export const projectsRoute = createRoute({
  getParentRoute: () => rootRoute,
  validateSearch: editSearch,
  path: "/projects",
  component: lazyRouteComponent(() => import("./projects.page"), "ProjectsPage"),
});
