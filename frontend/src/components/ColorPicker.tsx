import { PALETTE, paletteVar } from "./console-data";

const SWATCH = {
  width: 22,
  height: 22,
  borderRadius: "50%",
  cursor: "pointer",
  padding: 0,
} as const;

export function ColorPicker({
  value,
  onChange,
}: {
  value: string;
  onChange: (key: string) => void;
}) {
  return (
    <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
      <button
        type="button"
        aria-label="Default color"
        aria-pressed={value === ""}
        title="Default (category color)"
        onClick={() => onChange("")}
        style={{
          ...SWATCH,
          background: "var(--surface-3)",
          border: "1px solid var(--line)",
          outline: value === "" ? "2px solid var(--signal)" : "none",
          outlineOffset: 1,
        }}
      />
      {PALETTE.map((c) => (
        <button
          key={c.key}
          type="button"
          aria-label={c.label}
          aria-pressed={value === c.key}
          title={c.label}
          onClick={() => onChange(c.key)}
          style={{
            ...SWATCH,
            background: paletteVar(c.key),
            border: "1px solid var(--line)",
            outline: value === c.key ? "2px solid var(--signal)" : "none",
            outlineOffset: 1,
          }}
        />
      ))}
    </div>
  );
}
