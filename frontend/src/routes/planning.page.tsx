import { Link, useLocation } from "@tanstack/react-router";
import {
  Bell,
  Check,
  Clock3,
  ExternalLink,
  MessagesSquare,
  Moon,
  RefreshCw,
  Send,
  Sun,
  X,
} from "lucide-react";
import { useMemo, useState } from "react";
import { AppShell } from "../components/AppShell";
import { Markdown } from "../components/Markdown";
import { RequireAuth } from "../components/RequireAuth";
import { Badge, Button, Input, Select } from "../components/ui";
import {
  useApplyPlanningMessage,
  useDeliverPlanningTelegram,
  useGeneratePlanningMessage,
  usePlanningMessages,
  useUpdatePlanningMessage,
} from "../features/planning/api";
import type {
  PlanningAction,
  PlanningKind,
  PlanningMessage,
  PlanningRecommendation,
} from "../lib/types";

const KIND_LABELS: Record<PlanningKind, string> = {
  evening_plan: "Evening plan",
  morning_triage: "Morning triage",
  midday_replan: "Midday replan",
  follow_through_nudge: "Nudge",
};

const ACTION_OPTIONS: { value: PlanningAction; label: string }[] = [
  { value: "keep_today", label: "Keep today" },
  { value: "move_tomorrow", label: "Move tomorrow" },
  { value: "defer", label: "Defer" },
  { value: "mark_done", label: "Mark done" },
  { value: "archive", label: "Archive" },
  { value: "clarify", label: "Clarify" },
  { value: "convert_inbox_to_task", label: "Convert to task" },
  { value: "none", label: "No change" },
];

const BUCKET_LABELS: Record<string, string> = {
  overdue: "Overdue",
  due_today: "Due today",
  due_soon: "Due soon",
  unclear: "Stale / unclear",
  stale: "Stale / unclear",
  inbox: "Inbox",
  nice_to_have: "Later",
};

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

function tomorrowISO() {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
}

function selectedMessage(messages: PlanningMessage[], selectedId: string | null) {
  if (selectedId) {
    return messages.find((message) => message.id === selectedId) ?? messages[0] ?? null;
  }
  return messages[0] ?? null;
}

function actionUsesDate(action: PlanningAction) {
  return action === "defer" || action === "keep_today" || action === "move_tomorrow";
}

function recs(message: PlanningMessage | null): PlanningRecommendation[] {
  return message?.body.recommendations ?? [];
}

function groupRecommendations(items: PlanningRecommendation[]) {
  const groups = new Map<string, PlanningRecommendation[]>();
  for (const item of items) {
    const key = BUCKET_LABELS[item.bucket] ?? item.bucket;
    groups.set(key, [...(groups.get(key) ?? []), item]);
  }
  return Array.from(groups.entries());
}

function RecommendationRow({
  rec,
  checked,
  action,
  dateValue,
  onChecked,
  onAction,
  onDate,
}: {
  rec: PlanningRecommendation;
  checked: boolean;
  action: PlanningAction;
  dateValue: string;
  onChecked: (checked: boolean) => void;
  onAction: (action: PlanningAction) => void;
  onDate: (date: string) => void;
}) {
  return (
    <div
      className="card"
      style={{
        padding: 12,
        borderRadius: "var(--r-sm)",
        display: "grid",
        gap: 10,
      }}
    >
      <div className="row" style={{ justifyContent: "space-between", gap: 12 }}>
        <label className="row gap-2" style={{ minWidth: 0 }}>
          <input
            type="checkbox"
            checked={checked}
            onChange={(e) => onChecked(e.target.checked)}
            aria-label={`Approve ${rec.title}`}
          />
          <span style={{ fontWeight: 650, overflowWrap: "anywhere" }}>{rec.title}</span>
        </label>
        <Badge>{rec.status}</Badge>
      </div>
      <div className="meta" style={{ color: "var(--fg-dim)" }}>
        {rec.reason}
      </div>
      <div
        className="grid"
        style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 180px), 1fr))", gap: 8 }}
      >
        <Select value={action} onChange={(value) => onAction(value as PlanningAction)} options={ACTION_OPTIONS} />
        <Input
          type="date"
          aria-label={`Date for ${rec.title}`}
          value={dateValue}
          onChange={(e) => onDate(e.target.value)}
        />
      </div>
    </div>
  );
}

export function PlanningPage() {
  const location = useLocation();
  const requestedId =
    typeof location.search === "object" && location.search
      ? String((location.search as Record<string, unknown>).message ?? "")
      : "";
  const [selectedId, setSelectedId] = useState<string | null>(requestedId || null);
  const { data: messages = [], isLoading } = usePlanningMessages();
  const generate = useGeneratePlanningMessage();
  const update = useUpdatePlanningMessage();
  const apply = useApplyPlanningMessage();
  const deliver = useDeliverPlanningTelegram();
  const message = selectedMessage(messages, selectedId);
  const recommendations = useMemo(() => recs(message), [message]);
  const groups = useMemo(() => groupRecommendations(recommendations), [recommendations]);
  const committedIds = useMemo(
    () => new Set(message?.body.sections?.committed_task_ids ?? []),
    [message],
  );
  const [selectedOverrides, setSelectedOverrides] = useState<Record<string, boolean>>({});
  const [actions, setActions] = useState<Record<string, PlanningAction>>({});
  const [dates, setDates] = useState<Record<string, string>>({});
  const selectedCount = recommendations.filter((rec) => isSelected(rec)).length;

  function isSelected(rec: PlanningRecommendation) {
    return selectedOverrides[rec.id] ?? (committedIds.has(rec.task_id ?? "") || rec.bucket === "inbox");
  }

  function dateFor(rec: PlanningRecommendation) {
    return dates[rec.id] ?? String(rec.proposed_changes?.scheduled ?? rec.scheduled ?? message?.target_date ?? "");
  }

  function trigger(kind: PlanningKind) {
    const targetDate = kind === "evening_plan" ? tomorrowISO() : todayISO();
    generate.mutate(
      { kind, target_date: targetDate },
      { onSuccess: (created) => setSelectedId(created.id) },
    );
  }

  function toggle(id: string, checked: boolean) {
    setSelectedOverrides((prev) => ({ ...prev, [id]: checked }));
  }

  function applySelected() {
    if (!message) return;
    const items = recommendations
      .filter((rec) => isSelected(rec))
      .map((rec) => {
        const action = actions[rec.id] ?? rec.suggested_action;
        const customDate = dates[rec.id];
        return {
          recommendation_id: rec.id,
          action,
          changes: customDate && actionUsesDate(action) ? { scheduled: customDate } : undefined,
        };
      });
    apply.mutate({ id: message.id, items });
  }

  return (
    <RequireAuth>
      <AppShell>
        <div className="page space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h1 className="title">Today Plan</h1>
              <p className="meta" style={{ marginTop: 6 }}>
                Aya planning messages for deadline-aware task triage.
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <Button type="button" onClick={() => trigger("evening_plan")}>
                <Moon size={15} /> Evening
              </Button>
              <Button type="button" onClick={() => trigger("morning_triage")}>
                <Sun size={15} /> Morning
              </Button>
              <Button type="button" onClick={() => trigger("midday_replan")}>
                <RefreshCw size={15} /> Replan
              </Button>
              <Button type="button" onClick={() => trigger("follow_through_nudge")}>
                <Bell size={15} /> Nudge
              </Button>
            </div>
          </div>

          <div
            className="grid gap-4"
            style={{ gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 280px), 1fr))" }}
          >
            <aside className="well" style={{ padding: 12, alignSelf: "start" }}>
              <div className="label" style={{ marginBottom: 10 }}>
                Message center
              </div>
              {messages.length === 0 && !isLoading ? (
                <div className="meta">No planning messages yet.</div>
              ) : (
                <div className="grid gap-2">
                  {messages.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => setSelectedId(item.id)}
                      className="card"
                      style={{
                        padding: 10,
                        textAlign: "left",
                        borderRadius: "var(--r-sm)",
                        background:
                          item.id === message?.id ? "var(--surface-3)" : "var(--surface-2)",
                        cursor: "pointer",
                      }}
                    >
                      <div className="row" style={{ justifyContent: "space-between", gap: 8 }}>
                        <strong style={{ fontSize: 13 }}>{item.title}</strong>
                        <Badge>{item.status}</Badge>
                      </div>
                      <div className="meta">{KIND_LABELS[item.kind]}</div>
                    </button>
                  ))}
                </div>
              )}
            </aside>

            <main className="grid gap-4">
              {message ? (
                <>
                  <section className="card" style={{ padding: 18 }}>
                    <div className="flex flex-wrap items-start justify-between gap-3">
                      <div>
                        <div className="row gap-2" style={{ marginBottom: 6 }}>
                          <Badge>{KIND_LABELS[message.kind]}</Badge>
                          <Badge>{message.target_date}</Badge>
                          {message.sent_channels.map((channel) => (
                            <Badge key={channel}>{channel}</Badge>
                          ))}
                        </div>
                        <h2 className="title-sm">{message.title}</h2>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <Button
                          type="button"
                          className="ghost"
                          onClick={() => update.mutate({ id: message.id, data: { status: "reviewed" } })}
                          disabled={message.status === "reviewed" || message.status === "applied"}
                        >
                          <Check size={14} /> Review
                        </Button>
                        <Button
                          type="button"
                          className="ghost"
                          onClick={() => update.mutate({ id: message.id, data: { status: "dismissed" } })}
                          disabled={message.status === "dismissed" || message.status === "applied"}
                        >
                          <X size={14} /> Dismiss
                        </Button>
                        <Button type="button" className="ghost" onClick={() => deliver.mutate(message.id)}>
                          <Send size={14} /> Telegram
                        </Button>
                      </div>
                    </div>
                    <div style={{ marginTop: 14 }}>
                      <Markdown>{message.summary}</Markdown>
                    </div>
                  </section>

                  <section
                    className="grid gap-3"
                    style={{ gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))" }}
                  >
                    {[
                      ["Overdue", message.body.sections?.overdue_task_ids?.length ?? 0],
                      ["Due today", message.body.sections?.due_today_task_ids?.length ?? 0],
                      ["Due soon", message.body.sections?.due_soon_task_ids?.length ?? 0],
                      ["Triage", message.body.sections?.stale_or_unclear_task_ids?.length ?? 0],
                    ].map(([label, count]) => (
                      <div className="well" style={{ padding: 12 }} key={label}>
                        <div className="label">{label}</div>
                        <div className="num" style={{ fontSize: 24, marginTop: 4 }}>
                          {count}
                        </div>
                      </div>
                    ))}
                  </section>

                  {groups.map(([group, items]) => (
                    <section key={group} className="grid gap-3">
                      <div className="row gap-2">
                        <Clock3 size={15} />
                        <h3 className="title-sm">{group}</h3>
                      </div>
                      <div className="grid gap-2">
                        {items.map((rec) => (
                          <RecommendationRow
                            key={rec.id}
                            rec={rec}
                            checked={isSelected(rec)}
                            action={actions[rec.id] ?? rec.suggested_action}
                            dateValue={dateFor(rec)}
                            onChecked={(checked) => toggle(rec.id, checked)}
                            onAction={(action) =>
                              setActions((prev) => ({ ...prev, [rec.id]: action }))
                            }
                            onDate={(date) => setDates((prev) => ({ ...prev, [rec.id]: date }))}
                          />
                        ))}
                      </div>
                    </section>
                  ))}

                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <Link to="/activity" className="row gap-2 meta">
                      <ExternalLink size={13} /> Activity undo
                    </Link>
                    <Button
                      type="button"
                      className="primary"
                      disabled={selectedCount === 0 || message.status === "applied"}
                      onClick={applySelected}
                    >
                      <MessagesSquare size={15} /> Apply selected in app
                    </Button>
                  </div>
                </>
              ) : (
                <section className="well" style={{ padding: 24 }}>
                  <h2 className="title-sm">No plan selected</h2>
                </section>
              )}
            </main>
          </div>
        </div>
      </AppShell>
    </RequireAuth>
  );
}
