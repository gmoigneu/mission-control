import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { editSearch } from "../lib/useEditFromSearch";
import { rootRoute } from "./root";

export const tasksRoute = createRoute({
  getParentRoute: () => rootRoute,
  validateSearch: editSearch,
  path: "/tasks",
  component: lazyRouteComponent(() => import("./tasks.page"), "TasksPage"),
});
