import { createRoute, Link } from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { useReducer } from "react";
import { AppShell } from "../components/AppShell";
import { ConfirmButton } from "../components/ConfirmButton";
import { DataTable } from "../components/DataTable";
import { RequireAuth } from "../components/RequireAuth";
import { SidePanel } from "../components/SidePanel";
import { SlugField } from "../components/SlugField";
import { editSearch, useEditFromSearch } from "../lib/useEditFromSearch";
import { useHotkey } from "../lib/useHotkey";
import { resolvedSlug } from "../lib/slug";
import { Button, Field, Input, Select, Textarea } from "../components/ui";
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

interface MeetingsState {
  form: FormState;
  editingId: string | null;
  panelOpen: boolean;
  attendeeFor: string | null;
  attendeePerson: string;
}

type MeetingsAction =
  | { type: "openNew" }
  | { type: "editMeeting"; meeting: Meeting }
  | { type: "closePanel" }
  | { type: "updateForm"; key: keyof FormState; value: string }
  | { type: "setAttendeePicker"; meetingId: string | null }
  | { type: "setAttendeePerson"; personId: string }
  | { type: "resetAttendeePicker" };

function initialMeetingsState(): MeetingsState {
  return {
    form: EMPTY_FORM,
    editingId: null,
    panelOpen: false,
    attendeeFor: null,
    attendeePerson: "",
  };
}

function meetingsReducer(state: MeetingsState, action: MeetingsAction): MeetingsState {
  switch (action.type) {
    case "openNew":
      return { ...state, form: EMPTY_FORM, editingId: null, panelOpen: true };
    case "editMeeting":
      return {
        ...state,
        editingId: action.meeting.id,
        form: {
          title: action.meeting.title,
          slug: action.meeting.slug,
          // datetime-local wants "YYYY-MM-DDTHH:mm"; trim any timezone/seconds.
          at: action.meeting.at ? action.meeting.at.slice(0, 16) : "",
          context_id: action.meeting.context_id ?? "",
          project_id: action.meeting.project_id ?? "",
          location: action.meeting.location ?? "",
          body: action.meeting.body ?? "",
        },
        panelOpen: true,
      };
    case "closePanel":
      return { ...state, form: EMPTY_FORM, editingId: null, panelOpen: false };
    case "updateForm":
      return { ...state, form: { ...state.form, [action.key]: action.value } };
    case "setAttendeePicker":
      return { ...state, attendeeFor: action.meetingId, attendeePerson: "" };
    case "setAttendeePerson":
      return { ...state, attendeePerson: action.personId };
    case "resetAttendeePicker":
      return { ...state, attendeeFor: null, attendeePerson: "" };
  }
}

export function MeetingsPage() {
  const { data: meetings = [] } = useMeetings();
  const editRequest = useEditFromSearch(meetings);
  const { data: contexts = [] } = useContexts();
  const { data: projects = [] } = useProjects();
  const { data: people = [] } = usePeople();
  const { data: links = [] } = useEntityLinks();
  const createMeeting = useCreateMeeting();
  const updateMeeting = useUpdateMeeting();
  const deleteMeeting = useDeleteMeeting();
  const createLink = useCreateEntityLink();
  const deleteLink = useDeleteEntityLink();

  const [state, dispatch] = useReducer(meetingsReducer, undefined, initialMeetingsState);
  const { form, editingId, panelOpen, attendeeFor, attendeePerson } = state;
  useHotkey("c", handleNew, !panelOpen);
  if (editRequest) handleEdit(editRequest);

  function handleChange(key: keyof FormState) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
      dispatch({ type: "updateForm", key, value: e.target.value });
  }

  function handleSelectChange(key: keyof FormState) {
    return (value: string) => dispatch({ type: "updateForm", key, value });
  }

  function handleNew() {
    dispatch({ type: "openNew" });
  }

  function handleEdit(row: Meeting) {
    dispatch({ type: "editMeeting", meeting: row });
  }

  function handleClose() {
    dispatch({ type: "closePanel" });
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const payload = {
      title: form.title,
      slug: resolvedSlug(form.slug, form.title),
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
        onSuccess: () => dispatch({ type: "resetAttendeePicker" }),
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
                  onChange={(personId) => dispatch({ type: "setAttendeePerson", personId })}
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
                  onClick={() => dispatch({ type: "resetAttendeePicker" })}
                >
                  Cancel
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="text-xs text-blue-600 hover:text-blue-900"
                onClick={() => dispatch({ type: "setAttendeePicker", meetingId: row.id })}
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
                <Plus size={15} /> Create
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
              <Textarea
                value={form.body}
                onChange={handleChange("body")}
                placeholder="Optional notes"
                aria-label="Body"
                rows={7}
              />
            </Field>
            <SlugField
              value={form.slug}
              source={form.title}
              onChange={(value) => dispatch({ type: "updateForm", key: "slug", value })}
            />
            <div className="flex gap-2">
              <Button type="submit" disabled={!form.title || !form.at}>
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
  validateSearch: editSearch,
  path: "/meetings",
  component: MeetingsPage,
});
