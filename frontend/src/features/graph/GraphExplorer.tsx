import type { Core } from "cytoscape";
import {
  useCallback,
  useEffect,
  useEffectEvent,
  useMemo,
  useReducer,
  useRef,
  useState,
} from "react";
import { ConfirmButton } from "../../components/ConfirmButton";
import { useContexts } from "../contexts/api";
import { useGraphNeighborhood, useGraphSnapshot, useNodeDetail, useRebuildGraph } from "./api";
import { GraphControls } from "./GraphControls";
import { NodeInspector } from "./NodeInspector";
import { LAYOUTS, NODE_TYPES, stylesheet, type LayoutName } from "./cytoscape-config";
import { loadGraphEngine } from "./graph-engine";
import type { GraphRouteState } from "./graph-search";
import { snapshotToElements } from "./snapshot-to-elements";
import type { GraphNodeDetail } from "../../lib/types";

interface GraphExplorerProps extends GraphRouteState {
  onRouteStateChange: (patch: GraphRouteState) => void;
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

function initialGraphExplorerState(routeState: GraphRouteState): GraphExplorerState {
  return {
    context: routeState.context ?? "",
    types: allTypesOn(),
    layout: "fcose",
    search: "",
    selectedId: routeState.node,
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

function focusSelectedNode(cy: Core | null, selectedId: string | undefined) {
  if (!cy || !selectedId || !("getElementById" in cy)) return;
  const node = cy.getElementById(selectedId);
  if (node.length === 0) return;
  cy.nodes().unselect();
  node.select();
  cy.animate({ center: { eles: node }, zoom: 1.45 }, { duration: 250 });
}

export function GraphExplorer({
  node,
  context: routeContext,
  depth,
  onRouteStateChange,
}: GraphExplorerProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [cy, setCy] = useState<Core | null>(null);

  const [state, dispatch] = useReducer(
    graphExplorerReducer,
    { node, context: routeContext, depth },
    initialGraphExplorerState,
  );
  const { context, types, layout, search, selectedId } = state;

  const focusedMode = Boolean(selectedId && depth);
  const fullSnapshot = useGraphSnapshot(context || undefined, !focusedMode);
  const neighborhoodSnapshot = useGraphNeighborhood(selectedId, depth ?? 2, 120, focusedMode);
  const snapshot = focusedMode ? neighborhoodSnapshot : fullSnapshot;
  const contextsQuery = useContexts();
  const detail = useNodeDetail(selectedId);
  const rebuild = useRebuildGraph();

  const elements = useMemo(
    () => (snapshot.data ? snapshotToElements(snapshot.data) : []),
    [snapshot.data],
  );
  const fallbackDetail: GraphNodeDetail | undefined = useMemo(() => {
    const node = snapshot.data?.nodes.find((n) => n.id === selectedId);
    return node
      ? { id: node.id, label: node.label, props: node.props, rels: [] }
      : undefined;
  }, [selectedId, snapshot.data]);

  const selectNode = useCallback(
    (id?: string) => {
      dispatch({ type: "selectNode", id });
      onRouteStateChange({ node: id });
    },
    [onRouteStateChange],
  );
  const selectNodeFromGraph = useEffectEvent((id: string) => {
    dispatch({ type: "selectNode", id });
    onRouteStateChange({ node: id });
  });

  useEffect(() => {
    dispatch({ type: "setContext", context: routeContext ?? "" });
  }, [routeContext]);

  useEffect(() => {
    dispatch({ type: "selectNode", id: node });
  }, [node]);

  // Create/recreate the Cytoscape instance whenever the element set or layout changes.
  useEffect(() => {
    let canceled = false;
    let createdCy: Core | null = null;
    const container = containerRef.current;
    if (!container) return;

    void loadGraphEngine().then((cytoscape) => {
      if (canceled) return;
      const cy = cytoscape({ container, elements, style: stylesheet, layout: LAYOUTS[layout] });
      cy.on("tap", "node", (evt) => selectNodeFromGraph(evt.target.id()));
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

  useEffect(() => {
    focusSelectedNode(cy, selectedId);
  }, [cy, selectedId]);

  function runSearch() {
    const term = search.trim().toLowerCase();
    if (!cy || !term) return;
    const match = cy
      .nodes(":visible")
      .filter((n) => String(n.data("name") ?? "").toLowerCase().includes(term));
    if (match.length > 0) {
      cy.animate({ center: { eles: match[0] }, zoom: 1.5 }, { duration: 300 });
      selectNode(match[0].id());
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
        onContextChange={(nextContext) => {
          dispatch({ type: "setContext", context: nextContext });
          onRouteStateChange({ context: nextContext || undefined });
        }}
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
            detail={detail.data ?? fallbackDetail}
            loading={detail.isLoading}
            error={detail.isError}
            onSelectNode={selectNode}
            onClose={() => selectNode(undefined)}
          />
        )}
      </div>
    </div>
  );
}
