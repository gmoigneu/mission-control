import { createRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { ConfirmButton } from "../components/ConfirmButton";
import { DataTable } from "../components/DataTable";
import { RequireAuth } from "../components/RequireAuth";
import { SidePanel } from "../components/SidePanel";
import { useHotkey } from "../lib/useHotkey";
import { SubjectPicker } from "../components/SubjectPicker";
import { Button, Field, Input } from "../components/ui";
import { useCreateEntityLink, useDeleteEntityLink, useEntityLinks } from "../features/entityLinks/api";
import type { EntityLink } from "../lib/types";
import { rootRoute } from "./root";

interface FormState {
  from_type: string;
  from_id: string;
  to_type: string;
  to_id: string;
  kind: string;
}

const EMPTY_FORM: FormState = {
  from_type: "",
  from_id: "",
  to_type: "",
  to_id: "",
  kind: "related",
};

export function EntityLinksPage() {
  const [searchText, setSearchText] = useState("");
  const searchQuery = searchText.trim();
  const { data: entityLinks = [] } = useEntityLinks(
    searchQuery ? { q: searchQuery } : undefined,
  );
  const createEntityLink = useCreateEntityLink();
  const deleteEntityLink = useDeleteEntityLink();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [panelOpen, setPanelOpen] = useState(false);
  useHotkey("c", handleNew, !panelOpen);

  function handleFromChange(type: string, id: string) {
    setForm((prev) => ({ ...prev, from_type: type, from_id: id }));
  }

  function handleToChange(type: string, id: string) {
    setForm((prev) => ({ ...prev, to_type: type, to_id: id }));
  }

  function handleNew() {
    setForm(EMPTY_FORM);
    setPanelOpen(true);
  }

  function handleClose() {
    setPanelOpen(false);
    setForm(EMPTY_FORM);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    createEntityLink.mutate(
      {
        from_type: form.from_type,
        from_id: form.from_id,
        to_type: form.to_type,
        to_id: form.to_id,
        kind: form.kind || "related",
      },
      { onSuccess: handleClose },
    );
  }

  function entityHref(type: string, slug?: string | null) {
    if (type === "person" && slug) return `/people/${slug}`;
    const listRoutes: Record<string, string> = {
      company: "/companies",
      context: "/contexts",
      habit: "/habits",
      inbox_item: "/inbox",
      journal_entry: "/journal",
      knowledge: "/knowledge",
      meeting: "/meetings",
      project: "/projects",
      review: "/reviews",
      task: "/tasks",
      telos: "/telos",
      tone: "/tones",
    };
    return listRoutes[type];
  }

  function entityTypeLabel(type: string) {
    return type.replaceAll("_", " ");
  }

  function entityReference(row: EntityLink, side: "from" | "to") {
    const type = side === "from" ? row.from_type : row.to_type;
    const id = side === "from" ? row.from_id : row.to_id;
    const name = side === "from" ? row.from_name : row.to_name;
    const slug = side === "from" ? row.from_slug : row.to_slug;
    const label = name ?? `${entityTypeLabel(type)} ${id.slice(0, 8)}`;
    const href = entityHref(type, slug);

    return (
      <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
        {href ? (
          <a href={href} className="underline hover:text-gray-600">
            {label}
          </a>
        ) : (
          <span>{label}</span>
        )}
        <span className="meta">{entityTypeLabel(type)}</span>
      </div>
    );
  }

  const columns = [
    {
      header: "From",
      cell: (row: EntityLink) => entityReference(row, "from"),
    },
    {
      header: "To",
      cell: (row: EntityLink) => entityReference(row, "to"),
    },
    { header: "Kind", cell: (row: EntityLink) => row.kind },
    {
      header: "Actions",
      cell: (row: EntityLink) => (
        <ConfirmButton onConfirm={() => deleteEntityLink.mutate(row.id)}>Delete</ConfirmButton>
      ),
    },
  ];

  return (
    <RequireAuth>
      <AppShell>
        <div
          className="page"
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 24,
          }}
        >
          <div className="flex items-center justify-between">
            <h1 className="title">Entity Links</h1>
            <div className="flex items-center gap-4">
              <p className="meta">
                <Link to="/activity" className="underline">
                  Manage from the Activity page to undo changes.
                </Link>
              </p>
              <Button type="button" onClick={handleNew} className="row gap-2">
                <Plus size={15} /> Create
              </Button>
            </div>
          </div>

          <div className="flex items-center gap-3" role="search">
            <Input
              type="search"
              value={searchText}
              onChange={(e) => setSearchText(e.target.value)}
              placeholder="Search by entity name"
              aria-label="Search entity links"
            />
          </div>

          <DataTable rows={entityLinks} columns={columns} empty="No entity links yet." />
        </div>

        <SidePanel open={panelOpen} onClose={handleClose} title="New link">
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
            <Field label="From">
              <SubjectPicker
                type={form.from_type}
                id={form.from_id}
                onChange={handleFromChange}
              />
            </Field>
            <Field label="To">
              <SubjectPicker
                type={form.to_type}
                id={form.to_id}
                onChange={handleToChange}
              />
            </Field>
            <Field label="Kind">
              <Input
                value={form.kind}
                onChange={(e) => setForm((prev) => ({ ...prev, kind: e.target.value }))}
                placeholder="related"
                aria-label="Kind"
              />
            </Field>
            <div className="flex gap-2">
              <Button
                type="submit"
                disabled={!form.from_type || !form.from_id || !form.to_type || !form.to_id}
              >
                Add
              </Button>
              <Button type="button" onClick={handleClose} className="ghost">
                Cancel
              </Button>
            </div>
          </form>
        </SidePanel>
      </AppShell>
    </RequireAuth>
  );
}

export const entityLinksRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/entity-links",
  component: EntityLinksPage,
});
