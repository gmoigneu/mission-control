import {
  BellOff,
  Clock3,
  EyeOff,
  Minus,
  ThumbsDown,
  ThumbsUp,
  VolumeX,
} from "lucide-react";
import { useState } from "react";

import { Button, Field, Input } from "./ui";
import {
  type PreferenceAction,
  useCreateProactiveFeedback,
} from "../features/proactivePreferences/api";

interface ProactiveFeedbackControlsProps {
  sourceProactiveRunId?: string | null;
  routineType?: string | null;
  entityType?: string | null;
  entityRef?: string | null;
  triggerRef?: string | null;
  compact?: boolean;
}

function tomorrowLocal() {
  const date = new Date(Date.now() + 24 * 60 * 60 * 1000);
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
}

function currentTime() {
  return new Date().toTimeString().slice(0, 5);
}

function timezoneOffsetMinutes() {
  return new Date().getTimezoneOffset();
}

export function ProactiveFeedbackControls({
  sourceProactiveRunId,
  routineType = null,
  entityType = null,
  entityRef = null,
  triggerRef = null,
  compact = false,
}: ProactiveFeedbackControlsProps) {
  const createFeedback = useCreateProactiveFeedback();
  const [remindUntil, setRemindUntil] = useState(() => tomorrowLocal());
  const [lastAction, setLastAction] = useState<string | null>(null);
  const routineDisabled = !routineType || createFeedback.isPending;
  const entityDisabled = !entityRef || createFeedback.isPending;
  const triggerDisabled = !triggerRef || createFeedback.isPending;

  function submit(action: PreferenceAction, extras: Record<string, unknown> = {}) {
    createFeedback.mutate(
      {
        action,
        source_proactive_run_id: sourceProactiveRunId,
        routine_type: routineType,
        entity_type: entityType,
        entity_ref: entityRef,
        trigger_ref: triggerRef,
        ...extras,
      },
      { onSuccess: () => setLastAction(action) },
    );
  }

  function submitReminder() {
    if (!remindUntil) return;
    const date = new Date(remindUntil);
    if (Number.isNaN(date.getTime())) return;
    submit("remind_later", { remind_until: date.toISOString() });
  }

  return (
    <div className="space-y-3" aria-label="Proactive feedback controls">
      <div className="row gap-2" style={{ flexWrap: "wrap" }}>
        <Button
          type="button"
          className="ghost sm"
          title="Useful"
          aria-label="Mark useful"
          disabled={createFeedback.isPending}
          onClick={() => submit("useful")}
        >
          <ThumbsUp size={14} /> Useful
        </Button>
        <Button
          type="button"
          className="ghost sm"
          title="Not useful"
          aria-label="Mark not useful"
          disabled={createFeedback.isPending}
          onClick={() => submit("not_useful")}
        >
          <ThumbsDown size={14} /> Not useful
        </Button>
        <Button
          type="button"
          className="ghost sm"
          title="Less like this"
          aria-label="Less like this"
          disabled={createFeedback.isPending}
          onClick={() => submit("less_like_this")}
        >
          <Minus size={14} /> Less like this
        </Button>
        <Button
          type="button"
          className="ghost sm"
          title="Mute routine"
          aria-label="Mute routine"
          disabled={routineDisabled}
          onClick={() => submit("mute_routine")}
        >
          <BellOff size={14} /> Mute routine
        </Button>
        <Button
          type="button"
          className="ghost sm"
          title="Mute entity or topic"
          aria-label="Mute entity or topic"
          disabled={entityDisabled}
          onClick={() => submit("mute_entity_topic")}
        >
          <VolumeX size={14} /> Mute topic
        </Button>
        <Button
          type="button"
          className="ghost sm"
          title="Do not show again"
          aria-label="Do not show again"
          disabled={triggerDisabled}
          onClick={() => submit("do_not_show_again")}
        >
          <EyeOff size={14} /> Do not show again
        </Button>
        <Button
          type="button"
          className="ghost sm"
          title="Never at this time"
          aria-label="Never at this time"
          disabled={createFeedback.isPending}
          onClick={() =>
            submit("never_at_this_time", {
              never_at_time: currentTime(),
              timezone_offset_minutes: timezoneOffsetMinutes(),
            })
          }
        >
          <Clock3 size={14} /> Never at this time
        </Button>
      </div>

      {!compact && (
        <form
          className="row gap-2"
          style={{ flexWrap: "wrap", alignItems: "flex-end" }}
          onSubmit={(e) => {
            e.preventDefault();
            submitReminder();
          }}
        >
          <Field label="Remind later">
            <Input
              type="datetime-local"
              value={remindUntil}
              onChange={(e) => setRemindUntil(e.target.value)}
              aria-label="Remind later time"
            />
          </Field>
          <Button type="submit" className="sm" disabled={createFeedback.isPending}>
            <Clock3 size={14} /> Remind later
          </Button>
        </form>
      )}

      {lastAction && (
        <p className="meta" style={{ color: "var(--st-success)" }}>
          Preference saved: {lastAction.replaceAll("_", " ")}
        </p>
      )}
      {createFeedback.isError && (
        <p className="meta" style={{ color: "var(--st-danger)" }}>
          Could not save proactive preference.
        </p>
      )}
    </div>
  );
}
