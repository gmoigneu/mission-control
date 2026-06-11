import type { ReactNode } from "react";

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
}

/** Selector for child elements that handle their own clicks; a click landing
 * on one of these must not also trigger the row's onRowClick. */
const INTERACTIVE = "button, a, select, input, textarea, label, [role='menu']";

export function DataTable<T extends { id: string }>({
  rows,
  columns,
  empty = "Nothing yet.",
  onRowClick,
}: {
  rows: T[];
  columns: Column<T>[];
  empty?: string;
  /** When set, clicking a row's non-interactive area invokes this. Interactive
   * children (buttons, links, inputs, menus) keep handling their own clicks. */
  onRowClick?: (row: T) => void;
}) {
  if (rows.length === 0)
    return (
      <p style={{ padding: "16px", fontSize: "13px", color: "var(--fg-dim)" }}>
        {empty}
      </p>
    );
  return (
    <div className="hscroll">
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px", minWidth: "max-content" }}>
      <thead>
        <tr style={{ borderBottom: "1px solid var(--line-soft)" }}>
          {columns.map((c) => (
            <th
              key={c.header}
              className="label"
              style={{
                padding: "8px 12px",
                textAlign: "left",
                fontWeight: 500,
              }}
            >
              {c.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.id}
            style={{
              borderBottom: "1px solid var(--line-soft)",
              cursor: onRowClick ? "pointer" : undefined,
            }}
            onClick={
              onRowClick
                ? (e) => {
                    if ((e.target as HTMLElement).closest(INTERACTIVE)) return;
                    onRowClick(row);
                  }
                : undefined
            }
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLTableRowElement).style.background =
                "var(--surface-2)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLTableRowElement).style.background = "";
            }}
          >
            {columns.map((c) => (
              <td key={c.header} style={{ padding: "8px 12px" }}>
                {c.cell(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
    </div>
  );
}
