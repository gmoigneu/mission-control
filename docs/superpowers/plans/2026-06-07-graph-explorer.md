# Graph Explorer Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a read-only `/graph` page that renders the whole Neo4j projection as an interactive Cytoscape.js node-link diagram with type/context filtering, search, layout switching, a node-detail side panel, and a rebuild action.

**Architecture:** Two additive backend GET endpoints (`/graph/full`, `/graph/node/{id}`) backed by pure `Runner`-based Cypher helpers; a frontend `features/graph` module that maps the snapshot to Cytoscape elements (pure, tested), renders the canvas via the `cytoscape` core library through a `ref`+`useEffect` (no React wrapper), and exposes controls + a side inspector. Reuses the existing `/admin/rebuild-graph` endpoint.

**Tech Stack:** Backend — FastAPI, Neo4j async driver (via the existing `Runner` abstraction), pytest. Frontend — React 19, TanStack Router/Query, `cytoscape` + `cytoscape-fcose`, Vitest + Testing Library.

**Reference spec:** `docs/superpowers/specs/2026-06-07-graph-explorer-design.md`

**Working directory:** the worktree at `.claude/worktrees/feat+graph-explorer`. Run backend commands from `backend/`, frontend from `frontend/`. Backend tests need the already-running Postgres+Neo4j containers; the test DB is `mc_test`.

---

## File Structure

**Backend**
- Modify `backend/app/graph/query.py` — add `full_graph()` and `node_detail()` helpers.
- Modify `backend/app/api/graph.py` — add a `get_runner` dependency + `GET /graph/full` and `GET /graph/node/{node_id}`.
- Create `backend/tests/test_graph_full_query.py` — helper unit tests (FakeRunner-based).
- Create `backend/tests/test_graph_full_api.py` — endpoint tests (auth + dependency override).

**Frontend**
- Modify `frontend/package.json` — add `cytoscape`, `cytoscape-fcose`.
- Create `frontend/src/types/cytoscape-fcose.d.ts` — module shim (no published types).
- Modify `frontend/src/lib/types.ts` — add `GraphFullNode`, `GraphEdge`, `GraphSnapshot`, `GraphRel`, `GraphNodeDetail`.
- Create `frontend/src/features/graph/snapshot-to-elements.ts` (+ `.test.ts`) — pure mapper.
- Create `frontend/src/features/graph/cytoscape-config.ts` (+ `.test.ts`) — palette, stylesheet, layouts.
- Modify `frontend/src/features/graph/api.ts` (+ create `api.test.tsx`) — snapshot/detail/rebuild hooks.
- Create `frontend/src/features/graph/GraphControls.tsx` (+ `.test.tsx`).
- Create `frontend/src/features/graph/NodeInspector.tsx` (+ `.test.tsx`).
- Create `frontend/src/features/graph/GraphExplorer.tsx` — Cytoscape orchestration.
- Create `frontend/src/routes/graph.tsx` (+ `.test.tsx`) — the route/page.
- Modify `frontend/src/router.tsx` — register `graphRoute`.
- Modify `frontend/src/components/AppShell.tsx` — add the "Graph" nav entry.

---

## Task 1: Backend graph query helpers

**Files:**
- Modify: `backend/app/graph/query.py`
- Test: `backend/tests/test_graph_full_query.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_graph_full_query.py`:

```python
"""Tests for the full-graph and node-detail query helpers (Neo4j-free)."""
from __future__ import annotations

from app.graph.query import full_graph, node_detail


class MapRunner:
    """Routes each call to a handler keyed by a substring of the cypher."""

    def __init__(self, routes: list[tuple[str, list[dict]]]) -> None:
        # routes: list of (substring, rows). First matching substring wins.
        self.routes = routes
        self.calls: list[tuple[str, dict]] = []

    async def __call__(self, cypher: str, params: dict) -> list[dict]:
        self.calls.append((cypher, params))
        for needle, rows in self.routes:
            if needle in cypher:
                return list(rows)
        return []


async def test_full_graph_unfiltered_returns_nodes_and_edges() -> None:
    runner = MapRunner(
        [
            ("AS source", [{"source": "a", "target": "b", "type": "KNOWS", "props": {}}]),
            ("MATCH (n)", [
                {"id": "a", "label": "Person", "name": "Alice", "props": {"id": "a"}},
                {"id": "b", "label": "Person", "name": "Bob", "props": {"id": "b"}},
            ]),
        ]
    )
    result = await full_graph(runner, context=None, limit=5000)
    assert {n["id"] for n in result["nodes"]} == {"a", "b"}
    assert result["edges"][0]["source"] == "a"
    assert result["truncated"] is False
    # edges query must constrain to the returned ids
    edge_call = next(c for c in runner.calls if "AS source" in c[0])
    assert edge_call[1]["ids"] == ["a", "b"]


async def test_full_graph_sets_truncated_when_limit_hit() -> None:
    rows = [{"id": str(i), "label": "Task", "name": str(i), "props": {}} for i in range(3)]
    runner = MapRunner([("AS source", []), ("MATCH (n)", rows)])
    result = await full_graph(runner, context=None, limit=3)
    assert result["truncated"] is True


async def test_full_graph_context_filter_uses_slug_and_does_not_truncate() -> None:
    runner = MapRunner(
        [
            ("AS source", []),
            ("Context {slug", [{"id": "c", "label": "Context", "name": "Work", "props": {}}]),
        ]
    )
    result = await full_graph(runner, context="work", limit=5000)
    assert result["truncated"] is False
    node_call = next(c for c in runner.calls if "Context {slug" in c[0])
    assert node_call[1]["slug"] == "work"


async def test_full_graph_skips_edge_query_when_no_nodes() -> None:
    runner = MapRunner([("AS source", []), ("MATCH (n)", [])])
    result = await full_graph(runner, context=None, limit=10)
    assert result["nodes"] == []
    assert result["edges"] == []
    assert all("AS source" not in c[0] for c in runner.calls)


async def test_node_detail_returns_props_and_filters_null_rels() -> None:
    runner = MapRunner(
        [
            ("OPTIONAL MATCH (n)-[r]-(m)", [
                {
                    "label": "Person",
                    "props": {"id": "a", "name": "Alice"},
                    "rels": [
                        {"rel": "WORKS_AT", "dir": "out", "id": "co", "label": "Company", "name": "Acme"},
                        None,
                    ],
                }
            ]),
        ]
    )
    result = await node_detail(runner, "a")
    assert result is not None
    assert result["label"] == "Person"
    assert result["props"]["name"] == "Alice"
    assert len(result["rels"]) == 1
    assert result["rels"][0]["id"] == "co"


async def test_node_detail_returns_none_for_unknown_id() -> None:
    runner = MapRunner([("OPTIONAL MATCH (n)-[r]-(m)", [])])
    assert await node_detail(runner, "missing") is None
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_graph_full_query.py -v`
Expected: FAIL — `ImportError: cannot import name 'full_graph'`.

- [ ] **Step 3: Implement the helpers**

Append to `backend/app/graph/query.py`:

```python
_FULL_NODES = (
    "MATCH (n) "
    "RETURN n.id AS id, labels(n)[0] AS label, "
    "coalesce(n.name, n.title, n.slug, n.id) AS name, properties(n) AS props "
    "LIMIT $limit"
)

_CONTEXT_NODES = (
    "MATCH (c:Context {slug: $slug}) "
    "OPTIONAL MATCH (c)<-[:IN_CONTEXT|PART_OF]-(m) "
    "WITH collect(DISTINCT c) + collect(DISTINCT m) AS ns "
    "UNWIND ns AS n "
    "WITH DISTINCT n WHERE n IS NOT NULL "
    "RETURN n.id AS id, labels(n)[0] AS label, "
    "coalesce(n.name, n.title, n.slug, n.id) AS name, properties(n) AS props"
)

_EDGES_AMONG = (
    "MATCH (a)-[r]->(b) WHERE a.id IN $ids AND b.id IN $ids "
    "RETURN a.id AS source, b.id AS target, type(r) AS type, properties(r) AS props"
)

_NODE_DETAIL = (
    "MATCH (n {id: $id}) "
    "OPTIONAL MATCH (n)-[r]-(m) "
    "RETURN labels(n)[0] AS label, properties(n) AS props, "
    "collect(CASE WHEN m IS NULL THEN NULL ELSE {"
    "rel: type(r), dir: CASE WHEN startNode(r) = n THEN 'out' ELSE 'in' END, "
    "id: m.id, label: labels(m)[0], "
    "name: coalesce(m.name, m.title, m.slug, m.id)} END) AS rels"
)


async def full_graph(
    run: Runner, *, context: str | None = None, limit: int = 5000
) -> dict:
    """Return the whole graph (or a single context's induced subgraph).

    Shape: ``{"nodes": [...], "edges": [...], "truncated": bool}``.
    Edges are constrained to the returned node set. ``truncated`` is only ever
    True for the unfiltered case when the node count reaches ``limit``.
    """
    if context:
        nodes = await run(_CONTEXT_NODES, {"slug": context})
    else:
        nodes = await run(_FULL_NODES, {"limit": limit})

    ids = [n["id"] for n in nodes]
    edges = await run(_EDGES_AMONG, {"ids": ids}) if ids else []
    truncated = context is None and len(nodes) >= limit
    return {"nodes": nodes, "edges": edges, "truncated": truncated}


async def node_detail(run: Runner, node_id: str) -> dict | None:
    """Return a single node's props + incident relationships (any label).

    Returns ``None`` when no node has ``node_id``.
    """
    rows = await run(_NODE_DETAIL, {"id": node_id})
    if not rows:
        return None
    row = rows[0]
    rels = [r for r in (row.get("rels") or []) if r is not None]
    return {"id": node_id, "label": row["label"], "props": row["props"], "rels": rels}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_graph_full_query.py -v`
Expected: PASS (6 passed).

- [ ] **Step 5: Commit**

```bash
git add backend/app/graph/query.py backend/tests/test_graph_full_query.py
git commit -m "feat(graph): full_graph + node_detail query helpers"
```

---

## Task 2: Backend endpoints (`/graph/full`, `/graph/node/{id}`)

**Files:**
- Modify: `backend/app/api/graph.py`
- Test: `backend/tests/test_graph_full_api.py`

- [ ] **Step 1: Write the failing tests**

Create `backend/tests/test_graph_full_api.py`:

```python
"""Endpoint tests for /graph/full and /graph/node/{id} (Neo4j-free via override)."""
from __future__ import annotations

from app.api.graph import get_runner
from app.main import app
from tests.helpers import login


class FakeRunner:
    def __init__(self, routes: list[tuple[str, list[dict]]]) -> None:
        self.routes = routes

    async def __call__(self, cypher: str, params: dict) -> list[dict]:
        for needle, rows in self.routes:
            if needle in cypher:
                return list(rows)
        return []


def _use_runner(runner) -> None:
    app.dependency_overrides[get_runner] = lambda: runner


async def test_graph_full_requires_auth(client):
    assert (await client.get("/graph/full")).status_code == 401


async def test_graph_full_returns_snapshot(client, db):
    await login(client, db)
    _use_runner(
        FakeRunner(
            [
                ("AS source", [{"source": "a", "target": "b", "type": "KNOWS", "props": {}}]),
                ("MATCH (n)", [
                    {"id": "a", "label": "Person", "name": "Alice", "props": {}},
                    {"id": "b", "label": "Person", "name": "Bob", "props": {}},
                ]),
            ]
        )
    )
    try:
        resp = await client.get("/graph/full")
        assert resp.status_code == 200
        body = resp.json()
        assert {n["id"] for n in body["nodes"]} == {"a", "b"}
        assert body["edges"][0]["type"] == "KNOWS"
        assert body["truncated"] is False
    finally:
        app.dependency_overrides.pop(get_runner, None)


async def test_graph_node_detail_and_404(client, db):
    await login(client, db)
    _use_runner(
        FakeRunner(
            [
                ("OPTIONAL MATCH (n)-[r]-(m)", [
                    {"label": "Person", "props": {"id": "a", "name": "Alice"}, "rels": []}
                ]),
            ]
        )
    )
    try:
        ok = await client.get("/graph/node/a")
        assert ok.status_code == 200
        assert ok.json()["label"] == "Person"
    finally:
        app.dependency_overrides.pop(get_runner, None)

    _use_runner(FakeRunner([("OPTIONAL MATCH (n)-[r]-(m)", [])]))
    try:
        missing = await client.get("/graph/node/missing")
        assert missing.status_code == 404
    finally:
        app.dependency_overrides.pop(get_runner, None)
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd backend && uv run pytest tests/test_graph_full_api.py -v`
Expected: FAIL — `ImportError: cannot import name 'get_runner'` (and 404s for the new routes).

- [ ] **Step 3: Implement the dependency + endpoints**

Edit `backend/app/api/graph.py`. Update the imports and add the dependency + two routes. Replace the existing import block and add below the existing `graph_query` function:

Change the top imports to also import `Runner` and add the dependency. The new imports section:

```python
"""Graph query API."""
from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel

from app.deps import get_current_user
from app.graph import query as gq
from app.graph.client import Runner, neo4j_runner

router = APIRouter(prefix="/graph", tags=["graph"], dependencies=[Depends(get_current_user)])

_INTENTS = {"who_at_company", "connection_path", "neighbors"}


def get_runner() -> Runner:
    """Injectable Neo4j runner (overridden in tests)."""
    return neo4j_runner
```

Then add these two endpoints at the end of the file:

```python
@router.get("/full")
async def graph_full(
    context: str | None = None,
    limit: int = 5000,
    run: Runner = Depends(get_runner),
) -> dict:
    return await gq.full_graph(run, context=context, limit=limit)


@router.get("/node/{node_id}")
async def graph_node(node_id: str, run: Runner = Depends(get_runner)) -> dict:
    detail = await gq.node_detail(run, node_id)
    if detail is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Node not found")
    return detail
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd backend && uv run pytest tests/test_graph_full_api.py -v`
Expected: PASS (3 passed).

- [ ] **Step 5: Run the full backend suite + lint to confirm no regressions**

Run: `cd backend && uv run pytest -q && uv run ruff check app tests && uv run mypy app`
Expected: all pass (248 passed), ruff clean, mypy clean.

- [ ] **Step 6: Commit**

```bash
git add backend/app/api/graph.py backend/tests/test_graph_full_api.py
git commit -m "feat(graph): GET /graph/full and /graph/node/{id} endpoints"
```

---

## Task 3: Frontend dependencies, types, and fcose shim

**Files:**
- Modify: `frontend/package.json`
- Create: `frontend/src/types/cytoscape-fcose.d.ts`
- Modify: `frontend/src/lib/types.ts`

- [ ] **Step 1: Install the libraries**

Run: `cd frontend && npm install cytoscape cytoscape-fcose`
Expected: both added to `dependencies` in `package.json`; `package-lock.json` updated.

- [ ] **Step 2: Add the fcose type shim**

Create `frontend/src/types/cytoscape-fcose.d.ts`:

```typescript
// cytoscape-fcose ships no TypeScript types; it's a Cytoscape layout extension
// registered via cytoscape.use(fcose).
declare module "cytoscape-fcose" {
  import type { Ext } from "cytoscape";
  const ext: Ext;
  export default ext;
}
```

- [ ] **Step 3: Add the shared types**

Append to `frontend/src/lib/types.ts`:

```typescript
// ─── Graph explorer ──────────────────────────────────────────────────────────
export interface GraphFullNode {
  id: string;
  label: string;
  name: string;
  props: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
  props: Record<string, unknown>;
}

export interface GraphSnapshot {
  nodes: GraphFullNode[];
  edges: GraphEdge[];
  truncated: boolean;
}

export interface GraphRel {
  rel: string;
  dir: "in" | "out";
  id: string;
  label: string;
  name: string;
}

export interface GraphNodeDetail {
  id: string;
  label: string;
  props: Record<string, unknown>;
  rels: GraphRel[];
}
```

- [ ] **Step 4: Verify typecheck passes**

Run: `cd frontend && npm run typecheck`
Expected: PASS (no errors).

- [ ] **Step 5: Commit**

```bash
git add frontend/package.json frontend/package-lock.json frontend/src/types/cytoscape-fcose.d.ts frontend/src/lib/types.ts
git commit -m "chore(graph): add cytoscape deps + graph snapshot types"
```

---

## Task 4: Pure snapshot→elements mapper

**Files:**
- Create: `frontend/src/features/graph/snapshot-to-elements.ts`
- Test: `frontend/src/features/graph/snapshot-to-elements.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/graph/snapshot-to-elements.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { snapshotToElements } from "./snapshot-to-elements";
import type { GraphSnapshot } from "../../lib/types";

const snap: GraphSnapshot = {
  nodes: [
    { id: "a", label: "Person", name: "Alice", props: {} },
    { id: "b", label: "Company", name: "Acme", props: {} },
  ],
  edges: [
    { source: "a", target: "b", type: "WORKS_AT", props: {} },
    { source: "a", target: "ghost", type: "KNOWS", props: {} }, // dangling
  ],
  truncated: false,
};

describe("snapshotToElements", () => {
  it("maps nodes with id/label/name data", () => {
    const els = snapshotToElements(snap);
    const node = els.find((e) => e.data.id === "a");
    expect(node?.data).toMatchObject({ id: "a", label: "Person", name: "Alice" });
  });

  it("drops edges whose endpoints are not both present", () => {
    const els = snapshotToElements(snap);
    const edges = els.filter((e) => (e.data as { source?: string }).source);
    expect(edges).toHaveLength(1);
    expect((edges[0].data as { target: string }).target).toBe("b");
  });

  it("gives every edge a unique id", () => {
    const els = snapshotToElements(snap);
    const ids = els.map((e) => e.data.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm run test -- --run snapshot-to-elements`
Expected: FAIL — cannot find module `./snapshot-to-elements`.

- [ ] **Step 3: Implement the mapper**

Create `frontend/src/features/graph/snapshot-to-elements.ts`:

```typescript
import type { ElementDefinition } from "cytoscape";
import type { GraphSnapshot } from "../../lib/types";

/** Convert a backend graph snapshot into Cytoscape element definitions.
 * Edges with an endpoint missing from the node set are dropped defensively. */
export function snapshotToElements(snapshot: GraphSnapshot): ElementDefinition[] {
  const ids = new Set(snapshot.nodes.map((n) => n.id));
  const nodes: ElementDefinition[] = snapshot.nodes.map((n) => ({
    data: { id: n.id, label: n.label, name: n.name },
  }));
  const edges: ElementDefinition[] = snapshot.edges
    .filter((e) => ids.has(e.source) && ids.has(e.target))
    .map((e, i) => ({
      data: {
        id: `e${i}-${e.source}-${e.target}`,
        source: e.source,
        target: e.target,
        label: e.type,
      },
    }));
  return [...nodes, ...edges];
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npm run test -- --run snapshot-to-elements`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/graph/snapshot-to-elements.ts frontend/src/features/graph/snapshot-to-elements.test.ts
git commit -m "feat(graph): pure snapshot-to-elements mapper"
```

---

## Task 5: Cytoscape config (palette, stylesheet, layouts)

**Files:**
- Create: `frontend/src/features/graph/cytoscape-config.ts`
- Test: `frontend/src/features/graph/cytoscape-config.test.ts`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/graph/cytoscape-config.test.ts`:

```typescript
import { describe, expect, it } from "vitest";
import { LAYOUTS, NODE_TYPES, TYPE_COLORS, stylesheet } from "./cytoscape-config";

describe("cytoscape-config", () => {
  it("has a color for every node type", () => {
    for (const t of NODE_TYPES) {
      expect(TYPE_COLORS[t]).toMatch(/^#/);
    }
  });

  it("exposes the three layouts with cytoscape layout names", () => {
    expect(LAYOUTS.fcose.name).toBe("fcose");
    expect(LAYOUTS.breadthfirst.name).toBe("breadthfirst");
    expect(LAYOUTS.concentric.name).toBe("concentric");
  });

  it("builds a non-empty stylesheet", () => {
    expect(stylesheet.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm run test -- --run cytoscape-config`
Expected: FAIL — cannot find module `./cytoscape-config`.

- [ ] **Step 3: Implement the config**

Create `frontend/src/features/graph/cytoscape-config.ts`:

```typescript
import type { LayoutOptions, StylesheetStyle } from "cytoscape";

export const NODE_TYPES = [
  "Person",
  "Company",
  "Context",
  "Project",
  "Task",
  "Meeting",
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const TYPE_COLORS: Record<NodeType, string> = {
  Person: "#4f8cff",
  Company: "#f59e0b",
  Context: "#a855f7",
  Project: "#10b981",
  Task: "#ef4444",
  Meeting: "#14b8a6",
};

const STUB_COLOR = "#94a3b8";

export const stylesheet: StylesheetStyle[] = [
  {
    selector: "node",
    style: {
      "background-color": STUB_COLOR,
      label: "data(name)",
      "font-size": 8,
      color: "#e5e7eb",
      "text-valign": "center",
      "text-halign": "center",
      "text-outline-color": "#0f172a",
      "text-outline-width": 1,
      width: 18,
      height: 18,
    },
  },
  ...NODE_TYPES.map((t) => ({
    selector: `node[label = "${t}"]`,
    style: { "background-color": TYPE_COLORS[t] },
  })),
  {
    selector: "edge",
    style: {
      width: 1,
      "line-color": "#475569",
      "curve-style": "bezier",
      "target-arrow-shape": "triangle",
      "target-arrow-color": "#475569",
      label: "",
      "font-size": 6,
      color: "#94a3b8",
    },
  },
  {
    selector: "edge:selected, edge.hover",
    style: {
      label: "data(label)",
      "line-color": "#e5e7eb",
      "target-arrow-color": "#e5e7eb",
    },
  },
  {
    selector: "node:selected",
    style: { "border-width": 3, "border-color": "#e5e7eb" },
  },
];

export const LAYOUTS = {
  fcose: { name: "fcose", animate: false } as unknown as LayoutOptions,
  breadthfirst: { name: "breadthfirst", animate: false } as LayoutOptions,
  concentric: { name: "concentric", animate: false } as LayoutOptions,
} as const;
export type LayoutName = keyof typeof LAYOUTS;
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npm run test -- --run cytoscape-config`
Expected: PASS (3 passed).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/graph/cytoscape-config.ts frontend/src/features/graph/cytoscape-config.test.ts
git commit -m "feat(graph): cytoscape palette, stylesheet, layout presets"
```

---

## Task 6: API hooks (snapshot / node detail / rebuild)

**Files:**
- Modify: `frontend/src/features/graph/api.ts`
- Test: `frontend/src/features/graph/api.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/graph/api.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, expect, it, vi } from "vitest";
import { useGraphSnapshot, useNodeDetail } from "./api";

afterEach(() => vi.restoreAllMocks());

function wrapper({ children }: { children: ReactNode }) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
}

function mockFetch(calls: string[]) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      calls.push(String(url));
      return new Response(
        JSON.stringify({ nodes: [], edges: [], truncated: false, label: "Person", props: {}, rels: [] }),
        { status: 200 },
      );
    }),
  );
}

it("useGraphSnapshot GETs /graph/full with the context query param", async () => {
  const calls: string[] = [];
  mockFetch(calls);
  const { result } = renderHook(() => useGraphSnapshot("work"), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(calls.some((u) => u.includes("/api/graph/full?context=work"))).toBe(true);
});

it("useNodeDetail GETs /graph/node/{id} and is disabled without an id", async () => {
  const calls: string[] = [];
  mockFetch(calls);
  const { result } = renderHook(() => useNodeDetail("a"), { wrapper });
  await waitFor(() => expect(result.current.isSuccess).toBe(true));
  expect(calls.some((u) => u.includes("/api/graph/node/a"))).toBe(true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm run test -- --run features/graph/api`
Expected: FAIL — `useGraphSnapshot`/`useNodeDetail` are not exported.

- [ ] **Step 3: Implement the hooks**

Replace the contents of `frontend/src/features/graph/api.ts` with (keeps the existing `graphQuery`/`useNeighbors`, adds the new hooks):

```typescript
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../../lib/api";
import type { GraphNode, GraphNodeDetail, GraphSnapshot } from "../../lib/types";

interface GraphQueryBody {
  intent: string;
  params?: Record<string, string>;
}

/** Run a structured graph query against the backend `/graph/query` endpoint. */
export function graphQuery<T>(body: GraphQueryBody): Promise<T> {
  return apiFetch<T>("/graph/query", { method: "POST", body: JSON.stringify(body) });
}

/** Fetch the nodes directly connected to a person (any relationship type). */
export function useNeighbors(personId: string | undefined) {
  return useQuery({
    queryKey: ["graph", "neighbors", personId ?? ""],
    enabled: !!personId,
    queryFn: () =>
      graphQuery<GraphNode[]>({ intent: "neighbors", params: { person_id: personId! } }),
  });
}

/** Fetch the whole graph snapshot, optionally narrowed to one context slug. */
export function useGraphSnapshot(context?: string) {
  return useQuery({
    queryKey: ["graph", "full", context ?? ""],
    queryFn: () =>
      apiFetch<GraphSnapshot>(
        "/graph/full" + (context ? "?context=" + encodeURIComponent(context) : ""),
      ),
  });
}

/** Fetch a single node's properties + relationships for the inspector panel. */
export function useNodeDetail(nodeId: string | undefined) {
  return useQuery({
    queryKey: ["graph", "node", nodeId ?? ""],
    enabled: !!nodeId,
    queryFn: () => apiFetch<GraphNodeDetail>("/graph/node/" + nodeId!),
  });
}

/** Trigger a full Neo4j projection rebuild, then refresh graph queries. */
export function useRebuildGraph() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<unknown>("/admin/rebuild-graph", { method: "POST" }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["graph"] });
    },
  });
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npm run test -- --run features/graph/api`
Expected: PASS (2 passed).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/graph/api.ts frontend/src/features/graph/api.test.tsx
git commit -m "feat(graph): snapshot, node-detail, and rebuild query hooks"
```

---

## Task 7: GraphControls component

**Files:**
- Create: `frontend/src/features/graph/GraphControls.tsx`
- Test: `frontend/src/features/graph/GraphControls.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/graph/GraphControls.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { GraphControls } from "./GraphControls";

function setup(overrides = {}) {
  const props = {
    types: { Person: true, Company: true, Context: true, Project: true, Task: true, Meeting: true },
    onToggleType: vi.fn(),
    contexts: [{ slug: "work", name: "Work" }],
    context: "",
    onContextChange: vi.fn(),
    search: "",
    onSearchChange: vi.fn(),
    onSearchSubmit: vi.fn(),
    layout: "fcose" as const,
    onLayoutChange: vi.fn(),
    onRebuild: vi.fn(),
    rebuilding: false,
    ...overrides,
  };
  render(<GraphControls {...props} />);
  return props;
}

it("toggles a node type", async () => {
  const props = setup();
  await userEvent.click(screen.getByRole("checkbox", { name: /person/i }));
  expect(props.onToggleType).toHaveBeenCalledWith("Person");
});

it("submits search on Enter", async () => {
  const props = setup();
  const input = screen.getByRole("textbox", { name: /search nodes/i });
  await userEvent.type(input, "alice{Enter}");
  expect(props.onSearchSubmit).toHaveBeenCalled();
});

it("fires rebuild", async () => {
  const props = setup();
  await userEvent.click(screen.getByRole("button", { name: /rebuild graph/i }));
  expect(props.onRebuild).toHaveBeenCalled();
});

it("disables rebuild while rebuilding", () => {
  setup({ rebuilding: true });
  expect(screen.getByRole("button", { name: /rebuild/i })).toBeDisabled();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm run test -- --run GraphControls`
Expected: FAIL — cannot find module `./GraphControls`.

- [ ] **Step 3: Implement the component**

Create `frontend/src/features/graph/GraphControls.tsx`:

```tsx
import { Button, Field, Input, Select } from "../../components/ui";
import { LAYOUTS, NODE_TYPES, TYPE_COLORS, type LayoutName } from "./cytoscape-config";

interface ContextOption {
  slug: string;
  name: string;
}

interface GraphControlsProps {
  types: Record<string, boolean>;
  onToggleType: (t: string) => void;
  contexts: ContextOption[];
  context: string;
  onContextChange: (slug: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
  onSearchSubmit: () => void;
  layout: LayoutName;
  onLayoutChange: (l: LayoutName) => void;
  onRebuild: () => void;
  rebuilding: boolean;
}

export function GraphControls(props: GraphControlsProps) {
  const layoutOptions = (Object.keys(LAYOUTS) as LayoutName[]).map((l) => ({
    value: l,
    label: l,
  }));
  const contextOptions = [
    { value: "", label: "All contexts" },
    ...props.contexts.map((c) => ({ value: c.slug, label: c.name })),
  ];

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {NODE_TYPES.map((t) => (
          <label key={t} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="checkbox"
              checked={props.types[t] ?? true}
              onChange={() => props.onToggleType(t)}
              aria-label={t}
            />
            <span
              aria-hidden
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: TYPE_COLORS[t],
                display: "inline-block",
              }}
            />
            {t}
          </label>
        ))}
      </div>

      <Field label="Context">
        <Select value={props.context} onChange={props.onContextChange} options={contextOptions} />
      </Field>

      <Input
        aria-label="Search nodes"
        placeholder="Search nodes…"
        value={props.search}
        onChange={(e) => props.onSearchChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") props.onSearchSubmit();
        }}
      />

      <Field label="Layout">
        <Select
          value={props.layout}
          onChange={(v) => props.onLayoutChange(v as LayoutName)}
          options={layoutOptions}
        />
      </Field>

      <Button onClick={props.onRebuild} disabled={props.rebuilding}>
        {props.rebuilding ? "Rebuilding…" : "Rebuild graph"}
      </Button>
    </div>
  );
}
```

> Confirmed against `frontend/src/components/ui.tsx`: `Select` takes `value`, `onChange: (value: string) => void`, and `options: { value, label }[]` (it does **not** forward `aria-label`, so it is wrapped in `Field` to get an accessible name from the label text). `Input`/`Button` spread their props, so `aria-label` works on the search `Input`.

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npm run test -- --run GraphControls`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/graph/GraphControls.tsx frontend/src/features/graph/GraphControls.test.tsx
git commit -m "feat(graph): GraphControls (type/context/search/layout/rebuild)"
```

---

## Task 8: NodeInspector side panel

**Files:**
- Create: `frontend/src/features/graph/NodeInspector.tsx`
- Test: `frontend/src/features/graph/NodeInspector.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/features/graph/NodeInspector.test.tsx`:

```tsx
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { NodeInspector } from "./NodeInspector";
import type { GraphNodeDetail } from "../../lib/types";

const detail: GraphNodeDetail = {
  id: "a",
  label: "Person",
  props: { name: "Alice", slug: "alice", role: "Engineer" },
  rels: [{ rel: "WORKS_AT", dir: "out", id: "co", label: "Company", name: "Acme" }],
};

it("renders props and relationships", () => {
  render(
    <NodeInspector detail={detail} loading={false} onSelectNode={vi.fn()} onClose={vi.fn()} />,
  );
  expect(screen.getByText("Person")).toBeInTheDocument();
  expect(screen.getByText("Engineer")).toBeInTheDocument();
  expect(screen.getByText(/Acme/)).toBeInTheDocument();
});

it("selects a related node when its row is clicked", async () => {
  const onSelectNode = vi.fn();
  render(
    <NodeInspector detail={detail} loading={false} onSelectNode={onSelectNode} onClose={vi.fn()} />,
  );
  await userEvent.click(screen.getByRole("button", { name: /Acme/ }));
  expect(onSelectNode).toHaveBeenCalledWith("co");
});

it("shows a link to the entity page for a Person", () => {
  render(
    <NodeInspector detail={detail} loading={false} onSelectNode={vi.fn()} onClose={vi.fn()} />,
  );
  const link = screen.getByRole("link", { name: /open page/i });
  expect(link).toHaveAttribute("href", "/people/alice");
});

it("shows a loading state", () => {
  render(
    <NodeInspector detail={undefined} loading={true} onSelectNode={vi.fn()} onClose={vi.fn()} />,
  );
  expect(screen.getByText(/loading/i)).toBeInTheDocument();
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm run test -- --run NodeInspector`
Expected: FAIL — cannot find module `./NodeInspector`.

- [ ] **Step 3: Implement the component**

Create `frontend/src/features/graph/NodeInspector.tsx`:

```tsx
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
      <button onClick={onClose} aria-label="Close details" style={{ float: "right" }}>
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
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npm run test -- --run NodeInspector`
Expected: PASS (4 passed).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/features/graph/NodeInspector.tsx frontend/src/features/graph/NodeInspector.test.tsx
git commit -m "feat(graph): NodeInspector side panel"
```

---

## Task 9: GraphExplorer (Cytoscape orchestration)

**Files:**
- Create: `frontend/src/features/graph/GraphExplorer.tsx`

This is the canvas integration; it is exercised by the route smoke test in Task 10 (with `cytoscape` mocked). No standalone test file.

- [ ] **Step 1: Implement the component**

Create `frontend/src/features/graph/GraphExplorer.tsx`:

```tsx
import cytoscape, { type Core } from "cytoscape";
import fcose from "cytoscape-fcose";
import { useEffect, useMemo, useRef, useState } from "react";
import { useContexts } from "../contexts/api";
import { useGraphSnapshot, useNodeDetail, useRebuildGraph } from "./api";
import { GraphControls } from "./GraphControls";
import { NodeInspector } from "./NodeInspector";
import { LAYOUTS, NODE_TYPES, stylesheet, type LayoutName } from "./cytoscape-config";
import { snapshotToElements } from "./snapshot-to-elements";

let fcoseRegistered = false;
function ensureFcose() {
  if (!fcoseRegistered) {
    cytoscape.use(fcose);
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

  // Create/recreate the Cytoscape instance whenever the element set changes.
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
    // Layout changes are handled by a separate effect; recreate only on data change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [elements]);

  // Re-run layout when the selection changes.
  useEffect(() => {
    cyRef.current?.layout(LAYOUTS[layout]).run();
  }, [layout]);

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

  function runSearch() {
    const cy = cyRef.current;
    const term = search.trim().toLowerCase();
    if (!cy || !term) return;
    const match = cy
      .nodes()
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
        contexts={contextsQuery.data ?? []}
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
        <div role="status">
          Showing the first {elements.length} nodes — filter by context to narrow the view.
        </div>
      )}
      {snapshot.isLoading && <div role="status">Loading graph…</div>}
      {snapshot.isError && (
        <div role="alert">
          Couldn’t load the graph. <button onClick={() => snapshot.refetch()}>Retry</button>
        </div>
      )}
      {isEmpty && (
        <div role="status">
          The graph is empty. <button onClick={() => rebuild.mutate()}>Rebuild graph</button>
        </div>
      )}

      <div style={{ display: "flex", flex: 1, minHeight: 480, gap: 12 }}>
        <div
          ref={containerRef}
          data-testid="graph-canvas"
          style={{ flex: 1, minHeight: 480, border: "1px solid #334155", borderRadius: 8 }}
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
```

- [ ] **Step 2: Verify typecheck passes**

Run: `cd frontend && npm run typecheck`
Expected: PASS. If `Core`/`cytoscape` type imports error, confirm the named export style matches the installed `cytoscape` typings and adjust the import line only.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/features/graph/GraphExplorer.tsx
git commit -m "feat(graph): GraphExplorer cytoscape orchestration"
```

---

## Task 10: Route + nav registration (with smoke test)

**Files:**
- Create: `frontend/src/routes/graph.tsx`
- Test: `frontend/src/routes/graph.test.tsx`
- Modify: `frontend/src/router.tsx`
- Modify: `frontend/src/components/AppShell.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/routes/graph.test.tsx`:

```tsx
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

// Cytoscape touches a real canvas; mock it so the page renders under jsdom.
vi.mock("cytoscape-fcose", () => ({ default: {} }));
vi.mock("cytoscape", () => {
  const collection = {
    filter: () => collection,
    style: () => collection,
    length: 0,
  };
  const cy = {
    on: vi.fn(),
    destroy: vi.fn(),
    batch: (cb: () => void) => cb(),
    layout: () => ({ run: vi.fn() }),
    nodes: () => collection,
    animate: vi.fn(),
  };
  const fn = Object.assign(vi.fn(() => cy), { use: vi.fn() });
  return { default: fn };
});

import { GraphPage } from "./graph";

afterEach(() => vi.restoreAllMocks());

it("renders the graph page with controls and fetches the snapshot", async () => {
  const calls: string[] = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      const u = String(url);
      calls.push(u);
      if (u.includes("/auth/me")) {
        return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), {
          status: 200,
        });
      }
      if (u.includes("/graph/full")) {
        return new Response(JSON.stringify({ nodes: [], edges: [], truncated: false }), {
          status: 200,
        });
      }
      if (u.includes("/contexts")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      return new Response(JSON.stringify({}), { status: 200 });
    }),
  );

  const root = createRootRoute();
  const graph = createRoute({ getParentRoute: () => root, path: "/graph", component: GraphPage });
  const login = createRoute({
    getParentRoute: () => root,
    path: "/login",
    component: () => <div>login-page</div>,
  });
  const history = createMemoryHistory({ initialEntries: ["/graph"] });
  const router = createRouter({ routeTree: root.addChildren([graph, login]), history });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );

  await screen.findByRole("heading", { name: "Graph" });
  expect(screen.getByRole("button", { name: /rebuild graph/i })).toBeInTheDocument();
  expect(calls.some((u) => u.includes("/graph/full"))).toBe(true);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm run test -- --run routes/graph`
Expected: FAIL — cannot find module `./graph`.

- [ ] **Step 3: Create the route/page**

Create `frontend/src/routes/graph.tsx`:

```tsx
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
```

- [ ] **Step 4: Register the route**

In `frontend/src/router.tsx`, add the import near the other route imports:

```typescript
import { graphRoute } from "./routes/graph";
```

and add `graphRoute,` to the `rootRoute.addChildren([...])` array (e.g. right after `searchRoute,`).

- [ ] **Step 5: Add the nav entry**

In `frontend/src/components/AppShell.tsx`:
1. Add `Network` to the existing `lucide-react` import (the line importing `LayoutDashboard, Layers, …`).
2. Add this entry to the `NAV` array, after the `search` entry:

```typescript
{ key: "graph", label: "Graph", to: "/graph", Icon: Network },
```

- [ ] **Step 6: Run the route test to verify it passes**

Run: `cd frontend && npm run test -- --run routes/graph`
Expected: PASS (1 passed).

- [ ] **Step 7: Commit**

```bash
git add frontend/src/routes/graph.tsx frontend/src/routes/graph.test.tsx frontend/src/router.tsx frontend/src/components/AppShell.tsx
git commit -m "feat(graph): /graph route + nav entry"
```

---

## Task 11: Full verification

**Files:** none (verification only).

- [ ] **Step 1: Frontend — tests, lint, typecheck, build**

Run: `cd frontend && npm run test -- --run && npm run lint && npm run typecheck && npm run build`
Expected: all tests pass (65 prior + ~17 new), lint clean, typecheck clean, build succeeds.
If lint flags the `eslint-disable` comment as unused, remove it; if it flags `exhaustive-deps`, keep the disable only on the instance-creation effect.

- [ ] **Step 2: Backend — tests, lint, types**

Run: `cd backend && uv run pytest -q && uv run ruff check app tests && uv run mypy app`
Expected: all pass (243 prior + 9 new = 252), ruff clean, mypy clean.

- [ ] **Step 3: Manual smoke (optional but recommended)**

With the stack running (`docker compose up -d --wait postgres neo4j`, backend on :8000 with a seeded user and the graph worker running, `curl -X POST localhost:8000/admin/rebuild-graph` once, frontend `npm run dev`), open `/graph`: confirm nodes render, type toggles hide/show, the context dropdown narrows the graph, search centers a node, clicking a node opens the inspector, and "Rebuild graph" works.

- [ ] **Step 4: Final commit (if Step 1/2 required any fixups)**

```bash
git add -A
git commit -m "chore(graph): lint/type fixups"
```

---

## Self-Review notes (already folded into the plan)

- **Spec coverage:** whole-graph snapshot (Task 1–2, 6, 9), medium-scale canvas renderer (Tasks 5, 9 — Cytoscape), node click → side panel (Tasks 6, 8, 9), four controls — type/context/search/layout (Tasks 7, 9), new read-only route + nav + rebuild action (Tasks 6, 10), per-type colors with stub-node fallback (Task 5), loading/empty/error/truncation states (Task 9), backend + frontend tests (every task). Per-context node coloring is intentionally out of scope (depends on the unmerged `feat/context-color-status` branch — see spec §11).
- **Type consistency:** `GraphSnapshot`/`GraphFullNode`/`GraphEdge`/`GraphNodeDetail`/`GraphRel` are defined in Task 3 and consumed unchanged in Tasks 4/6/8/9; `LayoutName`, `NODE_TYPES`, `TYPE_COLORS`, `stylesheet`, `LAYOUTS` from Task 5 are consumed in Tasks 7/9; `get_runner`/`full_graph`/`node_detail` from Tasks 1–2 are consumed by the endpoint and its tests.
- **Verified during planning:** `ui.tsx` `Select`/`Input`/`Field`/`Button` signatures (Task 7 uses the real shapes); `lucide-react` exports `Network` (Task 10 nav icon); the `/graph` router, `login` test helper, and `client` fixture all exist.
- **Known adapt-as-you-go point:** the exact `cytoscape` type export names for `Core`/`StylesheetStyle`/`LayoutOptions`/`ElementDefinition`/`Ext` (adjust the import lines only if the installed typings differ — types ship with `cytoscape`).
