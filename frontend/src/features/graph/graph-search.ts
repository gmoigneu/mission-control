export interface GraphRouteState {
  node?: string;
  context?: string;
  depth?: 1 | 2;
}

export function graphSearch(s: Record<string, unknown>): GraphRouteState {
  const depth =
    s.depth === "1" || s.depth === 1
      ? 1
      : s.depth === "2" || s.depth === 2
        ? 2
        : undefined;
  return {
    node: typeof s.node === "string" ? s.node : undefined,
    context: typeof s.context === "string" ? s.context : undefined,
    depth,
  };
}
