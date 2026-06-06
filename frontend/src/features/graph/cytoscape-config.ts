import type { LayoutOptions, StylesheetStyle } from "cytoscape";

export const NODE_TYPES = [
  "Person",
  "Company",
  "Context",
  "Project",
  "Task",
  "Meeting",
] as const;
export type NodeType = (typeof NODE_TYPES)[number];

export const TYPE_COLORS: Record<NodeType, string> = {
  Person: "#4f8cff",
  Company: "#f59e0b",
  Context: "#a855f7",
  Project: "#10b981",
  Task: "#ef4444",
  Meeting: "#14b8a6",
};

const STUB_COLOR = "#94a3b8";

export const stylesheet: StylesheetStyle[] = [
  {
    selector: "node",
    style: {
      "background-color": STUB_COLOR,
      label: "data(name)",
      "font-size": 8,
      color: "#e5e7eb",
      "text-valign": "center",
      "text-halign": "center",
      "text-outline-color": "#0f172a",
      "text-outline-width": 1,
      width: 18,
      height: 18,
    },
  },
  ...NODE_TYPES.map((t) => ({
    selector: `node[label = "${t}"]`,
    style: { "background-color": TYPE_COLORS[t] },
  })),
  {
    selector: "edge",
    style: {
      width: 1,
      "line-color": "#475569",
      "curve-style": "bezier",
      "target-arrow-shape": "triangle",
      "target-arrow-color": "#475569",
      label: "",
      "font-size": 6,
      color: "#94a3b8",
    },
  },
  {
    selector: "edge:selected, edge.hover",
    style: {
      label: "data(label)",
      "line-color": "#e5e7eb",
      "target-arrow-color": "#e5e7eb",
    },
  },
  {
    selector: "node:selected",
    style: { "border-width": 3, "border-color": "#e5e7eb" },
  },
];

export const LAYOUTS = {
  fcose: { name: "fcose", animate: false } as unknown as LayoutOptions,
  breadthfirst: { name: "breadthfirst", animate: false } as LayoutOptions,
  concentric: { name: "concentric", animate: false } as LayoutOptions,
} as const;
export type LayoutName = keyof typeof LAYOUTS;
