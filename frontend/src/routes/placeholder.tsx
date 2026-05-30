import { createRoute } from "@tanstack/react-router";
import { rootRoute } from "./root";

function ComingSoon() {
  return <div className="p-8 text-gray-500">Coming soon</div>;
}

export const placeholderRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$section",
  component: ComingSoon,
});
