import { createRoute, useNavigate, useSearch } from "@tanstack/react-router";
import { lazy, Suspense, useCallback } from "react";
import { graphSearch, type GraphRouteState } from "../features/graph/graph-search";
import { AppShell } from "../components/AppShell";
import { RequireAuth } from "../components/RequireAuth";
import { rootRoute } from "./root";

const GraphExplorer = lazy(() =>
  import("../features/graph/GraphExplorer").then((mod) => ({ default: mod.GraphExplorer })),
);

export function GraphPage() {
  const search = useSearch({ from: "/graph" }) as GraphRouteState;
  const navigate = useNavigate({ from: "/graph" });

  const updateGraphSearch = useCallback((patch: GraphRouteState) => {
    const next = { ...search, ...patch };
    void navigate({
      to: "/graph",
      search: {
        node: next.node || undefined,
        context: next.context || undefined,
        depth: next.depth,
      },
      replace: true,
    } as unknown as Parameters<typeof navigate>[0]);
  }, [navigate, search]);

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
            <GraphExplorer
              node={search.node}
              context={search.context}
              depth={search.depth}
              onRouteStateChange={updateGraphSearch}
            />
          </Suspense>
        </div>
      </AppShell>
    </RequireAuth>
  );
}

export const graphRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/graph",
  validateSearch: graphSearch,
  component: GraphPage,
});
