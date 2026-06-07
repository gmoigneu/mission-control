import { createRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { ConfirmButton } from "../components/ConfirmButton";
import { DataTable } from "../components/DataTable";
import { RequireAuth } from "../components/RequireAuth";
import { SidePanel } from "../components/SidePanel";
import { useHotkey } from "../lib/useHotkey";
import { Button, Field, Input, Select } from "../components/ui";
import {
  useCreateReview,
  useDeleteReview,
  useReviews,
  useUpdateReview,
} from "../features/reviews/api";
import type { Review } from "../lib/types";
import { rootRoute } from "./root";

const PERIOD_OPTIONS = [
  { value: "weekly", label: "weekly" },
  { value: "monthly", label: "monthly" },
  { value: "quarterly", label: "quarterly" },
];

interface FormState {
  period: string;
  date: string;
  title: string;
  body: string;
  highlights: string;
}

const EMPTY_FORM: FormState = {
  period: "weekly",
  date: "",
  title: "",
  body: "",
  highlights: "",
};

function buildPayload(form: FormState) {
  return {
    period: form.period || "weekly",
    date: form.date,
    title: form.title,
    ...(form.body ? { body: form.body } : { body: null }),
    ...(form.highlights ? { highlights: form.highlights } : { highlights: null }),
  };
}

export function ReviewsPage() {
  const { data: reviews = [] } = useReviews();
  const createReview = useCreateReview();
  const updateReview = useUpdateReview();
  const deleteReview = useDeleteReview();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  useHotkey("c", handleNew, !panelOpen);

  function handleChange(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement>) =>
      setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function handleSelectChange(key: keyof FormState) {
    return (value: string) => setForm((prev) => ({ ...prev, [key]: value }));
  }

  function handleNew() {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setPanelOpen(true);
  }

  function handleEdit(row: Review) {
    setEditingId(row.id);
    setForm({
      period: row.period,
      date: row.date,
      title: row.title,
      body: row.body ?? "",
      highlights: row.highlights ?? "",
    });
    setPanelOpen(true);
  }

  function handleClose() {
    setPanelOpen(false);
    setEditingId(null);
    setForm(EMPTY_FORM);
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = buildPayload(form);
    if (editingId) {
      updateReview.mutate(
        { id: editingId, data: payload },
        { onSuccess: handleClose },
      );
    } else {
      createReview.mutate(payload, { onSuccess: handleClose });
    }
  }

  const columns = [
    { header: "Period", cell: (row: Review) => row.period },
    { header: "Date", cell: (row: Review) => row.date },
    { header: "Title", cell: (row: Review) => row.title },
    {
      header: "Highlights",
      cell: (row: Review) =>
        row.highlights && row.highlights.length > 60
          ? `${row.highlights.slice(0, 60)}…`
          : row.highlights ?? "",
    },
    {
      header: "Actions",
      cell: (row: Review) => (
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="text-xs text-gray-500 hover:text-gray-900"
            onClick={() => handleEdit(row)}
          >
            Edit
          </button>
          <ConfirmButton onConfirm={() => deleteReview.mutate(row.id)}>Delete</ConfirmButton>
        </div>
      ),
    },
  ];

  return (
    <RequireAuth>
      <AppShell>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">Reviews</h1>
            <div className="flex items-center gap-4">
              <p className="text-sm text-gray-400">
                <Link to="/activity" className="underline hover:text-gray-600">
                  Manage from the Activity page to undo changes.
                </Link>
              </p>
              <Button type="button" onClick={handleNew} className="row gap-2">
                <Plus size={15} /> Create
              </Button>
            </div>
          </div>

          <DataTable rows={reviews} columns={columns} empty="No reviews yet." />
        </div>

        <SidePanel
          open={panelOpen}
          onClose={handleClose}
          title={editingId ? "Edit review" : "New review"}
        >
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
            <Field label="Period">
              <Select
                value={form.period}
                onChange={handleSelectChange("period")}
                options={PERIOD_OPTIONS}
              />
            </Field>
            <Field label="Date">
              <Input
                type="date"
                value={form.date}
                onChange={handleChange("date")}
                aria-label="Date"
                required
              />
            </Field>
            <Field label="Title">
              <Input
                value={form.title}
                onChange={handleChange("title")}
                placeholder="Week 21 review"
                aria-label="Title"
                required
              />
            </Field>
            <Field label="Highlights">
              <Input
                value={form.highlights}
                onChange={handleChange("highlights")}
                placeholder="Wins worth remembering"
                aria-label="Highlights"
              />
            </Field>
            <Field label="Body">
              <Input
                value={form.body}
                onChange={handleChange("body")}
                placeholder="What happened, what's next"
                aria-label="Body"
              />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" disabled={!form.date || !form.title}>
                {editingId ? "Save" : "Add"}
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

export const reviewsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/reviews",
  component: ReviewsPage,
});
