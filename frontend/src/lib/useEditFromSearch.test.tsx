import {
  RouterProvider,
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
} from "@tanstack/react-router";
import { render, waitFor } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { editSearch, useEditFromSearch } from "./useEditFromSearch";

type Item = { id: string };

function setup(initial: string, items: Item[], onOpen: (i: Item) => void) {
  const root = createRootRoute();
  function RouteComponent() {
    const editRequest = useEditFromSearch(items);
    if (editRequest) onOpen(editRequest);
    return <div>x</div>;
  }
  const x = createRoute({
    getParentRoute: () => root,
    path: "/x",
    validateSearch: editSearch,
    component: RouteComponent,
  });
  const history = createMemoryHistory({ initialEntries: [initial] });
  const router = createRouter({ routeTree: root.addChildren([x]), history });
  return render(<RouterProvider router={router} />);
}

it("opens the matching item when ?edit is present", async () => {
  const onOpen = vi.fn();
  setup("/x?edit=2", [{ id: "1" }, { id: "2" }], onOpen);
  await waitFor(() => expect(onOpen).toHaveBeenCalledWith({ id: "2" }));
});

it("does nothing without ?edit", async () => {
  const onOpen = vi.fn();
  setup("/x", [{ id: "1" }], onOpen);
  expect(onOpen).not.toHaveBeenCalled();
});

it("does nothing when the id is not in the list", async () => {
  const onOpen = vi.fn();
  setup("/x?edit=999", [{ id: "1" }], onOpen);
  expect(onOpen).not.toHaveBeenCalled();
});
