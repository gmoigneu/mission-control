# Graph Explorer — Design

> Status: approved (2026-06-07, via brainstorming). A new full-page route that renders
> the entire Neo4j projection as an interactive, read-only node-link diagram.
>
> Branch: `worktree-feat+graph-explorer` (worktree off `main`).

## 1. Goal

Add a **Graph** page (`/graph`) that shows the whole Neo4j graph as an interactive
node-link visualization. The user can pan/zoom, filter by node type and by context,
search-and-center a node, switch layouts, click a node to inspect its properties and
relationships in a side panel, and trigger a projection rebuild. **Read-only** for graph
data — no creating or deleting nodes/edges from this page.

## 2. Decisions (from brainstorming)

| Question | Decision |
|---|---|
| Primary job | **See the whole graph** — an overview map of everything in Neo4j. |
| Scale | **Medium (500–5k nodes).** Canvas renderer, load all at once, filtering controls. |
| Node click | **Open details in a side panel** (properties + relationships); stay in the graph. |
| Controls | Filter by node type, filter by context, search/find node, layout switch. |
| Placement & scope | **New top-level nav route, read-only, + a "Rebuild graph" action.** |
| Rendering library | **Cytoscape.js** (canvas; native type-coloring, filtering, search-to-center, multiple layouts). |

## 3. Graph data model (authoritative — from `backend/app/graph/projector.py`)

**Node labels and their denormalized props in Neo4j:**

| Label | Props on the node | Display name field |
|---|---|---|
| `Context` | id, slug, name, category, status | `name` |
| `Project` | id, slug, title, status | `title` |
| `Company` | id, slug, name, domain | `name` |
| `Person` | id, slug, name, role, email | `name` |
| `Task` | id, title, status, priority | `title` |
| `Meeting` | id, slug, title, at, location | `title` |

Display name = `coalesce(n.name, n.title, n.slug, n.id)`. **Stub nodes**: the projector
`MERGE`s FK-target nodes by id before the target's own upsert may have run, so some nodes
can carry only `id` (no name) — the visualization must render these gracefully (fall back
to slug/id, label them by their `:Label`).

**Edge (relationship) types:**

| Type | Shape | Source of truth |
|---|---|---|
| `WORKS_AT` | Person → Company | person FK |
| `IN_CONTEXT` | Person/Task/Meeting → Context | FK |
| `PART_OF` | Project → Context | FK *(note: project→context is `PART_OF`, not `FOR_PROJECT`)* |
| `FOR_PROJECT` | Task/Meeting → Project | FK |
| `KNOWS` | Person → Person | `relationship` table (props: `rel_id`, `type`, `since`) |
| `LINKED` | Task → Task | `task_link` table (props: `link_id`, `kind`) |
| `RELATES_TO` | any node-entity → any node-entity | `entity_link` table (props: `link_id`, `kind`) |

## 4. Architecture

### 4.1 Backend

All changes are additive; the existing intent-based `POST /graph/query` and the
`POST /admin/rebuild-graph` endpoints are left untouched.

**New endpoint — `GET /graph/full`** on the existing `/graph` router (in
`backend/app/api/graph.py`), guarded by the same `get_current_user` dependency.

- Query params (all optional): `context=<slug>` (server-side context filter),
  `limit=<int>` (node cap, default 5000).
- Response model (Pydantic): `{ nodes: GraphFullNode[], edges: GraphFullEdge[], truncated: bool }`
  - `GraphFullNode`: `{ id: str, label: str, name: str, props: dict }`
  - `GraphFullEdge`: `{ source: str, target: str, type: str, props: dict }`
  - `truncated`: true when the node count hit `limit` (so the UI can warn).
- Behavior:
  - **No context filter** → return up to `limit` nodes and all edges among the returned
    node set.
  - **With `context=<slug>`** → return the `Context` node plus all nodes with a direct
    relationship to it (`Person`/`Task`/`Meeting` via `IN_CONTEXT`, `Project` via
    `PART_OF`), and all edges whose both endpoints are within that returned set. (Induced
    subgraph of the context + its direct members.)

**New query helpers** in `backend/app/graph/query.py` (pure functions over `Runner`, the
existing `async (cypher, params) -> list[dict]` callable — easy to unit-test with a mock
runner):

- `async def full_graph(run, *, context: str | None, limit: int) -> dict` — returns
  `{nodes, edges, truncated}`. Representative Cypher (two passes, edges constrained to the
  returned node set):
  ```cypher
  // nodes (unfiltered case)
  MATCH (n) RETURN n.id AS id, labels(n)[0] AS label,
         coalesce(n.name, n.title, n.slug, n.id) AS name, properties(n) AS props
  LIMIT $limit
  // edges among the returned ids
  MATCH (a)-[r]->(b) WHERE a.id IN $ids AND b.id IN $ids
  RETURN a.id AS source, b.id AS target, type(r) AS type, properties(r) AS props
  ```
  `truncated = (len(nodes) == limit)`. For the context case, first match the context +
  members to build `$ids`, then run the same edge query over that set.
- `async def node_detail(run, node_id: str) -> dict | None` — **generic** (any label, unlike
  today's Person-only `neighbors`). Returns the node's properties plus its incident
  relationships in both directions:
  ```cypher
  MATCH (n {id: $id})
  OPTIONAL MATCH (n)-[r]-(m)
  RETURN labels(n)[0] AS label, properties(n) AS props,
         collect(CASE WHEN m IS NULL THEN NULL ELSE {
           rel: type(r),
           dir: CASE WHEN startNode(r) = n THEN 'out' ELSE 'in' END,
           id: m.id, label: labels(m)[0],
           name: coalesce(m.name, m.title, m.slug, m.id)
         } END) AS rels
  ```
  Returns `None` (→ 404) when no node has that id. Filter out null entries from `rels`.

**Endpoint additions:**
- `GET /graph/full` → `full_graph(...)`.
- `GET /graph/node/{node_id}` → `node_detail(...)`; 404 when `None`.

**Rebuild** reuses the existing `POST /admin/rebuild-graph` (no new backend work).

### 4.2 Frontend

Routing is **code-based** (`frontend/src/router.tsx` composes the route tree; each route
file exports a `createRoute({...})`). Files:

- `frontend/src/routes/graph.tsx` — exports `graphRoute = createRoute({ getParentRoute: () => rootRoute, path: "/graph", component: GraphPage })`. Registered by importing it in `router.tsx` and adding it to `rootRoute.addChildren([...])`. `GraphPage` renders inside the existing `AppShell` like the other routes and mounts `<GraphExplorer/>`.
- `frontend/src/components/AppShell.tsx` — add a nav entry to the `NAV` array:
  `{ key: "graph", label: "Graph", to: "/graph", Icon: Network }` (lucide `Network` icon),
  placed near Search/Activity.
- `frontend/src/features/graph/` (extends the existing module):
  - `api.ts` — add `useGraphSnapshot({ context }: { context?: string })` and
    `useNodeDetail(nodeId)` (TanStack Query), plus a `useRebuildGraph()` mutation that
    `POST`s `/admin/rebuild-graph` and invalidates the snapshot query. All via the existing
    `apiFetch<T>` client (`/api` prefix; GET is default).
  - `snapshot-to-elements.ts` — a **pure** `snapshotToElements(snapshot): ElementDefinition[]`
    mapper (snapshot → Cytoscape elements). Kept separate so it is unit-testable without a
    canvas. Drops edges whose endpoints aren't in the node set (defensive).
  - `cytoscape-config.ts` — the Cytoscape stylesheet (per-type node colors, label text,
    edge styling, selected/hover states) and named layout presets.
  - `GraphExplorer.tsx` — orchestrates the canvas + controls + inspector; owns local UI
    state (active type filters, current layout, selected node id, search term).
  - `GraphControls.tsx` — type toggles, context selector, search box, layout switch,
    "Rebuild graph" button.
  - `NodeInspector.tsx` — the side panel: selected node's properties + a relationship list;
    each relationship row centers the connected node on click and links to that entity's
    existing detail route where one exists (e.g. Person → `/people/$slug`).
- `frontend/src/lib/types.ts` — add `GraphEdge`, `GraphSnapshot`, `GraphNodeDetail`
  (extend/relate to the existing `GraphNode` at `types.ts:345`).

**Cytoscape integration approach:** use the **`cytoscape` core library directly** via a
container `ref` + `useEffect` (create the instance on mount, update elements/layout on data
change, destroy on unmount). We deliberately avoid the `react-cytoscapejs` wrapper to sidestep
React-19 peer-dependency risk. Force-directed layout via the **`cytoscape-fcose`** extension;
hierarchical/radial via Cytoscape's built-in `breadthfirst`/`concentric` layouts.

**New dependencies (frontend):** `cytoscape`, `cytoscape-fcose`. `cytoscape` ships its own
TS types; add a minimal module declaration for `cytoscape-fcose` if it lacks types.

## 5. Data flow

1. `/graph` loads → `useGraphSnapshot({context})` → `GET /graph/full[?context=]` →
   React Query cache → `snapshotToElements` → Cytoscape renders with the active layout.
2. **Type toggles** → client-side `display: none` on matching nodes/edges (instant; no
   refetch). **Context filter** → changes the query key → refetch with `?context=`.
   **Search** → center/animate (`cy.animate({center,zoom})`) to the matched node.
3. **Click node** → set `selectedId` → `NodeInspector` shows details. Inspector hydrates
   full props/relationships via `useNodeDetail(selectedId)` (`GET /graph/node/{id}`).
4. **Rebuild** → `useRebuildGraph()` mutation → on success invalidate the snapshot query →
   refetch.

## 6. Node & edge styling

- **Fixed per-label color palette** (the six labels), defined in `cytoscape-config.ts` using
  the app's existing color tokens; each type also shown in a legend in the controls bar.
- Node label text = display name, always visible. **Stub nodes** (id-only) render with a
  muted style and their `:Label` as text.
- Edge type label shown on **hover/selection only** (reduces clutter at medium scale).
- Selected node + its incident edges get a highlighted style.
- **Per-context node coloring is explicitly out of scope here** — the `context.color`
  column lives on the separate, unmerged `feat/context-color-status` branch and is not
  present on this base. If/when that merges, Context nodes can later adopt their assigned
  color; until then they use the fixed Context palette color. (See §11.)

## 7. Controls behavior

- **Type filter**: one toggle per label (Person/Company/Context/Project/Task/Meeting),
  client-side show/hide. All on by default.
- **Context filter**: a dropdown of contexts (reuse the existing contexts list query) +
  an "All" option. Selecting one refetches the induced subgraph server-side.
- **Search**: text input; matches node display names (client-side over loaded elements);
  centers and briefly highlights the best match.
- **Layout switch**: `fcose` (force-directed, default) · `breadthfirst` (hierarchical) ·
  `concentric` (radial). Re-runs the layout on the current elements.
- **Rebuild graph**: button → confirm → mutation → toast on completion → refetch. Disabled
  while in flight.

## 8. States

- **Loading**: skeleton/spinner overlay on the canvas area.
- **Empty graph** (no nodes): message + a prominent "Rebuild graph" CTA.
- **Error** (Neo4j unreachable / query failure): error message + Retry.
- **Truncation** (`truncated: true`): a non-blocking banner above the canvas suggesting a
  context filter to narrow the view.

## 9. Testing

**Backend** (pytest, mock `Runner`):
- `full_graph`: unfiltered returns nodes+edges; edges constrained to returned node set;
  `truncated` flips at the limit; context filter returns the induced subgraph.
- `node_detail`: returns props + both-direction rels; `None` for unknown id.
- Endpoint tests for `GET /graph/full` (params, cap, shape) and `GET /graph/node/{id}`
  (200 + 404), following existing graph-test patterns.

**Frontend** (Vitest):
- `snapshotToElements` — pure-function tests (mapping, stub nodes, dropped dangling edges).
- `GraphControls` — toggles/selector/layout/search update state and fire callbacks.
- `NodeInspector` — renders props + relationship rows; row click + detail link behavior.
- `api.ts` hooks — with mocked `apiFetch`.
- The Cytoscape canvas itself is not unit-tested (canvas rendering); logic is extracted into
  the pure mapper and the controls so it can be.

## 10. Out of scope (YAGNI)

- Editing nodes/relationships from the graph.
- Saved views / bookmarks / shareable graph state in the URL.
- Clustering / level-of-detail / WebGL for >5k nodes (revisit if scale grows; would mean
  reconsidering Sigma.js).
- Temporal/timeline animation.
- Per-context node colors (depends on an unmerged branch — see §11).

## 11. Dependencies & open items

- **`context.color`**: not on this base. The design uses a fixed palette and does **not**
  depend on the context-color feature. Per-context coloring is a future enhancement.
- **Neo4j must be running** for the page to return data (same as today's `/graph/query`).
  The empty/error states cover the case where it is not.
- **New npm deps** (`cytoscape`, `cytoscape-fcose`) will be added to `frontend/package.json`.
