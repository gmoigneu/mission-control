import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, it, vi } from "vitest";
import { NodeInspector } from "./NodeInspector";
import type { GraphNodeDetail } from "../../lib/types";

const detail: GraphNodeDetail = {
  id: "a",
  label: "Person",
  props: { name: "Alice", slug: "alice", role: "Engineer" },
  rels: [{ rel: "WORKS_AT", dir: "out", id: "co", label: "Company", name: "Acme" }],
};

it("renders props and relationships", () => {
  render(
    <NodeInspector detail={detail} loading={false} onSelectNode={vi.fn()} onClose={vi.fn()} />,
  );
  expect(screen.getByText("Person")).toBeInTheDocument();
  expect(screen.getByText("Engineer")).toBeInTheDocument();
  expect(screen.getByText(/Acme/)).toBeInTheDocument();
});

it("selects a related node when its row is clicked", async () => {
  const onSelectNode = vi.fn();
  render(
    <NodeInspector detail={detail} loading={false} onSelectNode={onSelectNode} onClose={vi.fn()} />,
  );
  await userEvent.click(screen.getByRole("button", { name: /Acme/ }));
  expect(onSelectNode).toHaveBeenCalledWith("co");
});

it("shows a link to the entity page for a Person", () => {
  render(
    <NodeInspector detail={detail} loading={false} onSelectNode={vi.fn()} onClose={vi.fn()} />,
  );
  const link = screen.getByRole("link", { name: /open page/i });
  expect(link).toHaveAttribute("href", "/people/alice");
});

it("shows a loading state", () => {
  render(
    <NodeInspector detail={undefined} loading={true} onSelectNode={vi.fn()} onClose={vi.fn()} />,
  );
  expect(screen.getByText(/loading/i)).toBeInTheDocument();
});
