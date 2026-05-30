import { createRoute } from "@tanstack/react-router";
import { AppShell } from "../components/AppShell";
import { RequireAuth } from "../components/RequireAuth";
import { rootRoute } from "./root";

export const placeholderRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/$section",
  component: function ComingSoon() {
    const { section } = placeholderRoute.useParams();
    return (
      <RequireAuth>
        <AppShell>
          <div className="p-8">
            <h1 className="text-2xl font-semibold capitalize">{section}</h1>
            <p className="mt-2 text-gray-500">Coming soon</p>
          </div>
        </AppShell>
      </RequireAuth>
    );
  },
});
