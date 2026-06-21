import { createRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Check, Flame } from "lucide-react";
import type { CSSProperties } from "react";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import {
  AISpark,
  ContextChip,
  PriorityDot,
  SectionLabel,
} from "../components/console";
import { contextTint, dueChip, fmtDate } from "../components/console-data";
import { RequireAuth } from "../components/RequireAuth";
import { useAudit, useRevert } from "../features/audit/api";
import { useContexts } from "../features/contexts/api";
import { useHabits, useLogHabit } from "../features/habits/api";
import {
  useDailyCheckIns,
  useJournalEntries,
  useSetDailyCheckIn,
} from "../features/journal/api";
import { useTasks, useUpdateTask } from "../features/tasks/api";
import { useMe } from "../lib/auth";
import type { Habit } from "../lib/types";
import { rootRoute } from "./root";

// ─── Local helpers ──────────────────────────────────────────────────────────────

const DASHBOARD_HABIT_TOGGLE_STYLE = {
  "--dashboard-habit-color": "var(--st-done)",
} as CSSProperties;

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
    <div className="row dashboard-gauge">
      <span className="label">{label}</span>
      <div className="row gap-1">
        {[1, 2, 3, 4, 5].map((n) => {
          const active = n <= score;
          const style = {
            "--dashboard-gauge-tint": tint,
          } as CSSProperties;
          return (
            <button
              key={n}
              type="button"
              onClick={() => onSet(n)}
              title={`${label} ${n} of 5`}
              aria-label={`${label} ${n} of 5`}
              aria-pressed={active}
              disabled={disabled}
              className={
                "dashboard-gauge-button" +
                (active ? " active" : "") +
                (disabled ? " disabled" : "")
              }
              style={style}
            >
              <span />
            </button>
          );
        })}
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
      className={"check-btn" + (checked ? " active" : "")}
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
  return (
    <div className="row gap-3 dashboard-habit-row">
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
                className={"dashboard-habit-score" + (active ? " active" : "")}
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
          className={"dashboard-habit-toggle" + (done ? " active" : "")}
          style={DASHBOARD_HABIT_TOGGLE_STYLE}
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

  // Most recent journal entry (today's if present, else latest). The list is
  // already ordered date-desc by the API.
  const latestJournal = journalEntries[0] ?? null;
  const journalLines = latestJournal
    ? latestJournal.body
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0 && !line.startsWith("#"))
        .slice(0, 4)
        .reduce<Array<{ key: string; text: string }>>((lines, line) => {
          const duplicateCount = lines.filter((item) => item.text === line).length;
          lines.push({ key: `${latestJournal.id}:${line}:${duplicateCount}`, text: line });
          return lines;
        }, [])
    : [];

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
                  {latestJournal && latestJournal.date === today
                    ? "Today's journal"
                    : "Latest journal"}
                </SectionLabel>

                {latestJournal ? (
                  <div className="col gap-2" style={{ marginBottom: 4 }}>
                    {latestJournal.date !== today && (
                      <span
                        className="meta tnum"
                        style={{ color: "var(--signal)", opacity: 0.6 }}
                      >
                        {latestJournal.date}
                      </span>
                    )}
                    {latestJournal.title && (
                      <span style={{ fontSize: 13.5, fontWeight: 600 }}>
                        {latestJournal.title}
                      </span>
                    )}
                    {journalLines.map((line) => (
                      <span
                        key={line.key}
                        style={{
                          fontSize: 13,
                          color: "var(--fg-dim)",
                          lineHeight: 1.5,
                        }}
                      >
                        {line.text}
                      </span>
                    ))}
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
                        <button
                          type="button"
                          key={c.slug}
                          className="card ticks ctx-card"
                          onClick={() => navigate({ to: "/contexts" })}
                          style={{
                            padding: 16,
                            textAlign: "left",
                            cursor: "pointer",
                            background: "var(--surface-2)",
                            border: "1px solid var(--line-soft)",
                            borderRadius: "var(--r-lg)",
                          }}
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
                        </button>
                      );
                    })}
                  </div>
                )}
              </section>
            </div>

            {/* ══ RIGHT ═════════════════════════════════════════════════ */}
            <div className="col gap-4" style={{ minWidth: 0 }}>

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
                          {a.entity_id}
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
