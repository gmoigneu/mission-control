import type { ElementDefinition } from "cytoscape";
import type { GraphSnapshot } from "../../lib/types";

/** Convert a backend graph snapshot into Cytoscape element definitions.
 * Edges with an endpoint missing from the node set are dropped defensively. */
export function snapshotToElements(snapshot: GraphSnapshot): ElementDefinition[] {
  const ids = new Set(snapshot.nodes.map((n) => n.id));
  const nodes: ElementDefinition[] = snapshot.nodes.map((n) => ({
    data: { id: n.id, label: n.label, name: n.name },
  }));
  const edges: ElementDefinition[] = [];
  snapshot.edges.forEach((e, i) => {
    if (ids.has(e.source) && ids.has(e.target)) {
      edges.push({
        data: {
          id: `e${i}-${e.source}-${e.target}`,
          source: e.source,
          target: e.target,
          label: e.type,
        },
      });
    }
  });
  return [...nodes, ...edges];
}
