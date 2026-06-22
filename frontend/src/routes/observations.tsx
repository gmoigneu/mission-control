import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { editSearch } from "../lib/useEditFromSearch";
import { rootRoute } from "./root";

export const observationsRoute = createRoute({
  getParentRoute: () => rootRoute,
  validateSearch: editSearch,
  path: "/observations",
  component: lazyRouteComponent(() => import("./observations.page"), "ObservationsPage"),
});
