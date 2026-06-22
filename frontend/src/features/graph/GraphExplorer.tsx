import type { Core, Ext } from "cytoscape";
import { useEffect, useMemo, useReducer, useRef, useState } from "react";
import { ConfirmButton } from "../../components/ConfirmButton";
import { useContexts } from "../contexts/api";
import { useGraphSnapshot, useNodeDetail, useRebuildGraph } from "./api";
import { GraphControls } from "./GraphControls";
import { NodeInspector } from "./NodeInspector";
import { LAYOUTS, NODE_TYPES, stylesheet, type LayoutName } from "./cytoscape-config";
import { snapshotToElements } from "./snapshot-to-elements";

let fcoseRegistered = false;
async function loadGraphEngine() {
  const [{ default: cytoscape }, { default: fcose }] = await Promise.all([
    import("cytoscape"),
    import("cytoscape-fcose"),
  ]);

  if (!fcoseRegistered) {
    cytoscape.use(fcose as Ext);
    fcoseRegistered = true;
  }

  return cytoscape;
}

const allTypesOn = (): Record<string, boolean> =>
  Object.fromEntries(NODE_TYPES.map((t) => [t, true]));

interface GraphExplorerState {
  context: string;
  types: Record<string, boolean>;
  layout: LayoutName;
  search: string;
  selectedId?: string;
}

type GraphExplorerAction =
  | { type: "setContext"; context: string }
  | { type: "toggleType"; nodeType: string }
  | { type: "setLayout"; layout: LayoutName }
  | { type: "setSearch"; search: string }
  | { type: "selectNode"; id?: string };

function initialGraphExplorerState(): GraphExplorerState {
  return {
    context: "",
    types: allTypesOn(),
    layout: "fcose",
    search: "",
    selectedId: undefined,
  };
}

function graphExplorerReducer(
  state: GraphExplorerState,
  action: GraphExplorerAction,
): GraphExplorerState {
  switch (action.type) {
    case "setContext":
      return { ...state, context: action.context };
    case "toggleType":
      return {
        ...state,
        types: { ...state.types, [action.nodeType]: !state.types[action.nodeType] },
      };
    case "setLayout":
      return { ...state, layout: action.layout };
    case "setSearch":
      return { ...state, search: action.search };
    case "selectNode":
      return { ...state, selectedId: action.id };
  }
}

export function GraphExplorer() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [cy, setCy] = useState<Core | null>(null);

  const [state, dispatch] = useReducer(
    graphExplorerReducer,
    undefined,
    initialGraphExplorerState,
  );
  const { context, types, layout, search, selectedId } = state;

  const snapshot = useGraphSnapshot(context || undefined);
  const contextsQuery = useContexts();
  const detail = useNodeDetail(selectedId);
  const rebuild = useRebuildGraph();

  const elements = useMemo(
    () => (snapshot.data ? snapshotToElements(snapshot.data) : []),
    [snapshot.data],
  );

  // Create/recreate the Cytoscape instance whenever the element set or layout changes.
  useEffect(() => {
    let canceled = false;
    let createdCy: Core | null = null;
    const container = containerRef.current;
    if (!container) return;

    void loadGraphEngine().then((cytoscape) => {
      if (canceled) return;
      const cy = cytoscape({ container, elements, style: stylesheet, layout: LAYOUTS[layout] });
      cy.on("tap", "node", (evt) => dispatch({ type: "selectNode", id: evt.target.id() }));
      createdCy = cy;
      setCy(cy);
    });

    return () => {
      canceled = true;
      if (createdCy) createdCy.destroy();
      setCy(null);
    };
  }, [elements, layout]);

  // Apply node-type visibility filters.
  useEffect(() => {
    if (!cy) return;
    cy.batch(() => {
      for (const t of NODE_TYPES) {
        cy.nodes(`[label = "${t}"]`).style("display", types[t] ? "element" : "none");
      }
    });
  }, [types, elements, cy]);

  // Resize the canvas when the inspector panel opens/closes (the container width changes).
  useEffect(() => {
    cy?.resize();
  }, [selectedId, cy]);

  function runSearch() {
    const term = search.trim().toLowerCase();
    if (!cy || !term) return;
    const match = cy
      .nodes(":visible")
      .filter((n) => String(n.data("name") ?? "").toLowerCase().includes(term));
    if (match.length > 0) {
      cy.animate({ center: { eles: match[0] }, zoom: 1.5 }, { duration: 300 });
      dispatch({ type: "selectNode", id: match[0].id() });
    }
  }

  const isEmpty = snapshot.isSuccess && elements.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <GraphControls
        types={types}
        onToggleType={(t) => dispatch({ type: "toggleType", nodeType: t })}
        contexts={(contextsQuery.data ?? []).map((c) => ({ slug: c.slug, name: c.name }))}
        context={context}
        onContextChange={(nextContext) =>
          dispatch({ type: "setContext", context: nextContext })
        }
        search={search}
        onSearchChange={(nextSearch) => dispatch({ type: "setSearch", search: nextSearch })}
        onSearchSubmit={runSearch}
        layout={layout}
        onLayoutChange={(nextLayout) => dispatch({ type: "setLayout", layout: nextLayout })}
        onRebuild={() => rebuild.mutate()}
        rebuilding={rebuild.isPending}
      />

      {snapshot.data?.truncated && (
        <output>
          Showing the first {snapshot.data.nodes.length} nodes — filter by context to narrow the view.
        </output>
      )}
      {snapshot.isLoading && <output>Loading graph…</output>}
      {snapshot.isError && (
        <div role="alert">
          Couldn't load the graph.{" "}
          <button type="button" onClick={() => snapshot.refetch()}>
            Retry
          </button>
        </div>
      )}
      {isEmpty && (
        <output>
          The graph is empty.{" "}
          <ConfirmButton onConfirm={() => rebuild.mutate()} disabled={rebuild.isPending}>
            Rebuild graph
          </ConfirmButton>
        </output>
      )}

      <div style={{ display: "flex", flex: 1, minHeight: 480, gap: 12 }}>
        <div
          ref={containerRef}
          data-testid="graph-canvas"
          style={{
            flex: 1,
            minWidth: 0,
            minHeight: 480,
            overflow: "hidden",
            border: "1px solid #334155",
            borderRadius: 8,
          }}
        />
        {selectedId && (
          <NodeInspector
            detail={detail.data}
            loading={detail.isLoading}
            onSelectNode={(id) => dispatch({ type: "selectNode", id })}
            onClose={() => dispatch({ type: "selectNode", id: undefined })}
          />
        )}
      </div>
    </div>
  );
}
