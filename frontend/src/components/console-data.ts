import { Clock } from "lucide-react";
import { createElement, type ReactNode } from "react";

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

export const STATUS: Record<string, { label: string; color: string }> = {
  open: { label: "Open", color: "var(--st-open)" },
  in_progress: { label: "In progress", color: "var(--st-progress)" },
  done: { label: "Done", color: "var(--st-done)" },
  archived: { label: "Archived", color: "var(--st-archived)" },
  on_hold: { label: "On hold", color: "var(--st-warn)" },
  active: { label: "Active", color: "var(--st-done)" },
};

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

export function fmtDate(iso: string | null | undefined): string {
  if (!iso) return "\u2014";
  const d = new Date(`${iso}T00:00:00`);
  return `${MONTHS[d.getMonth()]} ${d.getDate()}`;
}

export function dueChip(
  iso: string | null | undefined,
  overdue: boolean,
): ReactNode {
  if (!iso) return null;
  const color = overdue ? "var(--st-danger)" : "var(--fg-dim)";
  return createElement(
    "span",
    { className: "meta row gap-1", style: { color } },
    createElement(Clock, { size: 11 }),
    fmtDate(iso),
  );
}
