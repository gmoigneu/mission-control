import { expect, it } from "vitest";
import { parsePageInfo } from "./pagination";

it("parses paging headers including a next offset", () => {
  const headers = new Headers({
    "X-Total-Count": "120",
    "X-Limit": "50",
    "X-Offset": "50",
    "X-Next-Offset": "100",
  });
  expect(parsePageInfo(headers, { limit: 50, offset: 50, count: 50 })).toEqual({
    total: 120,
    limit: 50,
    offset: 50,
    nextOffset: 100,
  });
});

it("treats a missing next-offset header as the last page", () => {
  const headers = new Headers({
    "X-Total-Count": "3",
    "X-Limit": "50",
    "X-Offset": "0",
  });
  expect(parsePageInfo(headers, { limit: 50, offset: 0, count: 3 }).nextOffset).toBeNull();
});

it("falls back to provided values when headers are absent", () => {
  const headers = new Headers();
  expect(parsePageInfo(headers, { limit: 25, offset: 10, count: 2 })).toEqual({
    total: 2,
    limit: 25,
    offset: 10,
    nextOffset: null,
  });
});
