/**
 * Console design-system primitives — ported from common.jsx.
 * Re-exports everything the dashboard and future screens need.
 */
import { Clock, Sparkles } from "lucide-react";
import type { ReactNode } from "react";

// ─── Tint helpers ──────────────────────────────────────────────────────────────

const TINT_VAR: Record<string, string> = {
  work: "var(--ctx-work)",
  personal: "var(--ctx-personal)",
  side: "var(--ctx-side)",
  other: "var(--ctx-other)",
};

export function tintColor(t: string): string {
  return TINT_VAR[t] ?? "var(--fg-dim)";
}

// ─── Data maps ─────────────────────────────────────────────────────────────────

export const STATUS: Record<string, { label: string; color: string }> = {
  open:        { label: "Open",        color: "var(--st-open)" },
  in_progress: { label: "In progress", color: "var(--st-progress)" },
  done:        { label: "Done",        color: "var(--st-done)" },
  archived:    { label: "Archived",    color: "var(--st-archived)" },
  on_hold:     { label: "On hold",     color: "var(--st-warn)" },
  active:      { label: "Active",      color: "var(--st-done)" },
};

export const PRIORITY: Record<string, { label: string; color: string }> = {
  low:    { label: "Low",    color: "var(--fg-faint)" },
  normal: { label: "Normal", color: "var(--fg-dim)" },
  high:   { label: "High",   color: "var(--st-warn)" },
};

export const KIND: Record<string, { label: string; color: string }> = {
  observation:   { label: "note",     color: "var(--fg-dim)" },
  preference:    { label: "pref",     color: "var(--ctx-personal)" },
  fact:          { label: "fact",     color: "var(--st-progress)" },
  open_loop:     { label: "loop",     color: "var(--st-warn)" },
  decision:      { label: "decision", color: "var(--st-done)" },
  key_point:     { label: "key",      color: "var(--signal)" },
  open_question: { label: "question", color: "var(--ctx-side)" },
};

// ─── Badges & chips ────────────────────────────────────────────────────────────

export function StatusBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.open;
  return (
    <span
      className="badge"
      style={{
        background: `color-mix(in oklch, ${s.color} 16%, transparent)`,
        color: s.color,
      }}
    >
      <span style={{ width: 6, height: 6, borderRadius: 9, background: s.color }} />
      {s.label}
    </span>
  );
}

export function PriorityDot({
  priority,
  withLabel,
}: {
  priority: string;
  withLabel?: boolean;
}) {
  const p = PRIORITY[priority] ?? PRIORITY.normal;
  return (
    <span className="row gap-1" title={`Priority: ${p.label}`}>
      <span
        style={{
          width: 7,
          height: 7,
          borderRadius: 2,
          background: p.color,
          transform: "rotate(45deg)",
          flexShrink: 0,
        }}
      />
      {withLabel && (
        <span className="meta" style={{ color: p.color }}>
          {p.label}
        </span>
      )}
    </span>
  );
}

export function KindBadge({ kind }: { kind: string }) {
  const k = KIND[kind] ?? KIND.observation;
  return (
    <span
      className="badge"
      style={{
        border: `1px solid color-mix(in oklch, ${k.color} 40%, transparent)`,
        color: k.color,
      }}
    >
      {k.label}
    </span>
  );
}

export function ContextChip({
  tint,
  children,
  onClick,
}: {
  tint: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <span
      className="chip"
      onClick={onClick}
      style={onClick ? { cursor: "pointer" } : undefined}
    >
      <span className="dot" style={{ background: tintColor(tint) }} />
      {children}
    </span>
  );
}

export function Tag({
  children,
  onClick,
}: {
  children: ReactNode;
  onClick?: () => void;
}) {
  return (
    <span
      className="chip"
      onClick={onClick}
      style={{
        cursor: onClick ? "pointer" : "default",
        fontSize: "10px",
        padding: "2px 8px",
        background: "transparent",
        color: "var(--fg-dim)",
      }}
    >
      #{children}
    </span>
  );
}

export function Avatar({
  initials,
  tint,
  size = 36,
  ring,
}: {
  initials: string;
  tint: string;
  size?: number;
  ring?: boolean;
}) {
  return (
    <span
      style={{
        width: size,
        height: size,
        minWidth: size,
        borderRadius: size > 30 ? "var(--r-md)" : "var(--r-sm)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        background: `color-mix(in oklch, ${tintColor(tint)} 22%, var(--surface-2))`,
        color: tintColor(tint),
        fontFamily: "var(--mono)",
        fontWeight: 600,
        fontSize: size * 0.34,
        letterSpacing: "0.02em",
        border: ring
          ? `1.5px solid ${tintColor(tint)}`
          : "1px solid var(--line)",
      }}
    >
      {initials}
    </span>
  );
}

export function AISpark({
  size = 13,
  title = "Touched by Aya",
}: {
  size?: number;
  title?: string;
}) {
  return (
    <span className="spark" title={title} style={{ display: "inline-flex" }}>
      <Sparkles size={size} />
    </span>
  );
}

export function ObservationRow({
  obs,
}: {
  obs: { date: string | null; kind: string; body: string };
}) {
  return (
    <div
      className="row gap-3"
      style={{
        alignItems: "flex-start",
        padding: "12px 0",
        borderBottom: "1px solid var(--line-soft)",
      }}
    >
      <span
        className="meta tnum"
        style={{ width: 78, flexShrink: 0, paddingTop: 2 }}
      >
        {fmtDate(obs.date)}
      </span>
      <span style={{ paddingTop: 1 }}>
        <KindBadge kind={obs.kind} />
      </span>
      <span
        style={{ flex: 1, color: "var(--fg)", fontSize: 13.5, lineHeight: 1.55 }}
      >
        {obs.body}
      </span>
    </div>
  );
}

export function SectionLabel({
  children,
  right,
  sub,
}: {
  children: ReactNode;
  right?: ReactNode;
  sub?: ReactNode;
}) {
  return (
    <div
      className="row"
      style={{
        justifyContent: "space-between",
        alignItems: "flex-end",
        marginBottom: 14,
      }}
    >
      <div>
        <div className="label">{children}</div>
        {sub && (
          <div className="muted" style={{ fontSize: 12.5, marginTop: 3 }}>
            {sub}
          </div>
        )}
      </div>
      {right}
    </div>
  );
}

export function EmptyState({
  title,
  cta,
  onAsk,
}: {
  icon?: string;
  title: string;
  cta?: string;
  onAsk?: () => void;
}) {
  return (
    <div
      className="col gap-3"
      style={{
        alignItems: "center",
        textAlign: "center",
        padding: "48px 24px",
        color: "var(--fg-dim)",
      }}
    >
      <div style={{ opacity: 0.5 }}>
        <Sparkles size={28} />
      </div>
      <div className="serif title-sm" style={{ color: "var(--fg-muted)" }}>
        {title}
      </div>
      <div className="row gap-2">
        {cta && <button className="btn primary sm">{cta}</button>}
        {onAsk && (
          <button className="btn ghost sm" onClick={onAsk}>
            <Sparkles size={13} />
            Ask Aya
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Date helpers ──────────────────────────────────────────────────────────────

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const d = new Date(iso + "T00:00:00");
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function dueChip(
  iso: string | null | undefined,
  overdue: boolean,
): ReactNode {
  if (!iso) return null;
  const color = overdue ? "var(--st-danger)" : "var(--fg-dim)";
  return (
    <span className="meta row gap-1" style={{ color }}>
      <Clock size={11} />
      {fmtDate(iso)}
    </span>
  );
}

// ─── Meter ─────────────────────────────────────────────────────────────────────

export function Meter({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color?: string;
}) {
  const pct = Math.min(100, Math.round((value / max) * 100));
  return (
    <span
      style={{
        display: "inline-block",
        width: "100%",
        height: 4,
        borderRadius: 9,
        background: "var(--surface-4)",
        overflow: "hidden",
      }}
    >
      <span
        style={{
          display: "block",
          height: "100%",
          width: `${pct}%`,
          background: color ?? "var(--signal)",
          borderRadius: 9,
        }}
      />
    </span>
  );
}
