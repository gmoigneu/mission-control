import { render, screen } from "@testing-library/react";
import { expect, it } from "vitest";
import { Markdown } from "./Markdown";

it("renders basic markdown formatting", () => {
  render(<Markdown>{"# Title\n\nSome **bold** text."}</Markdown>);
  expect(screen.getByRole("heading", { name: "Title" })).toBeDefined();
  expect(screen.getByText("bold")).toBeDefined();
});

it("renders GFM task lists", () => {
  render(<Markdown>{"- [x] done\n- [ ] todo"}</Markdown>);
  const boxes = screen.getAllByRole("checkbox");
  expect(boxes).toHaveLength(2);
  expect((boxes[0] as HTMLInputElement).checked).toBe(true);
  expect((boxes[1] as HTMLInputElement).checked).toBe(false);
});

it("does not render raw HTML (sanitised by default)", () => {
  render(<Markdown>{"<button>pwn</button> hello"}</Markdown>);
  // The raw tag is treated as text, not turned into a real element.
  expect(screen.queryByRole("button")).toBeNull();
  expect(screen.getByText(/hello/)).toBeDefined();
});
