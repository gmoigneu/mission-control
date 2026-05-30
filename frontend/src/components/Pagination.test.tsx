import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";
import { Pagination } from "./Pagination";

afterEach(() => vi.restoreAllMocks());

it("disables Previous on the first page and advances via Next", async () => {
  const onChange = vi.fn();
  render(
    <Pagination
      page={{ total: 120, limit: 50, offset: 0, nextOffset: 50 }}
      onChange={onChange}
    />,
  );

  expect(screen.getByText("1–50 of 120")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /previous/i })).toBeDisabled();

  await userEvent.click(screen.getByRole("button", { name: /next/i }));
  expect(onChange).toHaveBeenCalledWith(50);
});

it("disables Next on the last page and steps back via Previous", async () => {
  const onChange = vi.fn();
  render(
    <Pagination
      page={{ total: 120, limit: 50, offset: 100, nextOffset: null }}
      onChange={onChange}
    />,
  );

  expect(screen.getByText("101–120 of 120")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: /next/i })).toBeDisabled();

  await userEvent.click(screen.getByRole("button", { name: /previous/i }));
  expect(onChange).toHaveBeenCalledWith(50);
});
