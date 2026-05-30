import { createRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { ConfirmButton } from "../components/ConfirmButton";
import { DataTable } from "../components/DataTable";
import { RequireAuth } from "../components/RequireAuth";
import { Button, Card, Field, Input, Select } from "../components/ui";
import {
  useCreateInboxItem,
  useDeleteInboxItem,
  useInboxItems,
  useUpdateInboxItem,
} from "../features/inbox/api";
import type { InboxItem } from "../lib/types";
import { rootRoute } from "./root";

interface FormState {
  title: string;
  source_type: string;
  url: string;
  status: string;
  priority: string;
  note: string;
}

const EMPTY_FORM: FormState = {
  title: "",
  source_type: "other",
  url: "",
  status: "queued",
  priority: "normal",
  note: "",
};

/** Build an InboxItemCreate/InboxItemUpdate payload.
 * On create: omit empty optional fields entirely.
 * On update: send null for cleared optional fields so the backend can unset them.
 */
function buildPayload(form: FormState, isEdit: boolean) {
  return {
    title: form.title,
    source_type: form.source_type,
    status: form.status,
    priority: form.priority,
    ...(isEdit ? { url: form.url || null } : form.url ? { url: form.url } : {}),
    ...(isEdit ? { note: form.note || null } : form.note ? { note: form.note } : {}),
  };
}

const SOURCE_TYPE_OPTIONS = [
  { value: "repo", label: "Repo" },
  { value: "article", label: "Article" },
  { value: "tool", label: "Tool" },
  { value: "idea", label: "Idea" },
  { value: "video", label: "Video" },
  { value: "other", label: "Other" },
];

const STATUS_OPTIONS = [
  { value: "queued", label: "Queued" },
  { value: "reviewed", label: "Reviewed" },
  { value: "archived", label: "Archived" },
];

const PRIORITY_OPTIONS = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
];

export function InboxPage() {
  const { data: items = [] } = useInboxItems();
  const createItem = useCreateInboxItem();
  const updateItem = useUpdateInboxItem();
  const deleteItem = useDeleteInboxItem();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);

  function handleChange(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function handleSelectChange(key: keyof FormState) {
    return (value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleEdit(row: InboxItem) {
    setEditingId(row.id);
    setForm({
      title: row.title,
      source_type: row.source_type,
      url: row.url ?? "",
      status: row.status,
      priority: row.priority,
      note: row.note ?? "",
    });
  }

  function handleCancel() {
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = buildPayload(form, !!editingId);
    if (editingId) {
      updateItem.mutate(
        { id: editingId, data: payload },
        {
          onSuccess: () => {
            setEditingId(null);
            setForm(EMPTY_FORM);
          },
        },
      );
    } else {
      createItem.mutate(payload, {
        onSuccess: () => setForm(EMPTY_FORM),
      });
    }
  }

  function setStatus(row: InboxItem, status: string) {
    updateItem.mutate({ id: row.id, data: { status } });
  }

  const columns = [
    { header: "Title", cell: (row: InboxItem) => row.title },
    { header: "Source", cell: (row: InboxItem) => row.source_type },
    {
      header: "URL",
      cell: (row: InboxItem) =>
        row.url ? (
          <a
            href={row.url}
            target="_blank"
            rel="noreferrer"
            className="underline hover:text-gray-600"
          >
            {row.url}
          </a>
        ) : (
          ""
        ),
    },
    { header: "Status", cell: (row: InboxItem) => row.status },
    { header: "Priority", cell: (row: InboxItem) => row.priority },
    {
      header: "Actions",
      cell: (row: InboxItem) => (
        <div className="flex items-center gap-3">
          {row.status === "queued" && (
            <button
              type="button"
              className="text-xs text-gray-500 hover:text-gray-900"
              onClick={() => setStatus(row, "reviewed")}
            >
              Review
            </button>
          )}
          {row.status !== "archived" && (
            <button
              type="button"
              className="text-xs text-gray-500 hover:text-gray-900"
              onClick={() => setStatus(row, "archived")}
            >
              Archive
            </button>
          )}
          {row.status === "archived" && (
            <button
              type="button"
              className="text-xs text-gray-500 hover:text-gray-900"
              onClick={() => setStatus(row, "queued")}
            >
              Restore
            </button>
          )}
          <button
            type="button"
            className="text-xs text-gray-500 hover:text-gray-900"
            onClick={() => handleEdit(row)}
          >
            Edit
          </button>
          <ConfirmButton onConfirm={() => deleteItem.mutate(row.id)}>Delete</ConfirmButton>
        </div>
      ),
    },
  ];

  return (
    <RequireAuth>
      <AppShell>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">Inbox</h1>
            <p className="text-sm text-gray-400">
              <Link to="/activity" className="underline hover:text-gray-600">
                Manage from the Activity page to undo changes.
              </Link>
            </p>
          </div>

          <Card>
            <form onSubmit={handleSubmit} className="grid grid-cols-2 gap-4">
              <Field label="Title">
                <Input
                  value={form.title}
                  onChange={handleChange("title")}
                  placeholder="What did you capture?"
                  aria-label="Title"
                  required
                />
              </Field>
              <Field label="Source Type">
                <Select
                  value={form.source_type}
                  onChange={handleSelectChange("source_type")}
                  options={SOURCE_TYPE_OPTIONS}
                />
              </Field>
              <Field label="URL">
                <Input
                  value={form.url}
                  onChange={handleChange("url")}
                  placeholder="Optional URL"
                  aria-label="URL"
                />
              </Field>
              <Field label="Status">
                <Select
                  value={form.status}
                  onChange={handleSelectChange("status")}
                  options={STATUS_OPTIONS}
                />
              </Field>
              <Field label="Priority">
                <Select
                  value={form.priority}
                  onChange={handleSelectChange("priority")}
                  options={PRIORITY_OPTIONS}
                />
              </Field>
              <Field label="Note">
                <Input
                  value={form.note}
                  onChange={handleChange("note")}
                  placeholder="Optional note"
                  aria-label="Note"
                />
              </Field>
              <div className="col-span-2 flex gap-2">
                <Button type="submit">{editingId ? "Save" : "Add"}</Button>
                {editingId && (
                  <Button
                    type="button"
                    onClick={handleCancel}
                    className="bg-gray-400 hover:bg-gray-500"
                  >
                    Cancel
                  </Button>
                )}
              </div>
            </form>
          </Card>

          <DataTable rows={items} columns={columns} empty="No inbox items yet." />
        </div>
      </AppShell>
    </RequireAuth>
  );
}

export const inboxRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/inbox",
  component: InboxPage,
});
