import type { ReactNode } from "react";

export interface Column<T> {
  header: string;
  cell: (row: T) => ReactNode;
}

export function DataTable<T extends { id: string }>({
  rows,
  columns,
  empty = "Nothing yet.",
}: {
  rows: T[];
  columns: Column<T>[];
  empty?: string;
}) {
  if (rows.length === 0)
    return (
      <p style={{ padding: "16px", fontSize: "13px", color: "var(--fg-dim)" }}>
        {empty}
      </p>
    );
  return (
    <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "13px" }}>
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
            style={{ borderBottom: "1px solid var(--line-soft)" }}
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
  );
}
