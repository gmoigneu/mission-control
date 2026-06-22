import { createRoute } from "@tanstack/react-router";
import { lazy, Suspense } from "react";
import { AppShell } from "../components/AppShell";
import { RequireAuth } from "../components/RequireAuth";
import { rootRoute } from "./root";

const GraphExplorer = lazy(() =>
  import("../features/graph/GraphExplorer").then((mod) => ({ default: mod.GraphExplorer })),
);

export function GraphPage() {
  return (
    <RequireAuth>
      <AppShell>
        <div
          className="page"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
            height: "calc(100vh - 0px)",
          }}
        >
          <h1 className="title">Graph</h1>
          <Suspense fallback={<output aria-live="polite">Loading graph tools...</output>}>
            <GraphExplorer />
          </Suspense>
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
