# Context color + status form — design

**Date:** 2026-06-06
**Branch:** `feat/context-color-status`
**Status:** Approved (design)

## Goal

Let a user give each Context an explicit color chosen from a fixed palette of 12
theme-matched colors, and surface the Context `status` field in the create/edit
form (it is currently editable nowhere in the UI). The chosen color becomes the
Context's tint everywhere it is rendered, falling back to today's
category-derived tint when no color is set.

## Background

- **Model** ([backend/app/models/context.py](../../../backend/app/models/context.py)):
  `Context` has `slug`, `name`, `category` (`work|personal|side|other`, default
  `other`), `description`, `status` (`active|archived`, default `active`),
  timestamps. No `color` field today.
- **Schemas** ([backend/app/schemas/context.py](../../../backend/app/schemas/context.py)):
  `category` and `status` are typed as `Literal`s. `ContextCreate`,
  `ContextUpdate`, `ContextOut`.
- **API** ([backend/app/api/contexts.py](../../../backend/app/api/contexts.py)) +
  **service** ([backend/app/services/context.py](../../../backend/app/services/context.py)):
  generic CRUD with audit logging. No per-field logic, so no service changes are
  needed for a new column.
- **Migrations:** head is `0029_outbox_channel` (present on `main`). New
  migration chains as `0030`, `down_revision = "0029"`.
- **Frontend form** ([frontend/src/routes/contexts.tsx](../../../frontend/src/routes/contexts.tsx)):
  renders Name, Slug, Category (free-text `Input`), Description. **No status
  field.** Table shows `status` as plain text.
- **UI primitives** ([frontend/src/components/ui.tsx](../../../frontend/src/components/ui.tsx)):
  `Button`, `Input`, `Textarea`, `Card`, `Field`, and a `Select` taking
  `{ value, onChange, options, placeholder }` (already used in projects /
  relationships forms).
- **Color system** ([frontend/src/styles/console.css](../../../frontend/src/styles/console.css)):
  OKLCH design tokens with separate `:root` (dark) and light-mode values. Today a
  Context's tint is derived from its **category** via `tintColor()` /
  `ContextChip` in [frontend/src/components/console.tsx](../../../frontend/src/components/console.tsx).

## Decisions

1. **Store a palette key, not a raw color.** `color` holds a key like `"blue"` /
   `"teal"`, resolved to a themed `--palette-<key>` token. Rationale: adapts to
   light/dark, stays consistent with the existing token system, compact, and
   validatable as a closed set (like `category`/`status`). A raw hex would not
   theme-adapt and could clash; rejected.
2. **`color` is nullable; `null` = fall back to category tint.** Existing
   contexts and any context the user leaves on "default" keep today's behavior.
3. **Color applies everywhere a context is rendered** (not just the Contexts
   page), via a shared resolver, with category fallback so nothing regresses.
4. **Backend validates color against the 12-key set** (`Literal`), mirroring how
   `category`/`status` are already typed.

## The palette (12 colors)

Single source of truth: a `PALETTE` list in `console.tsx` of
`{ key, label, var }`, with matching `--palette-<key>` tokens defined in
`console.css` for **both** dark (`:root`) and light mode, tuned to the theme's
existing lightness/chroma character (dark ≈ `L 0.75 / C 0.12–0.14`, light ≈
`L 0.53 / C 0.13–0.15`).

Keys: `slate · red · orange · amber · green · teal · cyan · blue · indigo ·
violet · magenta · pink`.

(The specific hues/names can be retuned later without affecting the
architecture.)

## Changes by layer

### Backend

- **Model** `context.py`: add `color: Mapped[str | None] = mapped_column(String, nullable=True)`.
- **Migration** `0030_context_add_color.py` (`down_revision = "0029"`):
  `upgrade()` adds nullable `color` String column; `downgrade()` drops it.
- **Schemas** `context.py`:
  - `ContextColor = Literal["slate","red","orange","amber","green","teal","cyan","blue","indigo","violet","magenta","pink"]`
  - `ContextCreate.color: ContextColor | None = None`
  - `ContextUpdate.color: ContextColor | None = None`
  - `ContextOut.color: str | None`
- No API or service changes (generic CRUD + audit already cover a new column).

### Frontend — types & API

- [frontend/src/lib/types.ts](../../../frontend/src/lib/types.ts): add
  `color?: string | null` to `Context` and `ContextCreate`
  (`ContextUpdate = Partial<ContextCreate>` inherits it).
- No change to the `resource`/hooks layer.

### Frontend — palette + resolver (`console.tsx`)

- Add `PALETTE: { key: string; label: string; var: string }[]` (the 12 above).
- Add `paletteVar(key)` → `var(--palette-<key>)` for known keys, else fallback.
- Add `contextTint(ctx: { color?: string | null; category: string })`:
  returns `paletteVar(ctx.color)` when `color` is set, else `tintColor(ctx.category)`.
- Keep `tintColor`/`ContextChip` working as-is for callers that pass a bare tint
  string; update context-rendering call sites (below) to feed the resolved tint.

### Frontend — form (`routes/contexts.tsx`)

- Extend `FormState` with `status: string` and `color: string`
  (`""` = default / no color). Update `EMPTY_FORM` (status defaults to
  `"active"`).
- **Status**: `Select` with options `Active` / `Archived`.
- **Color**: new `ColorPicker` component (`frontend/src/components/ColorPicker.tsx`)
  — 12 swatch dots + a "default" (none) choice; selected swatch is ringed;
  emits the key or `""`.
- `handleEdit` populates `status` and `color` from the row; submit sends
  `status` and `color` (send `null`/omit when `""`).

### Frontend — app-wide color application

- Enumerate ContextChip / context-tint call sites during planning (People,
  Tasks, dashboard, anywhere a context dot/chip is rendered) and update each to
  pass `contextTint(context)`. Category fallback guarantees color-less contexts
  look exactly as they do today.

### Frontend — Contexts table

- Render `status` with the existing `StatusBadge`.
- Add a small color swatch next to the Name cell (uses `contextTint`).

### Demo seed

- [backend/app/demo_seed.py](../../../backend/app/demo_seed.py): assign a color
  to a couple of entries in `_CONTEXTS` so seeded data demonstrates the feature.

## Testing

- **Backend:**
  - Migration `0030` applies and reverts cleanly.
  - Create/update a context with a valid `color` → round-trips in `ContextOut`.
  - Invalid color key → `422`.
  - `color` omitted → stored/returned as `null`.
- **Frontend:**
  - Form submits `status` and `color`; editing pre-fills both.
  - `contextTint` returns the palette var when `color` set, category fallback
    when not.
  - `ColorPicker` selects/clears a color and reflects the selected swatch.

## Out of scope (YAGNI)

- Converting `category` from free-text to a select.
- Custom/arbitrary colors beyond the 12.
- Per-user palette customization.
