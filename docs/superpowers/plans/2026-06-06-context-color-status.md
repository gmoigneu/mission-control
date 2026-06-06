# Context Color + Status Form Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give each Context an explicit color from a fixed 12-color palette and surface the `status` field in the create/edit form; the chosen color tints the context's dot/chip everywhere it is rendered, falling back to the category-derived tint when unset.

**Architecture:** Add a nullable `color` column on `context` storing a palette *key* (e.g. `"blue"`). Each key maps to a themed `--palette-<key>` OKLCH token (dark + light). A `contextTint(ctx)` resolver returns the palette var when `color` is set, else the existing category tint. The form gains a status `Select` and a swatch `ColorPicker`.

**Tech Stack:** Backend — Python 3.12, FastAPI, SQLAlchemy 2.0 async, Alembic, pytest (asyncio auto). Frontend — React + TanStack Router, React Query, custom `ui` primitives, Vitest + Testing Library.

**Spec:** [docs/superpowers/specs/2026-06-06-context-color-and-status-design.md](../specs/2026-06-06-context-color-and-status-design.md)

**Commands:**
- Backend tests: `cd backend && uv run pytest -q`
- One backend test: `cd backend && uv run pytest tests/test_contexts_api.py -q`
- Alembic: `cd backend && uv run alembic upgrade head` / `uv run alembic downgrade -1`
- Frontend tests: `cd frontend && npm run test -- --run`
- One frontend test: `cd frontend && npm run test -- --run src/routes/contexts.test.tsx`
- Frontend typecheck/build: `cd frontend && npm run build`

> Note: the test DB schema is built from SQLAlchemy models (`Base.metadata.create_all`), not Alembic, so model changes appear in tests automatically. The migration is verified separately against the dev Postgres (Task 1).

---

## File Structure

**Backend**
- Modify `backend/app/models/context.py` — add `color` column.
- Create `backend/alembic/versions/0030_context_color.py` — add/drop `color`.
- Modify `backend/app/schemas/context.py` — `ContextColor` Literal + `color` fields.
- Modify `backend/app/demo_seed.py` — seed colors on `_CONTEXTS`.
- Modify `backend/tests/test_contexts_api.py` — color/status round-trip + 422.

**Frontend**
- Modify `frontend/src/lib/types.ts` — add `color` to `Context`/`ContextCreate`.
- Modify `frontend/src/styles/console.css` — `--palette-*` tokens (dark + light).
- Modify `frontend/src/components/console.tsx` — `PALETTE`, `paletteVar`, `contextTint`; `ContextChip` uses resolved color.
- Create `frontend/src/components/console.test.tsx` — `contextTint` unit tests.
- Create `frontend/src/components/ColorPicker.tsx` — swatch picker.
- Create `frontend/src/components/ColorPicker.test.tsx` — picker tests.
- Modify `frontend/src/routes/contexts.tsx` — status `Select` + `ColorPicker`, table swatch + `StatusBadge`.
- Create `frontend/src/routes/contexts.test.tsx` — form submits status + color.
- Modify `frontend/src/routes/index.tsx` — feed `contextTint(ctx)` to chips.

---

## Task 1: Backend model + migration (`color` column)

**Files:**
- Modify: `backend/app/models/context.py:19`
- Create: `backend/alembic/versions/0030_context_color.py`

- [ ] **Step 1: Add the `color` column to the model**

In `backend/app/models/context.py`, add the `color` line immediately after the `status` line (line 19):

```python
    status: Mapped[str] = mapped_column(String, default="active")  # active|archived
    color: Mapped[str | None] = mapped_column(String, nullable=True)  # palette key; None → category tint
```

- [ ] **Step 2: Create the migration**

Create `backend/alembic/versions/0030_context_color.py` with exactly:

```python
"""context.color — per-context palette tint

Revision ID: 0030
Revises: 0029
"""
import sqlalchemy as sa

from alembic import op

revision = "0030"
down_revision = "0029"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("context", sa.Column("color", sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column("context", "color")
```

- [ ] **Step 3: Verify the migration applies and reverts against dev Postgres**

Run:
```bash
cd backend && uv run alembic upgrade head && uv run alembic downgrade -1 && uv run alembic upgrade head
```
Expected: no errors; final line shows `Running upgrade 0029 -> 0030`. Confirm the column exists:
```bash
docker compose -f ../docker-compose.yml exec -T postgres psql -U mc -d mc -c "\d context" 2>/dev/null | grep color
```
Expected: a `color | character varying` row.

- [ ] **Step 4: Commit**

```bash
git add backend/app/models/context.py backend/alembic/versions/0030_context_color.py
git commit -m "feat(context): add nullable color column + migration 0030"
```

---

## Task 2: Backend schema + API test (color/status round-trip, 422 on invalid)

**Files:**
- Modify: `backend/app/schemas/context.py`
- Test: `backend/tests/test_contexts_api.py`

- [ ] **Step 1: Write the failing test**

Append this function to `backend/tests/test_contexts_api.py` (the file already imports `login` from `tests.helpers` and defines `test_contexts_crud_flow`; reuse the same `client, db` fixtures):

```python
async def test_context_color_and_status(client, db):
    await login(client, db)

    created = await client.post(
        "/contexts",
        json={"slug": "oss", "name": "Open Source", "color": "teal", "status": "archived"},
    )
    assert created.status_code == 201
    body = created.json()
    assert body["color"] == "teal"
    assert body["status"] == "archived"
    cid = body["id"]

    # color omitted → stored/returned as null
    plain = await client.post("/contexts", json={"slug": "work", "name": "Work"})
    assert plain.status_code == 201
    assert plain.json()["color"] is None

    # update can change the color
    patched = await client.patch(f"/contexts/{cid}", json={"color": "blue"})
    assert patched.status_code == 200
    assert patched.json()["color"] == "blue"

    # an unknown color key is rejected
    bad = await client.post(
        "/contexts", json={"slug": "bad", "name": "Bad", "color": "chartreuse"}
    )
    assert bad.status_code == 422
```

If `tests/test_contexts_api.py` does not already import `login`, add at the top: `from tests.helpers import login`.

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && uv run pytest tests/test_contexts_api.py::test_context_color_and_status -q`
Expected: FAIL — the response has no `color` key (KeyError / `None != "teal"`), and the invalid-color POST returns 201 instead of 422.

- [ ] **Step 3: Add `color` to the schemas**

In `backend/app/schemas/context.py`, add the `ContextColor` Literal after `ContextStatus` (line 8):

```python
ContextStatus = Literal["active", "archived"]
ContextColor = Literal[
    "slate", "red", "orange", "amber", "green", "teal",
    "cyan", "blue", "indigo", "violet", "magenta", "pink",
]
```

Add `color` to `ContextCreate` (after its `status` field):

```python
class ContextCreate(BaseModel):
    slug: str
    name: str
    category: ContextCategory = "other"
    description: str | None = None
    status: ContextStatus = "active"
    color: ContextColor | None = None
```

Add `color` to `ContextUpdate` (after its `status` field):

```python
class ContextUpdate(BaseModel):
    slug: str | None = None
    name: str | None = None
    category: ContextCategory | None = None
    description: str | None = None
    status: ContextStatus | None = None
    color: ContextColor | None = None
```

Add `color` to `ContextOut` (after its `status` field):

```python
class ContextOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    name: str
    category: str
    description: str | None
    status: str
    color: str | None
    created_at: datetime
    updated_at: datetime
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd backend && uv run pytest tests/test_contexts_api.py -q`
Expected: PASS (both `test_contexts_crud_flow` and `test_context_color_and_status`).

- [ ] **Step 5: Commit**

```bash
git add backend/app/schemas/context.py backend/tests/test_contexts_api.py
git commit -m "feat(context): accept + return color, validate against palette (422 on bad key)"
```

---

## Task 3: Seed demo colors

**Files:**
- Modify: `backend/app/demo_seed.py` (`_CONTEXTS` list ~lines 65-72; Context construction ~lines 254-259)

- [ ] **Step 1: Add a color to each `_CONTEXTS` entry**

Replace the `_CONTEXTS` block:

```python
# (slug, name, category, description, color)
_CONTEXTS = [
    ("work", "Helios Robotics", "work", "Building the company — warehouse robotics", "blue"),
    ("personal", "Personal", "personal", "Life outside work", "violet"),
    ("health", "Health & Fitness", "personal", "Training, climbing, sleep", "green"),
    ("oss", "Open Source", "side", "Maintaining tide-ui and side projects", "teal"),
    ("learning", "Learning", "personal", "Books, courses, deliberate practice", "amber"),
]
```

- [ ] **Step 2: Pass `color` into the Context constructor**

Update the seeding loop (the block that builds `contexts[slug]`):

```python
    contexts: dict[str, Context] = {}
    for slug, nm, category, desc, color in _CONTEXTS:
        contexts[slug] = Context(
            slug=slug, name=nm, category=category, description=desc, status="active", color=color
        )
        db.add(contexts[slug])
```

- [ ] **Step 3: Verify seeding runs**

Run: `cd backend && uv run python -m app.cli seed-demo`
Expected: `Seeded demo data (...)`. Then confirm colors landed:
```bash
docker compose -f ../docker-compose.yml exec -T postgres psql -U mc -d mc -c "SELECT slug, color FROM context ORDER BY slug;" 2>/dev/null
```
Expected: 5 rows with non-null colors (blue/violet/green/teal/amber).

- [ ] **Step 4: Commit**

```bash
git add backend/app/demo_seed.py
git commit -m "feat(demo): give seeded contexts palette colors"
```

---

## Task 4: Frontend types + palette CSS tokens

**Files:**
- Modify: `frontend/src/lib/types.ts:1-17`
- Modify: `frontend/src/styles/console.css` (after `--ctx-other` in both the `:root` and light-mode blocks)

- [ ] **Step 1: Add `color` to the TS types**

In `frontend/src/lib/types.ts`, add `color` to `Context` (after `status`) and to `ContextCreate` (after `status`):

```typescript
export interface Context {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  status: string;
  color: string | null;
  created_at: string;
  updated_at: string;
}
export interface ContextCreate {
  slug: string;
  name: string;
  category?: string;
  description?: string | null;
  status?: string;
  color?: string | null;
}
export type ContextUpdate = Partial<ContextCreate>;
```

- [ ] **Step 2: Add `--palette-*` tokens in the dark (`:root`) block**

In `frontend/src/styles/console.css`, immediately after the `--ctx-other: oklch(0.78 0.11 88);` line in the `:root` block, insert:

```css
  /* Palette — per-context color choices (12) */
  --palette-slate:   oklch(0.72 0.03 260);
  --palette-red:     oklch(0.70 0.15 25);
  --palette-orange:  oklch(0.75 0.14 55);
  --palette-amber:   oklch(0.80 0.12 85);
  --palette-green:   oklch(0.76 0.14 150);
  --palette-teal:    oklch(0.76 0.12 180);
  --palette-cyan:    oklch(0.78 0.11 210);
  --palette-blue:    oklch(0.74 0.12 248);
  --palette-indigo:  oklch(0.70 0.13 275);
  --palette-violet:  oklch(0.72 0.13 300);
  --palette-magenta: oklch(0.74 0.13 320);
  --palette-pink:    oklch(0.74 0.14 350);
```

- [ ] **Step 3: Add `--palette-*` tokens in the light-mode block**

In the light-mode block, immediately after the `--ctx-other: oklch(0.58 0.12 70);` line, insert:

```css
  --palette-slate:   oklch(0.55 0.03 260);
  --palette-red:     oklch(0.54 0.18 25);
  --palette-orange:  oklch(0.58 0.15 55);
  --palette-amber:   oklch(0.60 0.13 85);
  --palette-green:   oklch(0.54 0.14 150);
  --palette-teal:    oklch(0.52 0.12 180);
  --palette-cyan:    oklch(0.55 0.12 210);
  --palette-blue:    oklch(0.52 0.14 252);
  --palette-indigo:  oklch(0.50 0.15 275);
  --palette-violet:  oklch(0.52 0.15 300);
  --palette-magenta: oklch(0.54 0.15 322);
  --palette-pink:    oklch(0.56 0.16 350);
```

- [ ] **Step 4: Verify it compiles**

Run: `cd frontend && npm run build`
Expected: build succeeds (CSS + tsc), no type errors from the `types.ts` change.

- [ ] **Step 5: Commit**

```bash
git add frontend/src/lib/types.ts frontend/src/styles/console.css
git commit -m "feat(frontend): add color to Context type + 12 palette tokens (dark/light)"
```

---

## Task 5: Palette + `contextTint` resolver; ContextChip uses resolved color

**Files:**
- Modify: `frontend/src/components/console.tsx` (tint helpers near lines 10-19; `ContextChip` lines 110-129)
- Test: `frontend/src/components/console.test.tsx` (create)

- [ ] **Step 1: Write the failing unit test**

Create `frontend/src/components/console.test.tsx`:

```tsx
import { describe, it, expect } from "vitest";
import { contextTint, paletteVar } from "./console";

describe("paletteVar", () => {
  it("returns the palette var for a known key", () => {
    expect(paletteVar("teal")).toBe("var(--palette-teal)");
  });
  it("falls back for an unknown key", () => {
    expect(paletteVar("chartreuse")).toBe("var(--fg-dim)");
  });
});

describe("contextTint", () => {
  it("uses the palette var when a color is set", () => {
    expect(contextTint({ color: "blue", category: "work" })).toBe("var(--palette-blue)");
  });
  it("falls back to the category tint when color is null", () => {
    expect(contextTint({ color: null, category: "work" })).toBe("var(--ctx-work)");
  });
  it("falls back to the category tint when color is empty", () => {
    expect(contextTint({ color: "", category: "personal" })).toBe("var(--ctx-personal)");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm run test -- --run src/components/console.test.tsx`
Expected: FAIL — `contextTint`/`paletteVar` are not exported.

- [ ] **Step 3: Add `PALETTE`, `PALETTE_KEYS`, `paletteVar`, `contextTint`**

In `frontend/src/components/console.tsx`, just below the existing `tintColor` function (after line 19), add:

```tsx
export const PALETTE: { key: string; label: string }[] = [
  { key: "slate", label: "Slate" },
  { key: "red", label: "Red" },
  { key: "orange", label: "Orange" },
  { key: "amber", label: "Amber" },
  { key: "green", label: "Green" },
  { key: "teal", label: "Teal" },
  { key: "cyan", label: "Cyan" },
  { key: "blue", label: "Blue" },
  { key: "indigo", label: "Indigo" },
  { key: "violet", label: "Violet" },
  { key: "magenta", label: "Magenta" },
  { key: "pink", label: "Pink" },
];

const PALETTE_KEYS = new Set(PALETTE.map((p) => p.key));

export function paletteVar(key: string): string {
  return PALETTE_KEYS.has(key) ? `var(--palette-${key})` : "var(--fg-dim)";
}

// Resolved CSS color for a context: explicit palette color if set, else category tint.
export function contextTint(ctx: { color?: string | null; category: string }): string {
  return ctx.color ? paletteVar(ctx.color) : tintColor(ctx.category);
}
```

- [ ] **Step 4: Make `ContextChip` use the resolved color directly**

`ContextChip` currently re-resolves its `tint` prop via `tintColor(tint)`. Change it to treat `tint` as an already-resolved CSS color. Replace the `ContextChip` function body's dot line:

Change:
```tsx
      <span className="dot" style={{ background: tintColor(tint) }} />
```
to:
```tsx
      <span className="dot" style={{ background: tint }} />
```

Also update its doc/intent by keeping the prop typed as `tint: string` (now a resolved CSS color string). No other lines in `ContextChip` change.

- [ ] **Step 5: Run the unit test to verify it passes**

Run: `cd frontend && npm run test -- --run src/components/console.test.tsx`
Expected: PASS (5 assertions).

- [ ] **Step 6: Commit**

```bash
git add frontend/src/components/console.tsx frontend/src/components/console.test.tsx
git commit -m "feat(frontend): add palette + contextTint resolver; ContextChip uses resolved color"
```

> ⚠️ After Step 4, `ContextChip` callers in `index.tsx` still pass category *keys* (e.g. `"work"`) — those dots will render wrong until Task 8 updates them. Task 8 fixes this; if running tasks out of order, do Task 8 with Task 5.

---

## Task 6: `ColorPicker` component

**Files:**
- Create: `frontend/src/components/ColorPicker.tsx`
- Test: `frontend/src/components/ColorPicker.test.tsx`

- [ ] **Step 1: Write the failing test**

Create `frontend/src/components/ColorPicker.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ColorPicker } from "./ColorPicker";

describe("ColorPicker", () => {
  it("calls onChange with the picked palette key", async () => {
    const onChange = vi.fn();
    render(<ColorPicker value="" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Teal" }));
    expect(onChange).toHaveBeenCalledWith("teal");
  });

  it("calls onChange with empty string when default is picked", async () => {
    const onChange = vi.fn();
    render(<ColorPicker value="blue" onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "Default color" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("marks the selected swatch as pressed", () => {
    render(<ColorPicker value="teal" onChange={() => {}} />);
    expect(screen.getByRole("button", { name: "Teal" })).toHaveAttribute("aria-pressed", "true");
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm run test -- --run src/components/ColorPicker.test.tsx`
Expected: FAIL — `./ColorPicker` does not exist.

- [ ] **Step 3: Implement `ColorPicker`**

Create `frontend/src/components/ColorPicker.tsx`:

```tsx
import { PALETTE, paletteVar } from "./console";

const SWATCH = {
  width: 22,
  height: 22,
  borderRadius: "50%",
  cursor: "pointer",
  padding: 0,
} as const;

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
      <button
        type="button"
        aria-label="Default color"
        aria-pressed={value === ""}
        title="Default (category color)"
        onClick={() => onChange("")}
        style={{
          ...SWATCH,
          background: "var(--surface-3)",
          border: value === "" ? "2px solid var(--signal)" : "1px solid var(--line)",
        }}
      />
      {PALETTE.map((c) => (
        <button
          key={c.key}
          type="button"
          aria-label={c.label}
          aria-pressed={value === c.key}
          title={c.label}
          onClick={() => onChange(c.key)}
          style={{
            ...SWATCH,
            background: paletteVar(c.key),
            border: value === c.key ? "2px solid var(--fg)" : "1px solid var(--line)",
          }}
        />
      ))}
    </div>
  );
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `cd frontend && npm run test -- --run src/components/ColorPicker.test.tsx`
Expected: PASS (3 assertions).

- [ ] **Step 5: Commit**

```bash
git add frontend/src/components/ColorPicker.tsx frontend/src/components/ColorPicker.test.tsx
git commit -m "feat(frontend): add ColorPicker swatch component"
```

---

## Task 7: Contexts form — status + color; table swatch + StatusBadge

**Files:**
- Modify: `frontend/src/routes/contexts.tsx`
- Test: `frontend/src/routes/contexts.test.tsx` (create)

- [ ] **Step 1: Write the failing form test**

Create `frontend/src/routes/contexts.test.tsx`:

```tsx
import { describe, it, expect, vi } from "vitest";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  RouterProvider,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ContextsPage } from "./contexts";

function renderContexts(fetchMock: ReturnType<typeof vi.fn>) {
  vi.stubGlobal("fetch", fetchMock);
  const root = createRootRoute();
  const contexts = createRoute({ getParentRoute: () => root, path: "/contexts", component: ContextsPage });
  const login = createRoute({ getParentRoute: () => root, path: "/login", component: () => <div>login</div> });
  const activity = createRoute({ getParentRoute: () => root, path: "/activity", component: () => <div>activity</div> });
  const history = createMemoryHistory({ initialEntries: ["/contexts"] });
  const router = createRouter({ routeTree: root.addChildren([contexts, login, activity]), history });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe("ContextsPage form", () => {
  it("submits status and color in the create payload", async () => {
    const calls: Array<[string, RequestInit | undefined]> = [];
    const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([String(url), init]);
      if (String(url).includes("/auth/me")) {
        return new Response(JSON.stringify({ id: "u1", email: "g@x.com", name: "G" }), { status: 200 });
      }
      if (String(url).includes("/contexts") && (!init?.method || init.method === "GET")) {
        return new Response(JSON.stringify([]), { status: 200 });
      }
      if (String(url).includes("/contexts") && init?.method === "POST") {
        return new Response(
          JSON.stringify({
            id: "c1", slug: "oss", name: "Open Source", category: "other",
            description: null, status: "archived", color: "teal",
            created_at: "", updated_at: "",
          }),
          { status: 201 },
        );
      }
      return new Response(JSON.stringify({}), { status: 200 });
    });

    renderContexts(fetchMock);

    await screen.findByRole("heading", { name: "Contexts" });
    await userEvent.type(screen.getByRole("textbox", { name: "Name" }), "Open Source");
    await userEvent.type(screen.getByRole("textbox", { name: "Slug" }), "oss");
    await userEvent.selectOptions(screen.getByRole("combobox", { name: "Status" }), "archived");
    await userEvent.click(screen.getByRole("button", { name: "Teal" }));
    await userEvent.click(screen.getByRole("button", { name: /^add$/i }));

    await waitFor(() => {
      const post = calls.find(([u, i]) => String(u).includes("/contexts") && i?.method === "POST");
      expect(post).toBeDefined();
      const body = JSON.parse(post![1]!.body as string);
      expect(body.status).toBe("archived");
      expect(body.color).toBe("teal");
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd frontend && npm run test -- --run src/routes/contexts.test.tsx`
Expected: FAIL — there is no Status combobox and no "Teal" swatch button yet.

- [ ] **Step 3: Update imports and constants in `contexts.tsx`**

Replace the import of `ui` primitives (line 7) and add the new imports below the existing import block:

```tsx
import { Button, Card, Field, Input, Select } from "../components/ui";
import { ColorPicker } from "../components/ColorPicker";
import { StatusBadge, contextTint } from "../components/console";
```

Add a status options constant just above the `FormState` interface:

```tsx
const STATUS_OPTIONS = [
  { value: "active", label: "Active" },
  { value: "archived", label: "Archived" },
];
```

- [ ] **Step 4: Extend `FormState`, `EMPTY_FORM`, and handlers**

Replace the `FormState` interface and `EMPTY_FORM`:

```tsx
interface FormState {
  slug: string;
  name: string;
  category: string;
  description: string;
  status: string;
  color: string;
}

const EMPTY_FORM: FormState = {
  slug: "", name: "", category: "", description: "", status: "active", color: "",
};
```

Add a select-change helper next to the existing `handleChange` (which stays as-is):

```tsx
  function handleSelectChange(key: keyof FormState) {
    return (value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  }
```

- [ ] **Step 5: Populate status + color on edit, and include them in the payload**

Update `handleEdit` to set the new fields:

```tsx
  function handleEdit(row: Context) {
    setEditingId(row.id);
    setForm({
      slug: row.slug,
      name: row.name,
      category: row.category,
      description: row.description ?? "",
      status: row.status,
      color: row.color ?? "",
    });
  }
```

Update the `payload` in `handleSubmit`:

```tsx
    const payload = {
      slug: form.slug,
      name: form.name,
      category: form.category || undefined,
      description: form.description || null,
      status: form.status,
      color: form.color || null,
    };
```

- [ ] **Step 6: Add the Status and Color fields to the form JSX**

Inside the `<form>`, after the Description `<Field>` and before the submit-buttons `<div className="col-span-2 ...">`, insert:

```tsx
              <Field label="Status">
                <Select
                  value={form.status}
                  onChange={handleSelectChange("status")}
                  options={STATUS_OPTIONS}
                />
              </Field>
              <Field label="Color">
                <ColorPicker value={form.color} onChange={handleSelectChange("color")} />
              </Field>
```

- [ ] **Step 7: Upgrade the table — name swatch + StatusBadge**

Replace the `Name` and `Status` column definitions in the `columns` array:

```tsx
    {
      header: "Name",
      cell: (row: Context) => (
        <span className="row gap-2" style={{ alignItems: "center" }}>
          <span
            className="dot"
            style={{ background: contextTint(row), width: 9, height: 9, borderRadius: 9 }}
          />
          {row.name}
        </span>
      ),
    },
    { header: "Slug", cell: (row: Context) => row.slug },
    { header: "Category", cell: (row: Context) => row.category },
    { header: "Status", cell: (row: Context) => <StatusBadge status={row.status} /> },
```

- [ ] **Step 8: Run the form test to verify it passes**

Run: `cd frontend && npm run test -- --run src/routes/contexts.test.tsx`
Expected: PASS.

- [ ] **Step 9: Commit**

```bash
git add frontend/src/routes/contexts.tsx frontend/src/routes/contexts.test.tsx
git commit -m "feat(contexts): add status select + color picker to form; swatch + badge in table"
```

---

## Task 8: Wire color everywhere on the dashboard

**Files:**
- Modify: `frontend/src/routes/index.tsx` (import line 12; `ctxTint` helper lines 244-252; chip sites 417, 535, 555, 563)

- [ ] **Step 1: Swap the import**

In `frontend/src/routes/index.tsx`, the console import currently brings in `tintColor` (line 12) and `ContextChip` (line 7). Replace `tintColor` with `contextTint` in that import list (keep `ContextChip`). After the change the import list contains `ContextChip, ... contextTint` and no longer `tintColor`.

- [ ] **Step 2: Remove the local `ctxTint` helper**

Delete the `ctxTint` function (lines 244-252):

```tsx
  // Context tint: map category → tint key
  function ctxTint(category: string): string {
    const map: Record<string, string> = {
      work: "work",
      personal: "personal",
      side: "side",
    };
    return map[category] ?? "other";
  }
```

- [ ] **Step 3: Update the task-row chip (≈ line 417)**

`ctx` here is the full context object from the `ctxById` lookup. Change:

```tsx
                          <ContextChip tint={ctxTint(ctx.category)}>
```
to:
```tsx
                          <ContextChip tint={contextTint(ctx)}>
```

- [ ] **Step 4: Update the context-card chip and count color (≈ lines 535, 555, 563)**

`c` is the full context object from `contexts.map((c) => { ... })`. Change the tint computation (≈ line 535):

```tsx
                      const tint = contextTint(c);
```
The chip (≈ line 555) already reads `tint={tint}` — leave it. Change the count-number color (≈ line 563) from `color: tintColor(tint)` to:

```tsx
                              color: tint,
```

- [ ] **Step 5: Typecheck + run the full frontend suite**

Run: `cd frontend && npm run build && npm run test -- --run`
Expected: build succeeds with no unused-import / type errors (confirms `tintColor` is fully removed from `index.tsx` and `ctxTint` is gone), and all tests pass.

- [ ] **Step 6: Commit**

```bash
git add frontend/src/routes/index.tsx
git commit -m "feat(dashboard): tint context chips by their chosen color"
```

---

## Task 9: Full verification + manual smoke

- [ ] **Step 1: Backend suite**

Run: `cd backend && uv run pytest -q`
Expected: all pass (includes the new `test_context_color_and_status`).

- [ ] **Step 2: Frontend suite + build**

Run: `cd frontend && npm run test -- --run && npm run build`
Expected: all tests pass; build clean.

- [ ] **Step 3: Manual smoke (optional but recommended)**

Re-seed and run the app; open `/contexts`, confirm: the form shows Status and Color, picking a color + saving persists, the table shows the swatch + status badge, and the dashboard context chips reflect the chosen colors. Use the `verify` or `run` skill to launch the app.

- [ ] **Step 4: Final commit (if any stragglers)**

```bash
git status   # expect clean
```

---

## Self-Review

**Spec coverage:**
- Nullable `color` column + migration 0030 → Task 1. ✓
- `ContextColor` Literal + schema fields, 422 on invalid → Task 2. ✓
- 12 palette tokens (dark + light) → Task 4. ✓
- `PALETTE` single source of truth + `contextTint` resolver with category fallback → Task 5. ✓
- Color applies everywhere (all ContextChip/tintColor call sites = index.tsx only) → Tasks 5 + 8. ✓
- Status `Select` (active/archived) + `ColorPicker` in form; pre-fill on edit → Tasks 6, 7. ✓
- Table StatusBadge + swatch → Task 7. ✓
- Demo seed colors → Task 3. ✓
- Tests: migration up/down (Task 1 manual), color round-trip + null + 422 (Task 2), `contextTint` (Task 5), `ColorPicker` (Task 6), form submit (Task 7). ✓

**Placeholder scan:** No TBD/TODO; every code step shows full code. ✓

**Type/name consistency:** `contextTint(ctx: { color?: string | null; category: string })` defined in Task 5, called in Tasks 7 (`contextTint(row)`) and 8 (`contextTint(ctx)`, `contextTint(c)`) — `Context` satisfies the shape. `paletteVar` defined Task 5, used in Task 6. `PALETTE` keys (Task 5) match `ContextColor` Literal (Task 2) and `--palette-*` tokens (Task 4) — all 12: slate, red, orange, amber, green, teal, cyan, blue, indigo, violet, magenta, pink. `handleSelectChange` reused for both status and color (color emits a key string from `ColorPicker`). ✓
