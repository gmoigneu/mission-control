import { createRoute } from "@tanstack/react-router";
import { AppShell } from "../components/AppShell";
import { RequireAuth } from "../components/RequireAuth";
import { GraphExplorer } from "../features/graph/GraphExplorer";
import { rootRoute } from "./root";

export function GraphPage() {
  return (
    <RequireAuth>
      <AppShell>
        <div
          style={{
            padding: "24px 32px",
            display: "flex",
            flexDirection: "column",
            gap: 16,
            height: "calc(100vh - 0px)",
          }}
        >
          <h1 className="title">Graph</h1>
          <GraphExplorer />
        </div>
      </AppShell>
    </RequireAuth>
  );
}

export const graphRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/graph",
  component: GraphPage,
});
