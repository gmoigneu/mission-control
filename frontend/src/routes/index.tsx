import { Link, createRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Check, Flame } from "lucide-react";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { Markdown } from "../components/Markdown";
import {
  AISpark,
  ContextChip,
  PriorityDot,
  SectionLabel,
  dueChip,
  fmtDate,
  contextTint,
} from "../components/console";
import { RequireAuth } from "../components/RequireAuth";
import { useAudit, useRevert } from "../features/audit/api";
import { useContexts } from "../features/contexts/api";
import { useHabits, useLogHabit } from "../features/habits/api";
import {
  useDailyCheckIns,
  useJournalEntries,
  useSetDailyCheckIn,
} from "../features/journal/api";
import { useProjects } from "../features/projects/api";
import { useTasks, useUpdateTask } from "../features/tasks/api";
import { useMe } from "../lib/auth";
import type { Habit } from "../lib/types";
import { rootRoute } from "./root";

// ─── Local helpers ──────────────────────────────────────────────────────────────

function todayISO(): string {
  const d = new Date();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${mm}-${dd}`;
}

function longDate(): string {
  return new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

function relTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return fmtDate(iso.slice(0, 10));
}

function payloadLabel(payload: Record<string, unknown> | null): string | null {
  if (!payload) return null;
  for (const key of ["label", "title", "name", "slug"]) {
    const value = payload[key];
    if (typeof value === "string" && value.trim()) return value;
  }
  const date = payload.date;
  if (typeof date === "string" && date.trim()) return `Journal ${fmtDate(date)}`;
  return null;
}

// ─── Gauge: 1–5 dot picker ─────────────────────────────────────────────────────

function Gauge({
  label,
  value,
  onSet,
  tint,
  disabled = false,
}: {
  label: string;
  value: number | null;
  onSet: (n: number) => void;
  tint: string;
  disabled?: boolean;
}) {
  const score = value ?? 0;
  return (
    <div
      className="row"
      style={{ justifyContent: "space-between", alignItems: "center" }}
    >
      <span className="label">{label}</span>
      <div className="row gap-1">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onClick={() => onSet(n)}
            title={`${label} ${n} of 5`}
            aria-label={`${label} ${n} of 5`}
            aria-pressed={n <= score}
            disabled={disabled}
            style={{
              width: 16,
              height: 16,
              padding: 0,
              border: 0,
              cursor: disabled ? "default" : "pointer",
              background: "transparent",
            }}
          >
            <span
              style={{
                display: "block",
                width: 12,
                height: 12,
                borderRadius: 3,
                background: n <= score ? tint : "var(--surface-4)",
                boxShadow:
                  n <= score
                    ? `0 0 8px color-mix(in oklch, ${tint} 50%, transparent)`
                    : "none",
                transition: "background 150ms, box-shadow 150ms",
              }}
            />
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── Check button ──────────────────────────────────────────────────────────────

function CheckBtn({
  checked,
  onClick,
}: {
  checked: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="check-btn"
      style={{
        width: 18,
        height: 18,
        borderRadius: 5,
        flexShrink: 0,
        cursor: "pointer",
        border: `1.5px solid ${checked ? "var(--signal)" : "var(--line-bright)"}`,
        background: checked ? "var(--signal)" : "transparent",
        color: "var(--signal-ink)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 0,
        transition: "background 150ms, border-color 150ms, color 150ms",
      }}
    >
      {checked && <Check size={12} strokeWidth={3} />}
    </button>
  );
}

// ─── Habit row ──────────────────────────────────────────────────────────────────

function HabitRow({
  habit,
  onLog,
}: {
  habit: Habit;
  onLog: (habit: Habit, value?: number) => void;
}) {
  const done = habit.logged_today;
  const col = done ? "var(--st-done)" : "transparent";
  return (
    <div className="row gap-3" style={{ alignItems: "center" }}>
      {habit.tracking_type === "score" ? (
        <div className="row gap-1" aria-label={`${habit.name} score for today`}>
          {[0, 1, 2, 3, 4, 5].map((value) => {
            const active = habit.today_score === value;
            return (
              <button
                key={value}
                type="button"
                onClick={() => onLog(habit, value)}
                title={`${habit.name} ${value} of 5 today`}
                aria-label={`${habit.name} ${value} of 5 today`}
                aria-pressed={active}
                style={{
                  width: 22,
                  height: 22,
                  borderRadius: 6,
                  cursor: "pointer",
                  border: `1px solid ${active ? "var(--st-warn)" : "var(--line-bright)"}`,
                  background: active ? "var(--st-warn)" : "transparent",
                  color: active ? "var(--signal-ink)" : "var(--fg-dim)",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  padding: 0,
                  fontSize: 12,
                  fontVariantNumeric: "tabular-nums",
                }}
              >
                {value}
              </button>
            );
          })}
        </div>
      ) : (
        <button
          type="button"
          onClick={() => onLog(habit)}
          title="Tap to log today"
          aria-label={`Toggle ${habit.name} for today`}
          style={{
            width: 24,
            height: 24,
            borderRadius: 7,
            cursor: "pointer",
            flexShrink: 0,
            border: `1px solid ${done ? col : "var(--line-bright)"}`,
            background: done ? col : "transparent",
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            color: done ? "var(--signal-ink)" : "var(--fg-dim)",
          }}
        >
          {done && <Check size={13} strokeWidth={2.4} />}
        </button>
      )}
      <span style={{ flex: 1, fontSize: 13 }}>{habit.name}</span>
      <span
        className="row gap-1 meta"
        title="Current streak"
        style={{ color: habit.streak > 0 ? "var(--st-warn)" : "var(--fg-faint)" }}
      >
        <Flame size={12} />
        {habit.streak}
      </span>
      <span className="meta" style={{ width: 52, textAlign: "right" }}>
        {habit.cadence}
      </span>
    </div>
  );
}

// ─── Dashboard ──────────────────────────────────────────────────────────────────

type CheckInMetric = "mood" | "energy" | "productivity";

export function Dashboard() {
  const navigate = useNavigate();
  const today = todayISO();
  const me = useMe();
  const { data: tasks = [] } = useTasks();
  const { data: contexts = [] } = useContexts();
  const { data: audit = [] } = useAudit();
  const { data: journalEntries = [] } = useJournalEntries();
  const { data: habits = [] } = useHabits({ active: "true" });
  const { data: projects = [] } = useProjects();
  const { data: dailyCheckIns = [] } = useDailyCheckIns({ days: 1, end: today });
  const updateTask = useUpdateTask();
  const logHabit = useLogHabit();
  const setDailyCheckIn = useSetDailyCheckIn();
  const revert = useRevert();

  const [localCheckIn, setLocalCheckIn] = useState<Partial<Record<CheckInMetric, number>>>({});
  const [done, setDone] = useState<Record<string, boolean>>({});

  const todayCheckIn = dailyCheckIns[0];
  const mood = localCheckIn.mood ?? todayCheckIn?.mood ?? null;
  const energy = localCheckIn.energy ?? todayCheckIn?.energy ?? null;
  const productivity = localCheckIn.productivity ?? todayCheckIn?.productivity ?? null;

  // First name from useMe
  const firstName = (() => {
    const name = me.data?.name;
    if (name) return name.split(" ")[0];
    const email = me.data?.email;
    if (email) return email.split("@")[0];
    return "G";
  })();

  // Tasks due today or overdue (not done/archived)
  const activeTasks = tasks.filter(
    (t) => t.status !== "done" && t.status !== "archived",
  );
  const todayTasks = activeTasks.filter((t) => {
    if (!t.due) return false;
    return t.due <= today;
  });

  function toggleTask(id: string) {
    const nowDone = !done[id];
    setDone((d) => ({ ...d, [id]: nowDone }));
    if (nowDone) {
      updateTask.mutate(
        { id, data: { status: "done" } },
        {
          onError: () => {
            // Revert local optimistic state on failure
            setDone((d) => ({ ...d, [id]: false }));
          },
        },
      );
    }
  }

  // Open task count per context
  function openTaskCount(ctxId: string): number {
    return activeTasks.filter((t) => t.context_id === ctxId).length;
  }

  // Context name + tint lookup
  function ctxById(id: string | null) {
    if (!id) return null;
    return contexts.find((c) => c.id === id) ?? null;
  }

  const recentActivity = audit.slice(0, 5);

  function activityEntryLabel(a: (typeof recentActivity)[number]): string {
    if (a.entity_type === "task") {
      return tasks.find((t) => t.id === a.entity_id)?.title ?? payloadLabel(a.after) ?? payloadLabel(a.before) ?? a.entity_id;
    }
    if (a.entity_type === "context") {
      return contexts.find((c) => c.id === a.entity_id)?.name ?? payloadLabel(a.after) ?? payloadLabel(a.before) ?? a.entity_id;
    }
    if (a.entity_type === "project") {
      return projects.find((p) => p.id === a.entity_id)?.title ?? payloadLabel(a.after) ?? payloadLabel(a.before) ?? a.entity_id;
    }
    if (a.entity_type === "journal_entry") {
      const entry = journalEntries.find((j) => j.id === a.entity_id);
      return entry?.title ?? (entry ? `Journal ${fmtDate(entry.date)}` : payloadLabel(a.after) ?? payloadLabel(a.before) ?? a.entity_id);
    }
    if (a.entity_type === "habit") {
      return habits.find((h) => h.id === a.entity_id)?.name ?? payloadLabel(a.after) ?? payloadLabel(a.before) ?? a.entity_id;
    }
    return payloadLabel(a.after) ?? payloadLabel(a.before) ?? a.entity_id;
  }

  function setCheckInScore(key: CheckInMetric, value: number) {
    const previous = localCheckIn;
    setLocalCheckIn((current) => ({ ...current, [key]: value }));

    setDailyCheckIn.mutate(
      { date: today, data: { [key]: value } },
      {
        onError: () => {
          setLocalCheckIn(previous);
        },
      },
    );
  }

  function logHabitToday(habit: Habit, value?: number) {
    if (habit.tracking_type === "score") {
      logHabit.mutate({ id: habit.id, data: { date: today, score: value ?? 0 } });
      return;
    }
    logHabit.mutate({ id: habit.id, data: { date: today, done: !habit.logged_today } });
  }

  // Today's journal entry if present, else the latest entry as a useful fallback.
  const todaysJournal = journalEntries.find((entry) => entry.date === today) ?? null;
  const latestJournal = journalEntries[0] ?? null;
  const journalForCard = todaysJournal ?? latestJournal;

  return (
    <RequireAuth>
      <AppShell>
        <div
          className="rise"
          style={{
            maxWidth: 1180,
            margin: "0 auto",
            padding: "28px clamp(14px, 4vw, 32px) 80px",
          }}
        >
          {/* ── Hero ─────────────────────────────────────────────────── */}
          <div
            className="row"
            style={{
              justifyContent: "space-between",
              alignItems: "flex-start",
              flexWrap: "wrap",
              gap: 20,
              marginBottom: 28,
            }}
          >
            <div>
              <div className="label">{longDate()}</div>
              <h1 className="display" style={{ margin: "8px 0 0" }}>
                Good morning,{" "}
                <span className="serif-italic">{firstName}.</span>
              </h1>
              <p
                className="serif"
                style={{
                  fontSize: 16,
                  color: "var(--fg-muted)",
                  maxWidth: 560,
                  margin: "12px 0 0",
                  fontWeight: 380,
                  lineHeight: 1.45,
                }}
              >
                Protect the work that matters. Everything else can wait.
              </p>
            </div>

            {/* Gauges */}
            <div
              className="well ticks"
              style={{ padding: "16px 18px", minWidth: 220 }}
            >
              <Gauge
                label="Mood"
                value={mood}
                onSet={(value) => setCheckInScore("mood", value)}
                tint="var(--ctx-personal)"
                disabled={setDailyCheckIn.isPending}
              />
              <div style={{ height: 14 }} />
              <Gauge
                label="Energy"
                value={energy}
                onSet={(value) => setCheckInScore("energy", value)}
                tint="var(--signal)"
                disabled={setDailyCheckIn.isPending}
              />
              <div style={{ height: 14 }} />
              <Gauge
                label="Productivity"
                value={productivity}
                onSet={(value) => setCheckInScore("productivity", value)}
                tint="var(--st-done)"
                disabled={setDailyCheckIn.isPending}
              />
            </div>
          </div>

          {/* ── 2-col grid ───────────────────────────────────────────── */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1.5fr 1fr",
              gap: 20,
              alignItems: "start",
            }}
            className="dash-grid"
          >
            {/* ══ LEFT ══════════════════════════════════════════════════ */}
            <div className="col gap-4" style={{ minWidth: 0 }}>

              {/* Top of mind — context cards */}
              <section>
                <SectionLabel
                  right={
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => navigate({ to: "/contexts" })}
                    >
                      Contexts
                      <ArrowRight size={13} />
                    </button>
                  }
                >
                  Top of mind
                </SectionLabel>

                {contexts.length === 0 ? (
                  <div
                    className="meta"
                    style={{
                      color: "var(--fg-faint)",
                      padding: "20px 4px",
                      textAlign: "center",
                    }}
                  >
                    No contexts yet. Add one to get started.
                  </div>
                ) : (
                  <div
                    style={{
                      display: "grid",
                      gridTemplateColumns:
                        "repeat(auto-fill, minmax(230px, 1fr))",
                      gap: 12,
                    }}
                  >
                    {contexts.map((c) => {
                      const tint = contextTint(c);
                      const count = openTaskCount(c.id);
                      return (
                        <Link
                          key={c.slug}
                          to="/tasks"
                          search={{ context: c.id }}
                          className="card ticks ctx-card ctx-card-link"
                        >
                          <div
                            className="row"
                            style={{ justifyContent: "space-between" }}
                          >
                            <ContextChip tint={tint}>{c.name}</ContextChip>
                          </div>
                          <div
                            className="num"
                            style={{
                              fontSize: 30,
                              marginTop: 12,
                              lineHeight: 1,
                              color: tint,
                            }}
                          >
                            {count}
                            <span
                              style={{
                                fontSize: 12,
                                color: "var(--fg-dim)",
                                marginLeft: 6,
                              }}
                            >
                              open
                            </span>
                          </div>
                          {c.description && (
                            <div
                              className="muted"
                              style={{
                                fontSize: 12,
                                marginTop: 6,
                                lineHeight: 1.4,
                                display: "-webkit-box",
                                WebkitLineClamp: 2,
                                WebkitBoxOrient: "vertical",
                                overflow: "hidden",
                              }}
                            >
                              {c.description}
                            </div>
                          )}
                        </Link>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Tasks due today & overdue */}
              <section className="card" style={{ padding: 20 }}>
                <SectionLabel
                  right={
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => navigate({ to: "/tasks" })}
                    >
                      All tasks
                      <ArrowRight size={13} />
                    </button>
                  }
                >
                  Due today &amp; overdue · {todayTasks.length}
                </SectionLabel>

                <div className="col">
                  {todayTasks.length === 0 && (
                    <div
                      className="meta"
                      style={{
                        padding: "20px 4px",
                        color: "var(--fg-faint)",
                        textAlign: "center",
                      }}
                    >
                      Nothing due today — clear skies.
                    </div>
                  )}
                  {todayTasks.map((t) => {
                    const ctx = ctxById(t.context_id);
                    const isOverdue = !!(t.due && t.due < today);
                    const isDone = !!done[t.id];
                    return (
                      <div
                        key={t.id}
                        className="row gap-3 task-row"
                        style={{
                          padding: "9px 4px",
                          borderBottom: "1px solid var(--line-soft)",
                        }}
                      >
                        <CheckBtn
                          checked={isDone}
                          onClick={() => toggleTask(t.id)}
                        />
                        <span
                          style={{
                            flex: 1,
                            minWidth: 0,
                            overflowWrap: "anywhere",
                            fontSize: 13.5,
                            textDecoration: isDone ? "line-through" : "none",
                            color: isDone ? "var(--fg-dim)" : "var(--fg)",
                          }}
                        >
                          {t.title}
                        </span>
                        <div className="task-row-meta">
                          <PriorityDot priority={t.priority} />
                          {ctx && (
                            <ContextChip tint={contextTint(ctx)}>
                              {ctx.name}
                            </ContextChip>
                          )}
                          {dueChip(t.due, isOverdue)}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

            </div>

            {/* ══ RIGHT ═════════════════════════════════════════════════ */}
            <div className="col gap-4" style={{ minWidth: 0 }}>

              {/* Today's journal */}
              <section className="card" style={{ padding: 20 }}>
                <SectionLabel
                  right={
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => navigate({ to: "/journal" })}
                    >
                      Open journal
                      <ArrowRight size={13} strokeWidth={1.6} />
                    </button>
                  }
                >
                  Today's journal
                </SectionLabel>

                {journalForCard ? (
                  <div className="col gap-2" style={{ marginBottom: 4 }}>
                    {journalForCard.date !== today && (
                      <span
                        className="meta tnum"
                        style={{ color: "var(--signal)", opacity: 0.6 }}
                      >
                        Latest: {journalForCard.date}
                      </span>
                    )}
                    {journalForCard.title && (
                      <span style={{ fontSize: 13.5, fontWeight: 600 }}>
                        {journalForCard.title}
                      </span>
                    )}
                    <div
                      style={{
                        maxHeight: 280,
                        overflow: "auto",
                        paddingRight: 4,
                      }}
                    >
                      <Markdown>{journalForCard.body || "_Nothing written yet._"}</Markdown>
                    </div>
                  </div>
                ) : (
                  <button
                    type="button"
                    className="row gap-2 well"
                    onClick={() => navigate({ to: "/journal" })}
                    style={{
                      padding: "8px 8px 8px 14px",
                      width: "100%",
                      textAlign: "left",
                      cursor: "pointer",
                      border: 0,
                      background: "var(--bg-deep)",
                      borderRadius: "var(--r-sm)",
                    }}
                  >
                    <span className="meta tnum" style={{ color: "var(--signal)" }}>
                      new
                    </span>
                    <span style={{ fontSize: 13, color: "var(--fg-faint)" }}>
                      No entries yet — write your first journal entry.
                    </span>
                  </button>
                )}
              </section>

              {/* Habits today */}
              <section className="card" style={{ padding: 20 }}>
                <SectionLabel
                  right={
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() =>
                        navigate({ to: "/habits" } as Parameters<typeof navigate>[0])
                      }
                    >
                      Grid
                      <ArrowRight size={13} />
                    </button>
                  }
                >
                  Habits · today
                </SectionLabel>

                {habits.length === 0 ? (
                  <p
                    className="meta"
                    style={{ color: "var(--fg-faint)", fontSize: 12, marginTop: 4 }}
                  >
                    No habits yet — add one on the{" "}
                    <button
                      type="button"
                      onClick={() =>
                        navigate({ to: "/habits" } as Parameters<typeof navigate>[0])
                      }
                      style={{
                        border: 0,
                        background: "transparent",
                        cursor: "pointer",
                        padding: 0,
                        color: "var(--signal)",
                        textDecoration: "underline",
                        font: "inherit",
                      }}
                    >
                      Habits grid
                    </button>
                    .
                  </p>
                ) : (
                  <div className="col gap-2">
                    {habits.map((h) => (
                      <HabitRow key={h.id} habit={h} onLog={logHabitToday} />
                    ))}
                  </div>
                )}
              </section>

              {/* Recent Aya activity */}
              <section className="card" style={{ padding: 20 }}>
                <SectionLabel
                  right={
                    <button
                      type="button"
                      className="btn ghost sm"
                      onClick={() => navigate({ to: "/activity" })}
                    >
                      Feed
                      <ArrowRight size={13} />
                    </button>
                  }
                >
                  <span className="row gap-2">
                    <span className="label-signal">
                      <AISpark size={12} />
                    </span>{" "}
                    Recent Aya activity
                  </span>
                </SectionLabel>

                <div className="col">
                  {recentActivity.length === 0 && (
                    <div
                      className="meta"
                      style={{
                        padding: "20px 4px",
                        color: "var(--fg-faint)",
                        textAlign: "center",
                      }}
                    >
                      No activity yet.
                    </div>
                  )}
                  {recentActivity.map((a) => (
                    <div
                      key={a.id}
                      className="row gap-3"
                      style={{
                        padding: "10px 0",
                        borderBottom: "1px solid var(--line-soft)",
                        alignItems: "flex-start",
                      }}
                    >
                      <span
                        className="meta tnum"
                        style={{ width: 56, flexShrink: 0 }}
                      >
                        {relTime(a.created_at)}
                      </span>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12.5 }}>
                          <span style={{ color: "var(--signal)" }}>
                            {a.action}
                          </span>{" "}
                          <span
                            className="meta"
                            style={{
                              textTransform: "lowercase",
                              letterSpacing: 0,
                            }}
                          >
                            {a.entity_type}
                          </span>
                        </div>
                        <div
                          className="muted"
                          style={{
                            fontSize: 12,
                            marginTop: 2,
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                          }}
                        >
                          {activityEntryLabel(a)}
                        </div>
                      </div>
                      <button
                        type="button"
                        className="btn ghost sm"
                        disabled={a.reverted}
                        onClick={() => revert.mutate(a.id)}
                        style={a.reverted ? { opacity: 0.4 } : undefined}
                      >
                        Undo
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </div>
        </div>
      </AppShell>
    </RequireAuth>
  );
}

export const indexRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/",
  component: Dashboard,
});
