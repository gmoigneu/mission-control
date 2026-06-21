import cytoscape from "cytoscape";
import type { Core } from "cytoscape";
import fcose from "cytoscape-fcose";
import { useEffect, useMemo, useRef, useState } from "react";
import { ConfirmButton } from "../../components/ConfirmButton";
import { useContexts } from "../contexts/api";
import { useGraphSnapshot, useNodeDetail, useRebuildGraph } from "./api";
import { GraphControls } from "./GraphControls";
import { NodeInspector } from "./NodeInspector";
import { LAYOUTS, NODE_TYPES, stylesheet, type LayoutName } from "./cytoscape-config";
import { snapshotToElements } from "./snapshot-to-elements";

let fcoseRegistered = false;
function ensureFcose() {
  if (!fcoseRegistered) {
    cytoscape.use(fcose as cytoscape.Ext);
    fcoseRegistered = true;
  }
}

const allTypesOn = (): Record<string, boolean> =>
  Object.fromEntries(NODE_TYPES.map((t) => [t, true]));

export function GraphExplorer() {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const cyRef = useRef<Core | null>(null);

  const [context, setContext] = useState("");
  const [types, setTypes] = useState<Record<string, boolean>>(allTypesOn);
  const [layout, setLayout] = useState<LayoutName>("fcose");
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | undefined>(undefined);

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
    const container = containerRef.current;
    if (!container) return;
    ensureFcose();
    const cy = cytoscape({ container, elements, style: stylesheet, layout: LAYOUTS[layout] });
    cy.on("tap", "node", (evt) => setSelectedId(evt.target.id()));
    cyRef.current = cy;
    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [elements, layout]);

  // Apply node-type visibility filters.
  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.batch(() => {
      for (const t of NODE_TYPES) {
        cy.nodes(`[label = "${t}"]`).style("display", types[t] ? "element" : "none");
      }
    });
  }, [types, elements]);

  // Resize the canvas when the inspector panel opens/closes (the container width changes).
  useEffect(() => {
    cyRef.current?.resize();
  }, [selectedId]);

  function runSearch() {
    const cy = cyRef.current;
    const term = search.trim().toLowerCase();
    if (!cy || !term) return;
    const match = cy
      .nodes(":visible")
      .filter((n) => String(n.data("name") ?? "").toLowerCase().includes(term));
    if (match.length > 0) {
      cy.animate({ center: { eles: match[0] }, zoom: 1.5 }, { duration: 300 });
      setSelectedId(match[0].id());
    }
  }

  const isEmpty = snapshot.isSuccess && elements.length === 0;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12, height: "100%" }}>
      <GraphControls
        types={types}
        onToggleType={(t) => setTypes((prev) => ({ ...prev, [t]: !prev[t] }))}
        contexts={(contextsQuery.data ?? []).map((c) => ({ slug: c.slug, name: c.name }))}
        context={context}
        onContextChange={setContext}
        search={search}
        onSearchChange={setSearch}
        onSearchSubmit={runSearch}
        layout={layout}
        onLayoutChange={setLayout}
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
            onSelectNode={setSelectedId}
            onClose={() => setSelectedId(undefined)}
          />
        )}
      </div>
    </div>
  );
}
