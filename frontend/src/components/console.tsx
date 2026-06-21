/**
 * Console design-system primitives — ported from common.jsx.
 * Re-exports everything the dashboard and future screens need.
 */
import { ChevronDown, ChevronUp, Clock, Minus, Sparkles } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useEffect, useRef, useState, type ReactNode } from "react";

// ─── Tint helpers ──────────────────────────────────────────────────────────────

const TINT_VAR: Record<string, string> = {
  work: "var(--ctx-work)",
  personal: "var(--ctx-personal)",
  side: "var(--ctx-side)",
  other: "var(--ctx-other)",
};

function tintColor(t: string): string {
  return TINT_VAR[t] ?? "var(--fg-dim)";
}

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

// ─── Data maps ─────────────────────────────────────────────────────────────────

export const STATUS: Record<string, { label: string; color: string }> = {
  open:        { label: "Open",        color: "var(--st-open)" },
  in_progress: { label: "In progress", color: "var(--st-progress)" },
  done:        { label: "Done",        color: "var(--st-done)" },
  archived:    { label: "Archived",    color: "var(--st-archived)" },
  on_hold:     { label: "On hold",     color: "var(--st-warn)" },
  active:      { label: "Active",      color: "var(--st-done)" },
};

const PRIORITY: Record<string, { label: string; color: string }> = {
  low:    { label: "Low",    color: "var(--fg-faint)" },
  normal: { label: "Normal", color: "var(--fg-dim)" },
  high:   { label: "High",   color: "var(--st-warn)" },
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

/**
 * Clickable status badge — visually identical to {@link StatusBadge} but acts as
 * a popover trigger: clicking it opens a small menu to pick a new status.
 * Closes on outside-click or Escape. Used in place of an inline `<select>`.
 */
export function StatusBadgeMenu({
  status,
  options,
  onChange,
}: {
  status: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    if (!open) return;
    function onDocMouseDown(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onDocMouseDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDocMouseDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const s = STATUS[status] ?? STATUS.open;
  return (
    <span className="menu-anchor" ref={ref}>
      <button
        type="button"
        className="badge"
        style={{
          background: `color-mix(in oklch, ${s.color} 16%, transparent)`,
          color: s.color,
          border: 0,
          cursor: "pointer",
        }}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Change status (currently ${s.label})`}
        onClick={() => setOpen((v) => !v)}
      >
        <span style={{ width: 6, height: 6, borderRadius: 9, background: s.color }} />
        {s.label}
      </button>
      {open && (
        <div className="menu" role="menu">
          {options.map((o) => {
            const os = STATUS[o.value] ?? STATUS.open;
            return (
              <button
                key={o.value}
                type="button"
                role="menuitem"
                className="menu-item"
                aria-current={o.value === status}
                onClick={() => {
                  onChange(o.value);
                  setOpen(false);
                }}
              >
                <span
                  style={{
                    width: 6,
                    height: 6,
                    borderRadius: 9,
                    background: os.color,
                    flexShrink: 0,
                  }}
                />
                {o.label}
              </button>
            );
          })}
        </div>
      )}
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

/** Maps a priority to its glyph: up = high, dash = normal, down = low. */
const PRIORITY_ICON: Record<string, LucideIcon> = {
  low: ChevronDown,
  normal: Minus,
  high: ChevronUp,
};

/** Priority as a colored chevron (up/dash/down), with an optional label. */
export function PriorityIcon({
  priority,
  withLabel,
}: {
  priority: string;
  withLabel?: boolean;
}) {
  const p = PRIORITY[priority] ?? PRIORITY.normal;
  const Icon = PRIORITY_ICON[priority] ?? Minus;
  return (
    <span
      className="row gap-1"
      title={`Priority: ${p.label}`}
      style={{ color: p.color }}
    >
      <Icon size={15} style={{ flexShrink: 0 }} />
      {withLabel && (
        <span className="meta" style={{ color: p.color }}>
          {p.label}
        </span>
      )}
    </span>
  );
}

export function ContextChip({
  tint,
  children,
  onClick,
}: {
  /** Pre-resolved CSS color string, e.g. from contextTint(ctx). */
  tint: string;
  children: ReactNode;
  onClick?: () => void;
}) {
  if (onClick) {
    return (
      <button
        type="button"
        className="chip"
        onClick={onClick}
        style={{ cursor: "pointer" }}
      >
        <span className="dot" style={{ background: tint }} />
        {children}
      </button>
    );
  }

  return (
    <span className="chip">
      <span className="dot" style={{ background: tint }} />
      {children}
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
