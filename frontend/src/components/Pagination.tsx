import type { PageInfo } from "../lib/pagination";
import { Button } from "./ui";

/** Prev/Next pager driven by a list endpoint's paging metadata. */
export function Pagination({
  page,
  onChange,
}: {
  page: PageInfo;
  onChange: (offset: number) => void;
}) {
  const { total, limit, offset, nextOffset } = page;
  const hasPrev = offset > 0;
  const hasNext = nextOffset !== null;
  const start = total === 0 ? 0 : offset + 1;
  const end = Math.min(offset + limit, total);

  return (
    <div
      className="label"
      style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "8px 0",
        fontSize: "12px",
      }}
    >
      <span>
        {total === 0 ? "0 of 0" : `${start}–${end} of ${total}`}
      </span>
      <div style={{ display: "flex", gap: "8px" }}>
        <Button
          type="button"
          disabled={!hasPrev}
          onClick={() => onChange(Math.max(0, offset - limit))}
        >
          Previous
        </Button>
        <Button
          type="button"
          disabled={!hasNext}
          onClick={() => onChange(nextOffset ?? offset)}
        >
          Next
        </Button>
      </div>
    </div>
  );
}
