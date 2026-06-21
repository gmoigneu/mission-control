import type { GraphNodeDetail } from "../../lib/types";

interface NodeInspectorProps {
  detail: GraphNodeDetail | undefined;
  loading: boolean;
  onSelectNode: (id: string) => void;
  onClose: () => void;
}

/** Map a graph node to its existing detail route, when one exists. */
function entityHref(detail: GraphNodeDetail): string | undefined {
  const slug = typeof detail.props.slug === "string" ? detail.props.slug : undefined;
  if (detail.label === "Person" && slug) return `/people/${slug}`;
  return undefined;
}

export function NodeInspector({ detail, loading, onSelectNode, onClose }: NodeInspectorProps) {
  const href = detail ? entityHref(detail) : undefined;

  return (
    <aside
      aria-label="Node details"
      style={{
        width: 280,
        flexShrink: 0,
        borderLeft: "1px solid #334155",
        padding: 16,
        overflowY: "auto",
      }}
    >
      <button type="button" onClick={onClose} aria-label="Close details" style={{ float: "right" }}>
        ×
      </button>

      {loading && <p>Loading…</p>}

      {!loading && detail && (
        <>
          <h3 style={{ marginTop: 0 }}>{detail.label}</h3>
          {href && (
            <p>
              <a href={href}>Open page</a>
            </p>
          )}

          <h4>Properties</h4>
          <dl>
            {Object.entries(detail.props).map(([k, v]) => (
              <div key={k} style={{ display: "flex", gap: 8 }}>
                <dt style={{ color: "#94a3b8", minWidth: 80 }}>{k}</dt>
                <dd style={{ margin: 0 }}>{String(v)}</dd>
              </div>
            ))}
          </dl>

          <h4>Relationships ({detail.rels.length})</h4>
          <ul style={{ listStyle: "none", padding: 0 }}>
            {detail.rels.map((r) => (
              <li key={`${r.rel}-${r.id}`}>
                <button
                  type="button"
                  onClick={() => onSelectNode(r.id)}
                  style={{ textAlign: "left", width: "100%" }}
                >
                  {r.dir === "out" ? "→" : "←"} {r.rel}: {r.name} ({r.label})
                </button>
              </li>
            ))}
          </ul>
        </>
      )}
    </aside>
  );
}
