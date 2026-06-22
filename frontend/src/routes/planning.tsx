import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "./root";

export const planningRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/planning",
  component: lazyRouteComponent(() => import("./planning.page"), "PlanningPage"),
});
