import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { editSearch } from "../lib/useEditFromSearch";
import { rootRoute } from "./root";

export const habitsRoute = createRoute({
  getParentRoute: () => rootRoute,
  validateSearch: editSearch,
  path: "/habits",
  component: lazyRouteComponent(() => import("./habits.page"), "HabitsPage"),
});
