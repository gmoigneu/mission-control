import { createRoute, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Check, Flame } from "lucide-react";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import {
  AISpark,
  ContextChip,
  PriorityDot,
  SectionLabel,
  dueChip,
  fmtDate,
  tintColor,
} from "../components/console";
import { RequireAuth } from "../components/RequireAuth";
import { useAudit, useRevert } from "../features/audit/api";
import { useContexts } from "../features/contexts/api";
import { useJournalEntries } from "../features/journal/api";
import { useTasks, useUpdateTask } from "../features/tasks/api";
import { useMe } from "../lib/auth";
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

// ─── Gauge: 1–5 dot picker ─────────────────────────────────────────────────────

function Gauge({
  label,
  value,
  setValue,
  tint,
}: {
  label: string;
  value: number;
  setValue: (n: number) => void;
  tint: string;
}) {
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
            onClick={() => setValue(n)}
            title={`${label} ${n}`}
            style={{
              width: 16,
              height: 16,
              padding: 0,
              border: 0,
              cursor: "pointer",
              background: "transparent",
            }}
          >
            <span
              style={{
                display: "block",
                width: 12,
                height: 12,
                borderRadius: 3,
                background: n <= value ? tint : "var(--surface-4)",
                boxShadow:
                  n <= value
                    ? `0 0 8px color-mix(in oklch, ${tint} 50%, transparent)`
                    : "none",
                transition: "all 150ms",
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
        transition: "all 150ms",
      }}
    >
      {checked && <Check size={12} strokeWidth={3} />}
    </button>
  );
}

// ─── Habit row (static sample) ─────────────────────────────────────────────────

function HabitSampleRow({
  name,
  streak,
  cadence,
}: {
  name: string;
  streak: number;
  cadence: string;
}) {
  const [st, setSt] = useState<null | "done" | "partial" | "skip">(null);
  const cycle = () => {
    setSt((s) =>
      s === null ? "done" : s === "done" ? "partial" : s === "partial" ? "skip" : null,
    );
  };
  const col =
    st === "done"
      ? "var(--st-done)"
      : st === "partial"
        ? "var(--st-warn)"
        : st === "skip"
          ? "var(--fg-faint)"
          : "transparent";
  return (
    <div className="row gap-3" style={{ alignItems: "center" }}>
      <button
        onClick={cycle}
        title="Tap to log"
        style={{
          width: 24,
          height: 24,
          borderRadius: 7,
          cursor: "pointer",
          flexShrink: 0,
          border: `1px solid ${st ? col : "var(--line-bright)"}`,
          background:
            st === "done"
              ? col
              : st
                ? `color-mix(in oklch, ${col} 25%, transparent)`
                : "transparent",
          display: "inline-flex",
          alignItems: "center",
          justifyContent: "center",
          color: st === "done" ? "var(--signal-ink)" : col,
        }}
      >
        {st === "done" && <Check size={13} strokeWidth={2.4} />}
        {st === "partial" && (
          <span style={{ width: 8, height: 8, borderRadius: 9, background: col }} />
        )}
        {st === "skip" && (
          <span
            style={{
              fontSize: 12,
              fontFamily: "var(--mono)",
              lineHeight: 1,
              color: col,
            }}
          >
            ×
          </span>
        )}
      </button>
      <span style={{ flex: 1, fontSize: 13 }}>{name}</span>
      <span
        className="row gap-1 meta"
        title="Current streak"
        style={{ color: streak > 0 ? "var(--st-warn)" : "var(--fg-faint)" }}
      >
        <Flame size={12} />
        {streak}
      </span>
      <span className="meta" style={{ width: 52, textAlign: "right" }}>
        {cadence}
      </span>
    </div>
  );
}

// ─── Dashboard ──────────────────────────────────────────────────────────────────

function Dashboard() {
  const navigate = useNavigate();
  const me = useMe();
  const { data: tasks = [] } = useTasks();
  const { data: contexts = [] } = useContexts();
  const { data: audit = [] } = useAudit();
  const { data: journalEntries = [] } = useJournalEntries();
  const updateTask = useUpdateTask();
  const revert = useRevert();

  const [mood, setMood] = useState(3);
  const [energy, setEnergy] = useState(3);
  const [done, setDone] = useState<Record<string, boolean>>({});

  const today = todayISO();

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

  // Context tint: map category → tint key
  function ctxTint(category: string): string {
    const map: Record<string, string> = {
      work: "work",
      personal: "personal",
      side: "side",
    };
    return map[category] ?? "other";
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

  const SAMPLE_HABITS = [
    { name: "Morning pages", streak: 12, cadence: "daily" },
    { name: "Workout", streak: 4, cadence: "daily" },
    { name: "Read 20 min", streak: 7, cadence: "daily" },
    { name: "Weekly review", streak: 2, cadence: "weekly" },
    { name: "Cold shower", streak: 3, cadence: "daily" },
  ];

  // Most recent journal entry (today's if present, else latest). The list is
  // already ordered date-desc by the API.
  const latestJournal = journalEntries[0] ?? null;
  const journalLines = latestJournal
    ? latestJournal.body
        .split("\n")
        .map((l) => l.trim())
        .filter((l) => l.length > 0 && !l.startsWith("#"))
        .slice(0, 4)
    : [];

  return (
    <RequireAuth>
      <AppShell>
        <div
          className="rise"
          style={{
            maxWidth: 1180,
            margin: "0 auto",
            padding: "28px 32px 80px",
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
                setValue={setMood}
                tint="var(--ctx-personal)"
              />
              <div style={{ height: 14 }} />
              <Gauge
                label="Energy"
                value={energy}
                setValue={setEnergy}
                tint="var(--signal)"
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
                            fontSize: 13.5,
                            textDecoration: isDone ? "line-through" : "none",
                            color: isDone ? "var(--fg-dim)" : "var(--fg)",
                          }}
                        >
                          {t.title}
                        </span>
                        <PriorityDot priority={t.priority} />
                        {ctx && (
                          <ContextChip tint={ctxTint(ctx.category)}>
                            {ctx.name}
                          </ContextChip>
                        )}
                        {dueChip(t.due, isOverdue)}
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
                    {journalLines.map((line, i) => (
                      <span
                        key={i}
                        style={{
                          fontSize: 13,
                          color: "var(--fg-dim)",
                          lineHeight: 1.5,
                        }}
                      >
                        {line}
                      </span>
                    ))}
                  </div>
                ) : (
                  <button
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
                      const tint = ctxTint(c.category);
                      const count = openTaskCount(c.id);
                      return (
                        <button
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
                              color: tintColor(tint),
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

              {/* Habits today — static sample */}
              <section className="card" style={{ padding: 20 }}>
                <SectionLabel
                  right={
                    <button
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

                <div className="col gap-2">
                  {SAMPLE_HABITS.map((h) => (
                    <HabitSampleRow
                      key={h.name}
                      name={h.name}
                      streak={h.streak}
                      cadence={h.cadence}
                    />
                  ))}
                </div>

                <div
                  className="meta"
                  style={{
                    marginTop: 12,
                    color: "var(--fg-faint)",
                    fontSize: 11,
                    fontStyle: "italic",
                  }}
                >
                  Sample data — habit tracking lands in a later phase.
                </div>
              </section>

              {/* Recent Aya activity */}
              <section className="card" style={{ padding: 20 }}>
                <SectionLabel
                  right={
                    <button
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
