import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "./root";
import { tasksSearch } from "./tasks-search";

export const tasksRoute = createRoute({
  getParentRoute: () => rootRoute,
  validateSearch: tasksSearch,
  path: "/tasks",
  component: lazyRouteComponent(() => import("./tasks.page"), "TasksPage"),
});
