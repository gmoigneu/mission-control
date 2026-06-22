import { createRoute, lazyRouteComponent } from "@tanstack/react-router";
import { editSearch } from "../lib/useEditFromSearch";
import { rootRoute } from "./root";

export const meetingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  validateSearch: editSearch,
  path: "/meetings",
  component: lazyRouteComponent(() => import("./meetings.page"), "MeetingsPage"),
});
