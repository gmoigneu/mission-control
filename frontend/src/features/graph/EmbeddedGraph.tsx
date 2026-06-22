import type { Core } from "cytoscape";
import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { NodeInspector } from "./NodeInspector";
import { LAYOUTS, stylesheet } from "./cytoscape-config";
import { loadGraphEngine } from "./graph-engine";
import { snapshotToElements } from "./snapshot-to-elements";
import { useGraphNeighborhood, useNodeDetail } from "./api";
import type { GraphNodeDetail } from "../../lib/types";

interface EmbeddedGraphProps {
  nodeId: string;
  title: string;
  depth?: 1 | 2;
}

function focusNode(cy: Core | null, nodeId: string | undefined, zoom = 1.3) {
  if (!cy || !nodeId) return;
  const node = cy.getElementById(nodeId);
  if (node.length === 0) return;
  cy.nodes().unselect();
  node.select();
  cy.animate({ center: { eles: node }, zoom }, { duration: 250 });
}

export function EmbeddedGraph({ nodeId, title, depth = 2 }: EmbeddedGraphProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [cy, setCy] = useState<Core | null>(null);
  const [selection, setSelection] = useState<{ rootId: string; selectedId: string } | null>(null);
  const selectedId = selection?.rootId === nodeId ? selection.selectedId : nodeId;
  const snapshot = useGraphNeighborhood(nodeId, depth, 60);
  const detail = useNodeDetail(selectedId);
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

  const selectNode = useCallback((id: string) => {
    setSelection({ rootId: nodeId, selectedId: id });
  }, [nodeId]);

  useEffect(() => {
    let canceled = false;
    let createdCy: Core | null = null;
    const container = containerRef.current;
    if (!container || elements.length === 0) return;

    void loadGraphEngine().then((cytoscape) => {
      if (canceled) return;
      const nextCy = cytoscape({
        container,
        elements,
        style: stylesheet,
        layout: LAYOUTS.concentric,
        userZoomingEnabled: false,
        userPanningEnabled: false,
        boxSelectionEnabled: false,
      });
      nextCy.on("tap", "node", (evt) => selectNode(evt.target.id()));
      createdCy = nextCy;
      setCy(nextCy);
      focusNode(nextCy, nodeId, 1.15);
    });

    return () => {
      canceled = true;
      if (createdCy) createdCy.destroy();
      setCy(null);
    };
  }, [elements, nodeId, selectNode]);

  useEffect(() => {
    focusNode(cy, selectedId, 1.15);
  }, [cy, selectedId]);

  return (
    <section className="space-y-2" aria-label={title}>
      <div className="flex items-center justify-between gap-4">
        <h2 className="text-lg font-medium">{title}</h2>
        <Link
          to="/graph"
          search={{ node: nodeId, depth }}
          className="text-sm underline hover:text-gray-600"
        >
          Open in graph
        </Link>
      </div>

      {snapshot.isLoading && (
        <p style={{ fontSize: 13, color: "var(--fg-dim)" }}>Loading graph...</p>
      )}
      {snapshot.isError && (
        <p role="alert" style={{ fontSize: 13, color: "var(--danger)" }}>
          Could not load graph.
        </p>
      )}
      {snapshot.isSuccess && elements.length === 0 && (
        <p style={{ fontSize: 13, color: "var(--fg-dim)" }}>No graph connections yet.</p>
      )}

      {elements.length > 0 && (
        <div style={{ display: "grid", gridTemplateColumns: "minmax(0, 1fr) 280px", gap: 12 }}>
          <div
            ref={containerRef}
            data-testid="embedded-graph-canvas"
            style={{
              minHeight: 280,
              border: "1px solid var(--line)",
              borderRadius: 8,
              overflow: "hidden",
            }}
          />
          <NodeInspector
            detail={detail.data ?? fallbackDetail}
            loading={detail.isLoading}
            error={detail.isError}
            onSelectNode={selectNode}
            onClose={() => setSelection(null)}
          />
        </div>
      )}
    </section>
  );
}
