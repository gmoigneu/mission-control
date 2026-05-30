# mission-control — Design brief

> For the designer agent. Source of truth for product behaviour: [SPEC.md](SPEC.md).
> Goal of this doc: enumerate every screen, the shell, cross-cutting patterns, and key flows — enough for the designer to produce wireframes and a visual system without re-reading the spec.

---

## 1. Product in one paragraph

mission-control is a **single-user, self-hosted personal OS** for G. It replaces a markdown vault as the system of record for contexts, projects, people, tasks, journal, habits, meetings, knowledge, goals (TELOS), and writing tones. Every domain has a full CRUD UI. A persistent AI agent ("Aya") reads and writes the same data via chat, quick-capture (Cmd-K), and voice — autonomously, with one-click undo on every change.

## 2. Audience & tone

- **One user**, power user, lives in the app daily across desktop and mobile (responsive web + PWA).
- Tone: **calm, focused, slightly editorial** — a personal command center, not an enterprise SaaS. Warm but information-dense. Think Linear × Things × Notion, with a clear AI surface.
- Dark mode first, light mode supported. High legibility for long-form text (journal, knowledge notes, meeting transcripts).

## 3. Tech & design constraints

- **Stack**: React 19, TanStack Router (file-based), Tailwind CSS, **shadcn/ui (Radix)**. Designer should default to shadcn primitives (Button, Dialog, Command, Sheet, Tabs, DropdownMenu, Form, Table, Toast, Tooltip, Popover, Calendar, ScrollArea, Avatar, Badge, Switch).
- **Responsive**: desktop-first layouts that gracefully collapse to mobile (PWA installable). No offline UX in v1.
- **Iconography**: Lucide.
- **Typography**: one sans (UI) + one serif or monospaced accent for long-form (journal, knowledge). Tabular numerals for tables.
- **Density**: comfortable on desktop, compact tables available. Generous whitespace in long-form views.

---

## 4. App shell

Persistent across all routes.

```
┌──────────────────────────────────────────────────────────────────────────┐
│  Top bar:  [logo / today's date]   [Cmd-K capture input]   [🎙 voice]  [👤]│
├────────────┬──────────────────────────────────────────────┬──────────────┤
│            │                                              │              │
│  Left nav  │             Route content                    │  AI chat     │
│  (domains) │                                              │  panel       │
│            │                                              │  (collapse)  │
│            │                                              │              │
└────────────┴──────────────────────────────────────────────┴──────────────┘
```

**Left nav** (collapsible to icon rail on narrow screens):
- Dashboard
- Contexts
- Projects
- People
- Companies
- Tasks
- Journal
- Reviews
- Habits
- Meetings
- Knowledge
- Inbox
- TELOS
- — divider —
- Tones
- Activity (AI audit feed)
- Settings

**Top bar**:
- Left: app mark + today's date pill ("Thu · May 29").
- Center: **Cmd-K quick-capture input** — single text field, expands into a Command palette modal on focus / `⌘K`. Placeholder: *"Capture anything…"*.
- Right: 🎙 **voice button** (push-to-talk; opens a recording sheet), avatar menu (settings, logout).

**Right chat panel** (Aya):
- Docked drawer, collapsible to a floating pill in the bottom-right.
- Streaming chat transcript; message composer with attach + voice.
- Each AI write appears inline as a small card ("Created task: Follow up with Sarah · **Undo**").
- Header shows agent status (idle / thinking / writing) and a "New conversation" button.

**Cross-cutting toasts**:
- After any AI write: `Aya created <X> · Undo` (dismisses after 8s, persists in Activity).
- After any user write: standard success toast; destructive actions get an inline confirm.

---

## 5. Cross-cutting patterns to design once

| Pattern | Notes |
|---|---|
| **Empty states** | Friendly one-liner + primary CTA + secondary "ask Aya" link that opens chat pre-filled. |
| **List → detail** | Two-pane on desktop (master list left, detail right), stacked on mobile. |
| **Detail header** | Title, status badge, context/project breadcrumb, action menu (⋯), edit-in-place title. |
| **Tabs in detail views** | Overview · Activity · Linked items · Raw (markdown). |
| **Markdown editor** | Used in journal, knowledge notes, project body, meeting body. Live preview toggle, slash-commands, image paste, wikilink autocomplete (`@person`, `#context`). |
| **Tag chips** | Polymorphic tags appear everywhere; clickable → filtered list view. |
| **Observation row** | Date · kind badge (observation/preference/fact/open_loop/decision/key_point/open_question) · body. Used on person, meeting, project detail timelines. |
| **Entity link picker** | Combobox that searches across all entity types; used to add relationships, link tasks to meetings, cite sources. |
| **Undo toast** | `Aya created <X> · Undo` — clicking reverts the whole agent run, not just one row. |
| **AI activity badge** | Items modified by Aya carry a small ✦ icon in lists; hover shows the agent run + revert link. |
| **Confirm dialogs** | Only for destructive user actions (delete). AI actions never confirm — undo is the safety net. |

---

## 6. Screens

For each: purpose, layout, key elements. Ordered to match the left nav.

### 6.1 Auth — `/login`
- Single-card centered layout.
- Email + password fields; "Use passkey" secondary button.
- No registration link. Forgot-password is out of scope v1.

### 6.2 Dashboard — `/`
The home view. "Today, at a glance."
- **Hero row**: today's date, mood/energy quick-set (1–5 pickers), TELOS one-liner.
- **Tasks due today / overdue**: compact checklist; quick-complete.
- **Today's journal**: inline editor with summary + log textarea ("what happened?") with timestamped log entries.
- **Habits grid**: row of habits with today's status dots; tap to mark done/skip/partial.
- **Top of mind by context**: cards per active context with their next 3 tasks + open loops count.
- **Recent AI activity**: last 5 Aya writes with undo.

### 6.3 Contexts — `/contexts`, `/contexts/$slug`
- **List**: card grid, one card per context with category badge (work / personal / side / other), status, project count, open-task count.
- **Detail**: header (name, category, status, edit), tabs: Overview (description + linked projects/people/meetings/tasks counts), Projects, People, Meetings, Tasks, Observations.

### 6.4 Projects — `/projects`, `/projects/$slug`
- **List**: table (title, context, status, last activity, open tasks). Filters: context, status. Status board view available (Active / On hold / Complete / Archived).
- **Detail**: header with context breadcrumb + status. Body = markdown (`purpose`, `body`). Right rail: linked tasks, meetings, people, observations. Tabs: Overview, Tasks, Meetings, Activity.

### 6.5 People — `/people`, `/people/$slug`
- **List**: searchable list/table (name, role, company, primary context, last interaction). Avatar/initials. Filters: context, company, tag.
- **Detail** (the most-used CRM view):
  - Header: avatar, name, role @ company (links to company), first-met date, primary context badge, edit.
  - **Facts panel**: email, LinkedIn, primary context, tags.
  - **Summary**: markdown of `summary` ("Context" section from aya).
  - **Observations timeline**: vertically stacked observation rows, grouped by month. Filter chips for kind. Add-observation inline composer at top.
  - **Relationships**: list of `relationship` rows (type, since, notes, link to other person) + small **graph view** (force-directed mini-graph of 1–2 hops, powered by Neo4j; tap node → navigate).
  - **Meetings**: list with date + title + summary excerpt.
  - **Open loops**: filtered observations where `kind=open_loop`.

### 6.6 Companies — `/companies`, `/companies/$slug`
- **List**: simple table (name, domain, # people known).
- **Detail**: header, domain link, notes, list of people with role badges.

### 6.7 Tasks — `/tasks`, `/tasks/$id`
- Two top-level views: **List** (default) and **Board** (Kanban by status).
- Sticky filter bar: context, project, priority, due (today / this week / overdue), status, has-due-date, tag.
- **List row**: checkbox, title, context · project breadcrumb, priority dot, due chip (red if overdue), AI-touched ✦ icon.
- **Detail**: title (edit-in-place), status pill, priority, due/scheduled dates (calendar pickers), context/project comboboxes. Markdown body (context, acceptance criteria, notes). Outcome field. Linked tasks (related/blocks/duplicates) with quick-add. Source field (free text or entity link). Activity tab shows audit log.

### 6.8 Journal — `/journal`, `/journal/$date`
- **Index**: month calendar (heat-tinted by entry presence/mood). Sidebar shows recent entries. Click a day → detail.
- **Detail** (`/journal/$date`):
  - Header: date, prev/next day arrows, mood/energy pickers (1–5 stars or dots).
  - **Summary** (markdown editor) — the prose daily review.
  - **Log**: timestamped log lines. Composer at bottom (autosaves). Each line has time + text; inline edit/delete.
  - **TELOS alignment** field (short text).
  - **Body**: catch-all markdown for unstructured stuff.
  - Right rail: today's habit grid, tasks completed today, observations added today.

### 6.9 Reviews — `/reviews`
- Tabs: Weekly / Monthly.
- List of past reviews (period, title excerpt). "New review" button → period picker → markdown editor with starter template.
- Detail: full markdown view + telos_alignment.

### 6.10 Habits — `/habits`
- **Grid view**: rows = habits, columns = last N days (28 on desktop, 14 on mobile). Cells colored by status (done/partial/skip/empty). Today's column highlighted; tap to log.
- **Streaks**: each row shows current streak + cadence target ("5×/week").
- **Habit detail** (sheet/drawer): name, description, cadence, target, context, archive toggle, history chart.
- New habit dialog with cadence + target controls.

### 6.11 Meetings — `/meetings`, `/meetings/$id`
- **List**: table by date desc (date, title, context, participants avatars, # follow-ups). Filter by context, person, date range.
- **Detail**:
  - Header: title, date, context/project, participants (avatar stack).
  - **Summary** (executive summary) — markdown.
  - **Sections** (observation rows): Decisions, Key points, Open questions. Each is an observation with the matching `kind`. Add-row composer.
  - **Follow-ups**: tasks linked to this meeting. Inline "create follow-up" button.
  - **Participants**: editable list (person picker + role).
  - **Transcript** tab: raw transcript (long-form, monospaced or serif), collapsible.

### 6.12 Knowledge — `/knowledge`, `/knowledge/$slug`
- **Index**: search-first. Big search bar (semantic). Two sub-tabs: **Notes** (wiki) and **Sources** (raw).
- **List**: cards/table with title, type (concept/framework/synthesis/entity for notes; arxiv/article/video/… for sources), tags, captured date, author.
- **Note detail**: title, type pill, status, markdown body (long-form serif), citations panel (linked sources with quote excerpts).
- **Source detail**: title, source type, URL, author, published/captured dates, description, body (excerpts/takeaways), notes citing this source.

### 6.13 Inbox — `/inbox`
- "Review later" queue. Compact list, swipe/right-click → Review / Archive / Promote to task or knowledge note.
- Columns: title, source_type pill, priority, note (why it mattered), age.
- Filters: status (queued/reviewed/archived), source_type, priority.

### 6.14 TELOS — `/telos`
- One long page, sectioned:
  - **Purpose & Mission** — large editorial text.
  - **Priority order** — ordered list.
  - **Goals** — table grouped by domain (work / gaal / side / personal), each row: code (G1…), text, status, metric, target. Inline edit.
  - **Priority blocks** — week grid (mon–sun × time-of-day) showing recurring labelled blocks with context tint.
  - **Narratives / Strategies / Wisdom / Challenges / Problems** — collapsible sections of `telos_item` rows.
  - **Last review** date + cadence; "Start review" CTA.

### 6.15 Tones — `/tones`, `/tones/$slug`
- **List**: name + 1-line excerpt of voice guide.
- **Detail**: markdown voice guide editor. "Draft with this tone" CTA opens chat pre-filled.

### 6.16 Activity — `/activity`
- Filtered view of `audit_log` (default: `surface != ui`, i.e. AI + capture + voice + migration).
- Table: timestamp, surface badge, actor, action, entity (linked), summary of before→after, **Undo** button.
- Filter by entity type, surface, date range, agent_run.
- Grouped view: collapse all rows from one `agent_run_id` into a card with "Undo this entire run".

### 6.17 Settings — `/settings`
- Sections: Profile, Auth (password + passkeys), Appearance (theme, density), AI (model, temperature, default tone), Integrations (LLM/embeddings/STT keys masked), Data (export, reindex, rebuild graph), About.

---

## 7. Key flows to storyboard

The designer should produce sequence frames for these.

1. **Quick-capture (Cmd-K)** — user types `"met Sarah from Acme, follow up next week"` → palette shows live preview of what Aya will create (company, person, meeting, task) → Enter → toast `Aya created 4 items · Undo`. Show empty input, mid-typing parse preview, success toast, and Activity row.
2. **Voice capture** — tap 🎙 → bottom sheet with waveform + "Listening…" → stop → transcript appears → same preview/confirm as Cmd-K.
3. **Chat with Aya** — open chat panel, ask "who do I know at Acme?" → streamed answer with person cards → click → person detail. Then "add an observation that she prefers async comms" → toast + inline card in chat with undo.
4. **Undo a single change** — Activity row → Undo → confirmation → toast `Reverted`. Show before/after diff modal on hover.
5. **Undo an agent run** — chat card "Created 4 items" → Undo run → confirm → toast.
6. **Person detail deep-dive** — show all panels populated (facts, summary, observations timeline, relationships + mini graph, meetings, open loops).
7. **Daily journal flow** — open today, set mood/energy, type log lines through the day, end-of-day summary written by user or via "Summarize my day with Aya".
8. **Task triage** — tasks board, drag between columns, multi-select to bulk-set context.
9. **Mobile** — show shell collapsed: bottom nav (Dashboard / Tasks / Journal / Capture-FAB / Chat), single-pane detail views.

---

## 8. Visual system asks

- **Color**: neutral base (zinc/slate); semantic accents for status (success / warning / danger / info); per-context tints (each context gets a stable color used in chips and priority-block grid).
- **Status colors**: open=neutral, in_progress=blue, done=green, archived=muted; priority: low=muted, normal=neutral, high=amber/red.
- **AI affordance**: a single recurring sparkle/✦ token denotes anything AI-touched. Aya's chat bubbles get a subtle gradient or accent to distinguish from user messages.
- **Density toggle**: comfortable (default) and compact in tables.
- **Motion**: minimal — fades and small slides for sheets and toasts; no decorative animation.

---

## 9. Out of scope for design v1

- Offline indicators / sync queue UI.
- Multi-user (sharing, permissions, invites).
- Cron/automation surfaces (morning brief, automated reviews).
- Native mobile app shell.
- Google Health integration UI.
- External-send actions (email/LinkedIn drafting → sending).

---

## 10. Deliverables expected from the designer agent

1. App shell wireframe (desktop + mobile) with all three regions populated.
2. One wireframe per screen listed in §6 (low-fi is fine; annotate components from shadcn).
3. Storyboards for the 9 flows in §7.
4. A component sheet of the cross-cutting patterns in §5 (observation row, entity-link picker, undo toast, AI activity badge, chat message, capture preview card).
5. Color + type tokens, dark and light, expressed as Tailwind theme extensions.
