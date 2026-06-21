import { Field, Input } from "./ui";
import { slugify } from "../lib/slug";

export function SlugField({
  value,
  source,
  onChange,
  label = "Advanced",
}: {
  value: string;
  source: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  const generated = slugify(source);

  return (
    <details className="advanced-fields">
      <summary>{label}</summary>
      <Field label="Slug">
        <Input
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={generated || "generated-from-title"}
          aria-label="Slug"
        />
      </Field>
      <p className="meta" style={{ margin: "6px 0 0" }}>
        {value.trim()
          ? "Custom slug will be used."
          : generated
            ? `Will be generated as ${generated}.`
            : "Generated from the name or title when saved."}
      </p>
    </details>
  );
}
