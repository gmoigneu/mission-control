import { Button, Field, Input, Select } from "../../components/ui";
import { LAYOUTS, NODE_TYPES, TYPE_COLORS, type LayoutName } from "./cytoscape-config";

interface ContextOption {
  slug: string;
  name: string;
}

interface GraphControlsProps {
  types: Record<string, boolean>;
  onToggleType: (t: string) => void;
  contexts: ContextOption[];
  context: string;
  onContextChange: (slug: string) => void;
  search: string;
  onSearchChange: (v: string) => void;
  onSearchSubmit: () => void;
  layout: LayoutName;
  onLayoutChange: (l: LayoutName) => void;
  onRebuild: () => void;
  rebuilding: boolean;
}

export function GraphControls(props: GraphControlsProps) {
  const layoutOptions = (Object.keys(LAYOUTS) as LayoutName[]).map((l) => ({
    value: l,
    label: l,
  }));
  const contextOptions = [
    { value: "", label: "All contexts" },
    ...props.contexts.map((c) => ({ value: c.slug, label: c.name })),
  ];

  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 16, alignItems: "center" }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
        {NODE_TYPES.map((t) => (
          <label key={t} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <input
              type="checkbox"
              checked={props.types[t] ?? true}
              onChange={() => props.onToggleType(t)}
              aria-label={t}
            />
            <span
              aria-hidden
              style={{
                width: 10,
                height: 10,
                borderRadius: "50%",
                background: TYPE_COLORS[t],
                display: "inline-block",
              }}
            />
            {t}
          </label>
        ))}
      </div>

      <Field label="Context">
        <Select value={props.context} onChange={props.onContextChange} options={contextOptions} />
      </Field>

      <Input
        aria-label="Search nodes"
        placeholder="Search nodes…"
        value={props.search}
        onChange={(e) => props.onSearchChange(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") props.onSearchSubmit();
        }}
      />

      <Field label="Layout">
        <Select
          value={props.layout}
          onChange={(v) => props.onLayoutChange(v as LayoutName)}
          options={layoutOptions}
        />
      </Field>

      <Button onClick={props.onRebuild} disabled={props.rebuilding}>
        {props.rebuilding ? "Rebuilding…" : "Rebuild graph"}
      </Button>
    </div>
  );
}
