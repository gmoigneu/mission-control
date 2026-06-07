import { createRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { ConfirmButton } from "../components/ConfirmButton";
import { DataTable } from "../components/DataTable";
import { RequireAuth } from "../components/RequireAuth";
import { SidePanel } from "../components/SidePanel";
import { Button, Field, Input, Select } from "../components/ui";
import { useContexts } from "../features/contexts/api";
import { useCreateEntityLink, useDeleteEntityLink, useEntityLinks } from "../features/entityLinks/api";
import { useCreateMeeting, useDeleteMeeting, useMeetings, useUpdateMeeting } from "../features/meetings/api";
import { usePeople } from "../features/people/api";
import { useProjects } from "../features/projects/api";
import type { EntityLink, Meeting } from "../lib/types";
import { rootRoute } from "./root";

const ATTENDEE_KIND = "attendee";

interface FormState {
  title: string;
  slug: string;
  at: string;
  context_id: string;
  project_id: string;
  location: string;
  body: string;
}

const EMPTY_FORM: FormState = {
  title: "",
  slug: "",
  at: "",
  context_id: "",
  project_id: "",
  location: "",
  body: "",
};

export function MeetingsPage() {
  const { data: meetings = [] } = useMeetings();
  const { data: contexts = [] } = useContexts();
  const { data: projects = [] } = useProjects();
  const { data: people = [] } = usePeople();
  const { data: links = [] } = useEntityLinks();
  const createMeeting = useCreateMeeting();
  const updateMeeting = useUpdateMeeting();
  const deleteMeeting = useDeleteMeeting();
  const createLink = useCreateEntityLink();
  const deleteLink = useDeleteEntityLink();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false);
  const [attendeeFor, setAttendeeFor] = useState<string | null>(null);
  const [attendeePerson, setAttendeePerson] = useState<string>("");

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

  function handleEdit(row: Meeting) {
    setEditingId(row.id);
    setForm({
      title: row.title,
      slug: row.slug,
      // datetime-local wants "YYYY-MM-DDTHH:mm"; trim any timezone/seconds.
      at: row.at ? row.at.slice(0, 16) : "",
      context_id: row.context_id ?? "",
      project_id: row.project_id ?? "",
      location: row.location ?? "",
      body: row.body ?? "",
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
    const payload = {
      title: form.title,
      slug: form.slug,
      at: new Date(form.at).toISOString(),
      context_id: form.context_id || null,
      project_id: form.project_id || null,
      location: form.location || null,
      body: form.body || null,
    };
    if (editingId) {
      updateMeeting.mutate(
        { id: editingId, data: payload },
        { onSuccess: handleClose },
      );
    } else {
      createMeeting.mutate(payload, { onSuccess: handleClose });
    }
  }

  function attendeesFor(meetingId: string): EntityLink[] {
    return links.filter(
      (l) =>
        l.kind === ATTENDEE_KIND &&
        l.from_type === "meeting" &&
        l.from_id === meetingId &&
        l.to_type === "person",
    );
  }

  function handleAddAttendee(meetingId: string) {
    if (!attendeePerson) return;
    createLink.mutate(
      {
        from_type: "meeting",
        from_id: meetingId,
        to_type: "person",
        to_id: attendeePerson,
        kind: ATTENDEE_KIND,
      },
      {
        onSuccess: () => {
          setAttendeeFor(null);
          setAttendeePerson("");
        },
      },
    );
  }

  const contextMap = Object.fromEntries(contexts.map((c) => [c.id, c.name]));
  const projectMap = Object.fromEntries(projects.map((p) => [p.id, p.title]));
  const personMap = Object.fromEntries(people.map((p) => [p.id, p.name]));

  const columns = [
    { header: "Title", cell: (row: Meeting) => row.title },
    { header: "Slug", cell: (row: Meeting) => row.slug },
    {
      header: "When",
      cell: (row: Meeting) => (row.at ? new Date(row.at).toLocaleString() : ""),
    },
    {
      header: "Context",
      cell: (row: Meeting) => (row.context_id ? (contextMap[row.context_id] ?? row.context_id) : ""),
    },
    {
      header: "Project",
      cell: (row: Meeting) => (row.project_id ? (projectMap[row.project_id] ?? row.project_id) : ""),
    },
    {
      header: "Attendees",
      cell: (row: Meeting) => {
        const attendees = attendeesFor(row.id);
        return (
          <div className="flex flex-col gap-1">
            {attendees.map((l) => (
              <span key={l.id} className="flex items-center gap-2 text-xs">
                {personMap[l.to_id] ?? l.to_id.slice(0, 8)}
                <ConfirmButton onConfirm={() => deleteLink.mutate(l.id)}>x</ConfirmButton>
              </span>
            ))}
            {attendeeFor === row.id ? (
              <div className="flex items-center gap-2">
                <Select
                  value={attendeePerson}
                  onChange={setAttendeePerson}
                  options={people.map((p) => ({ value: p.id, label: p.name }))}
                  placeholder="— select person —"
                />
                <button
                  type="button"
                  className="text-xs text-blue-600 hover:text-blue-900"
                  onClick={() => handleAddAttendee(row.id)}
                >
                  Add
                </button>
                <button
                  type="button"
                  className="text-xs text-gray-500 hover:text-gray-900"
                  onClick={() => {
                    setAttendeeFor(null);
                    setAttendeePerson("");
                  }}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="text-xs text-blue-600 hover:text-blue-900"
                onClick={() => {
                  setAttendeeFor(row.id);
                  setAttendeePerson("");
                }}
              >
                + Attendee
              </button>
            )}
          </div>
        );
      },
    },
    {
      header: "Actions",
      cell: (row: Meeting) => (
        <div className="flex items-center gap-3">
          <button
            type="button"
            className="text-xs text-gray-500 hover:text-gray-900"
            onClick={() => handleEdit(row)}
          >
            Edit
          </button>
          <ConfirmButton onConfirm={() => deleteMeeting.mutate(row.id)}>Delete</ConfirmButton>
        </div>
      ),
    },
  ];

  return (
    <RequireAuth>
      <AppShell>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">Meetings</h1>
            <div className="flex items-center gap-4">
              <p className="text-sm text-gray-400">
                <Link to="/activity" className="underline hover:text-gray-600">
                  Manage from the Activity page to undo changes.
                </Link>
              </p>
              <Button type="button" onClick={handleNew} className="row gap-2">
                <Plus size={15} /> New
              </Button>
            </div>
          </div>

          <DataTable rows={meetings} columns={columns} empty="No meetings yet." />
        </div>

        <SidePanel
          open={panelOpen}
          onClose={handleClose}
          title={editingId ? "Edit meeting" : "New meeting"}
        >
          <form onSubmit={handleSubmit} className="grid grid-cols-1 gap-4">
            <Field label="Title">
              <Input
                value={form.title}
                onChange={handleChange("title")}
                placeholder="Weekly sync"
                aria-label="Title"
                required
              />
            </Field>
            <Field label="Slug">
              <Input
                value={form.slug}
                onChange={handleChange("slug")}
                placeholder="weekly-sync"
                aria-label="Slug"
                required
              />
            </Field>
            <Field label="When">
              <Input
                type="datetime-local"
                value={form.at}
                onChange={handleChange("at")}
                aria-label="When"
                required
              />
            </Field>
            <Field label="Location">
              <Input
                value={form.location}
                onChange={handleChange("location")}
                placeholder="Optional location"
                aria-label="Location"
              />
            </Field>
            <Field label="Context">
              <Select
                value={form.context_id}
                onChange={handleSelectChange("context_id")}
                options={contexts.map((c) => ({ value: c.id, label: c.name }))}
                placeholder="— no context —"
              />
            </Field>
            <Field label="Project">
              <Select
                value={form.project_id}
                onChange={handleSelectChange("project_id")}
                options={projects.map((p) => ({ value: p.id, label: p.title }))}
                placeholder="— no project —"
              />
            </Field>
            <Field label="Body">
              <Input
                value={form.body}
                onChange={handleChange("body")}
                placeholder="Optional notes"
                aria-label="Body"
              />
            </Field>
            <div className="flex gap-2">
              <Button type="submit" disabled={!form.title || !form.slug || !form.at}>
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

export const meetingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/meetings",
  component: MeetingsPage,
});
