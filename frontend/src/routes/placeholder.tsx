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
          <div
            style={{
              padding: "24px 32px",
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            <h1 className="title" style={{ textTransform: "capitalize" }}>
              {section}
            </h1>
            <p className="meta">Coming soon</p>
          </div>
        </AppShell>
      </RequireAuth>
    );
  },
});
