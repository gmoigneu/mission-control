import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { rootRoute } from "./root";

export const peopleRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/people",
  component: lazyRouteComponent(() => import("./people.page"), "PeoplePage"),
});
