import { createRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { DataTable } from "../components/DataTable";
import { Pagination } from "../components/Pagination";
import { ProactiveFeedbackControls } from "../components/ProactiveFeedbackControls";
import { RequireAuth } from "../components/RequireAuth";
import { useAuditPage, useRevert } from "../features/audit/api";
import {
  useDismissProactiveRun,
  useMuteProactiveRun,
  useProactiveRunsPage,
} from "../features/proactiveRuns/api";
import type { AuditEntry, ProactiveRun, RelatedEntityRef } from "../lib/types";
import { rootRoute } from "./root";

type ActivityTab = "all" | "ai-writes" | "proactive";

/** Fields tried, in order, when deriving a human name from an audit snapshot. */
const NAME_FIELDS = ["title", "name", "body", "slug"] as const;

/** entity_type → list route for records edited via a drawer (deep-link with ?edit). */
const EDITABLE_ROUTE = {
  task: "/tasks",
  context: "/contexts",
  project: "/projects",
  company: "/companies",
  habit: "/habits",
  meeting: "/meetings",
  knowledge: "/knowledge",
  telos: "/telos",
  tone: "/tones",
  review: "/reviews",
  journal: "/journal",
  tag: "/tags",
  relationship: "/relationships",
  observation: "/observations",
} as const;

/** entity_type → list route for records without an edit drawer (link to the page). */
const PLAIN_ROUTE = {
  inbox_item: "/inbox",
  entity_tag: "/entity-tags",
  entity_link: "/entity-links",
} as const;

/** The create/update/delete snapshot that carries the entity's fields. */
function snapshot(entry: AuditEntry): Record<string, unknown> | null {
  return entry.after ?? entry.before;
}

/** Best-effort human name for an audited entity, falling back to its id. */
function entityName(entry: AuditEntry): string {
  const snap = snapshot(entry);
  if (snap) {
    for (const field of NAME_FIELDS) {
      const value = snap[field];
      if (typeof value === "string" && value.trim()) {
        return value.length > 60 ? `${value.slice(0, 60)}…` : value;
      }
    }
  }
  return entry.entity_id;
}

/** The entity's name, linked to where you can open it (drawer, page, or detail). */
function EntityName({ entry }: { entry: AuditEntry }) {
  const name = entityName(entry);
  const type = entry.entity_type;

  if (type === "person") {
    const slug = snapshot(entry)?.slug;
    if (typeof slug === "string" && slug) {
      return (
        <Link to="/people/$slug" params={{ slug }} className="underline">
          {name}
        </Link>
      );
    }
    return <>{name}</>;
  }

  if (type in EDITABLE_ROUTE) {
    return (
      <Link
        to={EDITABLE_ROUTE[type as keyof typeof EDITABLE_ROUTE]}
        search={{ edit: entry.entity_id }}
        className="underline"
      >
        {name}
      </Link>
    );
  }

  if (type in PLAIN_ROUTE) {
    return (
      <Link to={PLAIN_ROUTE[type as keyof typeof PLAIN_ROUTE]} className="underline">
        {name}
      </Link>
    );
  }

  return <>{name}</>;
}

function UndoButton({ row }: { row: AuditEntry }) {
  const revert = useRevert();
  return (
    <button
      type="button"
      disabled={row.reverted}
      className="btn ghost sm disabled:cursor-not-allowed disabled:opacity-40"
      onClick={() => revert.mutate(row.id)}
    >
      Undo
    </button>
  );
}

function TabButton({
  active,
  children,
  onClick,
}: {
  active: boolean;
  children: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`btn sm ${active ? "primary" : "ghost"}`}
      aria-pressed={active}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

function RelatedEntityLink({ entity }: { entity: RelatedEntityRef }) {
  const label = entity.label ?? `${entity.entity_type} ${entity.entity_id.slice(0, 8)}`;

  if (entity.entity_type === "person") {
    return <span>{label}</span>;
  }

  if (entity.entity_type in EDITABLE_ROUTE) {
    return (
      <Link
        to={EDITABLE_ROUTE[entity.entity_type as keyof typeof EDITABLE_ROUTE]}
        search={{ edit: entity.entity_id }}
        className="underline"
      >
        {label}
      </Link>
    );
  }

  if (entity.entity_type in PLAIN_ROUTE) {
    return (
      <Link to={PLAIN_ROUTE[entity.entity_type as keyof typeof PLAIN_ROUTE]} className="underline">
        {label}
      </Link>
    );
  }

  return <span>{label}</span>;
}

function ProactiveRunCard({ run }: { run: ProactiveRun }) {
  const dismiss = useDismissProactiveRun();
  const mute = useMuteProactiveRun();
  const delivery = Object.entries(run.delivery_status);

  return (
    <article
      style={{
        borderTop: "1px solid var(--line-soft)",
        padding: "16px 0",
        display: "grid",
        gap: 12,
      }}
    >
      <div className="row gap-2 wrap" style={{ justifyContent: "space-between", alignItems: "start" }}>
        <div style={{ display: "grid", gap: 4, minWidth: 0 }}>
          <div className="row gap-2 wrap">
            <h2 className="title-sm" style={{ margin: 0 }}>
              {run.trigger_reason}
            </h2>
            <span className="badge">{run.outcome}</span>
          </div>
          <p className="meta" style={{ margin: 0 }}>
            {run.routine_name} · {new Date(run.created_at).toLocaleString()}
          </p>
        </div>
        <div className="row gap-2 wrap">
          <button
            type="button"
            className="btn ghost sm"
            disabled={run.outcome === "dismissed" || dismiss.isPending}
            onClick={() => dismiss.mutate(run.id)}
          >
            {dismiss.isPending ? "Dismissing..." : "Dismiss"}
          </button>
          <button
            type="button"
            className="btn ghost sm"
            disabled={run.outcome === "muted" || mute.isPending}
            onClick={() => mute.mutate(run.id)}
          >
            {mute.isPending ? "Muting..." : "Mute routine"}
          </button>
          <Link to="/settings" className="btn ghost sm">
            Tune policy
          </Link>
        </div>
      </div>
      {(dismiss.isError || mute.isError) && (
        <p className="meta" style={{ color: "var(--st-danger)", margin: 0 }}>
          Could not update this proactive run. Please try again.
        </p>
      )}

      <dl
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
          gap: "12px 16px",
          margin: 0,
          fontSize: 13,
        }}
      >
        <div>
          <dt className="label">Source facts</dt>
          <dd style={{ margin: "4px 0 0" }}>{run.trigger_data_summary}</dd>
        </div>
        <div>
          <dt className="label">Policy result</dt>
          <dd style={{ margin: "4px 0 0" }}>{run.policy_decision}</dd>
        </div>
        <div>
          <dt className="label">Delivery</dt>
          <dd className="row gap-2 wrap" style={{ margin: "4px 0 0" }}>
            {delivery.length === 0
              ? "No delivery status yet."
              : delivery.map(([channel, status]) => (
                  <span className="badge" key={channel}>
                    {channel}: {status}
                  </span>
                ))}
          </dd>
        </div>
        <div>
          <dt className="label">Message</dt>
          <dd style={{ margin: "4px 0 0" }}>
            <strong>{run.message_title}</strong>
            <div className="meta">{run.message_summary}</div>
          </dd>
        </div>
        <div>
          <dt className="label">Related</dt>
          <dd className="row gap-2 wrap" style={{ margin: "4px 0 0" }}>
            {run.related_entities.length === 0
              ? "None"
              : run.related_entities.map((entity) => (
                  <RelatedEntityLink
                    key={`${entity.entity_type}:${entity.entity_id}`}
                    entity={entity}
                  />
                ))}
          </dd>
        </div>
        <div>
          <dt className="label">Audit links</dt>
          <dd className="row gap-2 wrap" style={{ margin: "4px 0 0" }}>
            {run.agent_run_id && <span className="badge">Agent {run.agent_run_id.slice(0, 8)}</span>}
            {run.audit_log_ids.length === 0
              ? "No mutations linked."
              : run.audit_log_ids.map((id) => (
                  <a key={id} href={`/activity?audit=${id}`} className="underline">
                    Audit {id.slice(0, 8)}
                  </a>
                ))}
          </dd>
        </div>
      </dl>
    </article>
  );
}

export function ActivityPage() {
  const [offset, setOffset] = useState(0);
  const [aiWritesOffset, setAiWritesOffset] = useState(0);
  const [proactiveOffset, setProactiveOffset] = useState(0);
  const [tab, setTab] = useState<ActivityTab>("all");
  const auditOffset = tab === "ai-writes" ? aiWritesOffset : offset;
  const { data: auditPage } = useAuditPage(
    auditOffset,
    undefined,
    tab === "ai-writes",
  );
  const { data: proactivePage } = useProactiveRunsPage(proactiveOffset);
  const entries = auditPage?.items ?? [];
  const proactiveRuns = proactivePage?.items ?? [];
  const auditEntries = entries;

  function switchTab(next: ActivityTab) {
    setTab(next);
    setOffset(0);
    setAiWritesOffset(0);
    setProactiveOffset(0);
  }

  const columns = [
    {
      header: "When",
      cell: (row: AuditEntry) => new Date(row.created_at).toLocaleString(),
    },
    { header: "Action", cell: (row: AuditEntry) => row.action },
    {
      header: "Entity",
      cell: (row: AuditEntry) => (
        <span className="row gap-2">
          <EntityName entry={row} />
          <span className="meta" style={{ color: "var(--fg-faint)" }}>
            {row.entity_type}
          </span>
        </span>
      ),
    },
    { header: "Surface", cell: (row: AuditEntry) => row.surface },
    {
      header: "Reverted",
      cell: (row: AuditEntry) => (row.reverted ? "Yes" : "No"),
    },
    {
      header: "Undo",
      cell: (row: AuditEntry) => <UndoButton row={row} />,
    },
    {
      header: "Aya feedback",
      cell: (row: AuditEntry) => (
        <ProactiveFeedbackControls
          entityType={row.entity_type}
          entityRef={row.entity_id}
          triggerRef={`audit:${row.id}`}
          compact
        />
      ),
    },
  ];

  return (
    <RequireAuth>
      <AppShell>
        <div
          className="page"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 16,
          }}
        >
          <div className="row gap-3 wrap" style={{ justifyContent: "space-between" }}>
            <h1 className="title" style={{ margin: 0 }}>
              Activity
            </h1>
            <div className="row gap-2" role="tablist" aria-label="Activity filters">
              <TabButton active={tab === "all"} onClick={() => switchTab("all")}>
                All
              </TabButton>
              <TabButton active={tab === "ai-writes"} onClick={() => switchTab("ai-writes")}>
                AI Writes
              </TabButton>
              <TabButton active={tab === "proactive"} onClick={() => switchTab("proactive")}>
                Proactive
              </TabButton>
            </div>
          </div>

          {tab === "proactive" ? (
            <section aria-label="Proactive run log">
              {proactiveRuns.length === 0 ? (
                <p className="meta" style={{ padding: 16 }}>
                  No proactive runs yet.
                </p>
              ) : (
                proactiveRuns.map((run) => <ProactiveRunCard key={run.id} run={run} />)
              )}
              {proactivePage && (
                <Pagination page={proactivePage.page} onChange={setProactiveOffset} />
              )}
            </section>
          ) : (
            <>
              <DataTable
                rows={auditEntries}
                columns={columns}
                empty={tab === "ai-writes" ? "No AI writes yet." : "No activity yet."}
              />
              {auditPage && (
                <Pagination
                  page={auditPage.page}
                  onChange={tab === "ai-writes" ? setAiWritesOffset : setOffset}
                />
              )}
            </>
          )}
        </div>
      </AppShell>
    </RequireAuth>
  );
}

export const activityRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/activity",
  component: ActivityPage,
});
