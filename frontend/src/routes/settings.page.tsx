import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { ConfirmButton } from "../components/ConfirmButton";
import { RequireAuth } from "../components/RequireAuth";
import { Button, Card, Field, Input, Textarea } from "../components/ui";
import type {
  NotificationChannel,
  NotificationPolicy,
  NotificationRoutine,
  NotificationUrgency,
} from "../features/notifications/api";
import {
  useNotificationPolicy,
  useSaveNotificationPolicy,
} from "../features/notifications/api";
import type { Persona, PersonaUpdate } from "../features/persona/api";
import { usePersona, useResetPersona, useSavePersona } from "../features/persona/api";
import { useDeletePasskey, usePasskeys, useRegisterPasskey } from "../lib/auth";
import { isWebAuthnSupported } from "../lib/webauthn";

interface SoulForm {
  name: string;
  role: string;
  tone: string;
  greeting: string;
  principles: string;
  boundaries: string;
  instructions: string;
  enabled: boolean;
}

const EMPTY_FORM: SoulForm = {
  name: "",
  role: "",
  tone: "",
  greeting: "",
  principles: "",
  boundaries: "",
  instructions: "",
  enabled: true,
};

const ROUTINES: Array<{ key: NotificationRoutine; label: string }> = [
  { key: "daily_planning", label: "Daily planning" },
  { key: "task_drift", label: "Task drift" },
  { key: "inbox_digest", label: "Inbox digest" },
  { key: "relationship_followup", label: "Relationship follow-up" },
  { key: "telos_review", label: "TELOS review" },
  { key: "system_alert", label: "System alert" },
];

const CHANNELS: Array<{ value: NotificationChannel; label: string }> = [
  { value: "none", label: "None" },
  { value: "in_app", label: "In-app" },
  { value: "telegram", label: "Telegram" },
  { value: "both", label: "Both" },
];

const URGENCIES: Array<{ value: NotificationUrgency; label: string }> = [
  { value: "low", label: "Low" },
  { value: "normal", label: "Normal" },
  { value: "high", label: "High" },
  { value: "critical", label: "Critical" },
];

function personaToForm(p: Persona): SoulForm {
  return {
    name: p.name ?? "",
    role: p.role ?? "",
    tone: p.tone ?? "",
    greeting: p.greeting ?? "",
    principles: p.principles ?? "",
    boundaries: p.boundaries ?? "",
    instructions: p.instructions ?? "",
    enabled: p.enabled,
  };
}

function formToPayload(form: SoulForm): PersonaUpdate {
  const orNull = (v: string) => (v.trim() === "" ? null : v);
  return {
    name: form.name.trim() === "" ? "Aya" : form.name,
    role: orNull(form.role),
    tone: orNull(form.tone),
    greeting: orNull(form.greeting),
    principles: orNull(form.principles),
    boundaries: orNull(form.boundaries),
    instructions: orNull(form.instructions),
    enabled: form.enabled,
  };
}

function numberOrNull(value: string): number | null {
  if (value.trim() === "") return null;
  return Math.max(0, Number(value));
}

function SoulCard() {
  const { data: persona } = usePersona();
  const save = useSavePersona();
  const reset = useResetPersona();

  const [{ form, syncedPersona }, setSoulState] = useState<{
    form: SoulForm;
    syncedPersona: Persona | null;
  }>({ form: EMPTY_FORM, syncedPersona: null });
  const [saved, setSaved] = useState(false);

  // Hydrate the form from the loaded persona without an effect: when a new
  // persona object arrives (initial load, save, or reset), adjust state during
  // render — the React-recommended alternative to setState-in-effect.
  if (persona && persona !== syncedPersona) {
    setSoulState({ form: personaToForm(persona), syncedPersona: persona });
  }

  function change<K extends keyof SoulForm>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = e.target.value;
      setSoulState((prev) => ({ ...prev, form: { ...prev.form, [key]: value } }));
      setSaved(false);
    };
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    // The save updates the cached persona; the render-time sync above
    // re-hydrates the form from the canonical server response.
    save.mutate(formToPayload(form), {
      onSuccess: () => setSaved(true),
    });
  }

  function handleReset() {
    reset.mutate(undefined, {
      onSuccess: () => setSaved(false),
    });
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Soul</h2>
        <p className="text-sm text-gray-400">
          Aya&apos;s identity and voice. Tool-use and safety mechanics are always applied by
          the system and can&apos;t be edited here.
        </p>
      </div>

      <Card>
        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={form.enabled}
              onChange={(e) => {
                setSoulState((prev) => ({
                  ...prev,
                  form: { ...prev.form, enabled: e.target.checked },
                }));
                setSaved(false);
              }}
              aria-label="Enabled"
            />
            <span>Use this persona (uncheck to fall back to the built-in default)</span>
          </label>

          <div className="grid grid-cols-2 gap-4">
            <Field label="Name">
              <Input
                value={form.name}
                onChange={change("name")}
                placeholder="Aya"
                aria-label="Name"
              />
            </Field>
            <Field label="Role">
              <Input
                value={form.role}
                onChange={change("role")}
                placeholder="G's chief of staff"
                aria-label="Role"
              />
            </Field>
            <Field label="Tone">
              <Input
                value={form.tone}
                onChange={change("tone")}
                placeholder="concise, warm, direct"
                aria-label="Tone"
              />
            </Field>
            <Field label="Greeting">
              <Input
                value={form.greeting}
                onChange={change("greeting")}
                placeholder="Hi G — I'm Aya."
                aria-label="Greeting"
              />
            </Field>
          </div>

          <Field label="Operating principles">
            <Textarea
              value={form.principles}
              onChange={change("principles")}
              placeholder="Act on the user's data; prefer the smallest correct action."
              aria-label="Operating principles"
              rows={3}
            />
          </Field>

          <Field label="Boundaries">
            <Textarea
              value={form.boundaries}
              onChange={change("boundaries")}
              placeholder="What to avoid."
              aria-label="Boundaries"
              rows={3}
            />
          </Field>

          <Field label="Instructions">
            <Textarea
              value={form.instructions}
              onChange={change("instructions")}
              placeholder="Freeform persona body — the bulk of the SOUL."
              aria-label="Instructions"
              rows={6}
            />
          </Field>

          <div className="flex items-center gap-2">
            <Button type="submit" disabled={save.isPending}>
              {save.isPending ? "Saving…" : "Save"}
            </Button>
            <ConfirmButton onConfirm={handleReset} disabled={reset.isPending}>
              {reset.isPending ? "Resetting..." : "Reset to default"}
            </ConfirmButton>
            {saved && <span className="text-sm text-green-600">Saved</span>}
          </div>
        </form>
      </Card>
    </section>
  );
}

function NotificationPolicyCard() {
  const { data: policy } = useNotificationPolicy();
  const save = useSaveNotificationPolicy();
  const [draft, setDraft] = useState<{
    source: NotificationPolicy;
    form: NotificationPolicy;
  } | null>(null);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const form = policy ? (draft?.source === policy ? draft.form : policy) : null;

  function update(next: (current: NotificationPolicy) => NotificationPolicy) {
    setDraft((current) => {
      const source = policy ?? current?.source;
      if (!source) return current;
      const currentForm = current?.source === source ? current.form : source;
      return { source, form: next(currentForm) };
    });
    setSaved(false);
    setSaveError(null);
  }

  function updateRoutine(
    routine: NotificationRoutine,
    next: Partial<NotificationPolicy["routines"][NotificationRoutine]>,
  ) {
    update((current) => ({
      ...current,
      routines: {
        ...current.routines,
        [routine]: {
          ...current.routines[routine],
          ...next,
        },
      },
    }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    save.mutate(form, {
      onSuccess: () => {
        setSaved(true);
        setSaveError(null);
      },
      onError: (error) => {
        setSaved(false);
        setSaveError(
          error instanceof Error ? error.message : "Could not save notification policy.",
        );
      },
    });
  }

  return (
    <section className="space-y-3">
      <div>
        <h2 className="text-lg font-semibold">Proactive Aya</h2>
        <p className="text-sm text-gray-400">
          Attention policy for Aya-initiated notifications.
        </p>
      </div>

      <Card>
        {!form ? (
          <p className="text-sm text-gray-400">Loading notification policy...</p>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <NotificationPolicySwitches form={form} update={update} />
            <NotificationDefaults form={form} update={update} />
            <NotificationUrgencyOverrides form={form} update={update} />
            <NotificationRoutineList form={form} updateRoutine={updateRoutine} />

            <div className="flex items-center gap-2">
              <Button type="submit" disabled={save.isPending}>
                {save.isPending ? "Saving..." : "Save notification policy"}
              </Button>
              {saved && <span className="text-sm text-green-600">Notification policy saved</span>}
            </div>
            {saveError && (
              <p className="meta" role="alert" style={{ color: "var(--st-danger)" }}>
                {saveError}
              </p>
            )}
          </form>
        )}
      </Card>
    </section>
  );
}

function NotificationPolicySwitches({
  form,
  update,
}: {
  form: NotificationPolicy;
  update: (next: (current: NotificationPolicy) => NotificationPolicy) => void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.enabled}
          onChange={(e) => update((current) => ({ ...current, enabled: e.target.checked }))}
          aria-label="Proactive Aya enabled"
        />
        <span>Enable proactive Aya</span>
      </label>
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={form.quiet_hours.enabled}
          onChange={(e) =>
            update((current) => ({
              ...current,
              quiet_hours: { ...current.quiet_hours, enabled: e.target.checked },
            }))
          }
          aria-label="Quiet hours enabled"
        />
        <span>Quiet hours</span>
      </label>
    </div>
  );
}

function NotificationDefaults({
  form,
  update,
}: {
  form: NotificationPolicy;
  update: (next: (current: NotificationPolicy) => NotificationPolicy) => void;
}) {
  return (
    <div className="grid grid-cols-2 gap-4 md:grid-cols-5">
      <Field label="Quiet start">
        <Input
          type="time"
          value={form.quiet_hours.start}
          onChange={(e) =>
            update((current) => ({
              ...current,
              quiet_hours: { ...current.quiet_hours, start: e.target.value },
            }))
          }
          aria-label="Quiet start"
        />
      </Field>
      <Field label="Quiet end">
        <Input
          type="time"
          value={form.quiet_hours.end}
          onChange={(e) =>
            update((current) => ({
              ...current,
              quiet_hours: { ...current.quiet_hours, end: e.target.value },
            }))
          }
          aria-label="Quiet end"
        />
      </Field>
      <Field label="UTC offset">
        <Input
          type="number"
          value={form.quiet_hours.timezone_offset_minutes}
          onChange={(e) =>
            update((current) => ({
              ...current,
              quiet_hours: {
                ...current.quiet_hours,
                timezone_offset_minutes: Math.max(-840, Math.min(840, Number(e.target.value))),
              },
            }))
          }
          aria-label="Quiet hours UTC offset minutes"
        />
      </Field>
      <Field label="Default channel">
        <select
          className="input"
          value={form.default_channel}
          onChange={(e) =>
            update((current) => ({
              ...current,
              default_channel: e.target.value as NotificationChannel,
            }))
          }
          aria-label="Default channel"
        >
          {CHANNELS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="Default max/day">
        <Input
          type="number"
          min={0}
          value={form.default_max_per_day}
          onChange={(e) =>
            update((current) => ({
              ...current,
              default_max_per_day: Math.max(0, Number(e.target.value)),
            }))
          }
          aria-label="Default max per day"
        />
      </Field>
    </div>
  );
}

function NotificationUrgencyOverrides({
  form,
  update,
}: {
  form: NotificationPolicy;
  update: (next: (current: NotificationPolicy) => NotificationPolicy) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
      <Field label="Default cooldown">
        <Input
          type="number"
          min={0}
          value={form.default_cooldown_minutes}
          onChange={(e) =>
            update((current) => ({
              ...current,
              default_cooldown_minutes: Math.max(0, Number(e.target.value)),
            }))
          }
          aria-label="Default cooldown minutes"
        />
      </Field>
      <Field label="Quiet override">
        <UrgencySelect
          value={form.urgency_overrides.quiet_hours_min_urgency}
          label="Quiet hours override urgency"
          onChange={(value) =>
            update((current) => ({
              ...current,
              urgency_overrides: {
                ...current.urgency_overrides,
                quiet_hours_min_urgency: value,
              },
            }))
          }
        />
      </Field>
      <Field label="Cap override">
        <UrgencySelect
          value={form.urgency_overrides.frequency_cap_min_urgency}
          label="Frequency cap override urgency"
          onChange={(value) =>
            update((current) => ({
              ...current,
              urgency_overrides: {
                ...current.urgency_overrides,
                frequency_cap_min_urgency: value,
              },
            }))
          }
        />
      </Field>
      <Field label="Cooldown override">
        <UrgencySelect
          value={form.urgency_overrides.cooldown_min_urgency}
          label="Cooldown override urgency"
          onChange={(value) =>
            update((current) => ({
              ...current,
              urgency_overrides: {
                ...current.urgency_overrides,
                cooldown_min_urgency: value,
              },
            }))
          }
        />
      </Field>
    </div>
  );
}

function UrgencySelect({
  value,
  label,
  onChange,
}: {
  value: NotificationUrgency;
  label: string;
  onChange: (value: NotificationUrgency) => void;
}) {
  return (
    <select
      className="input"
      value={value}
      onChange={(e) => onChange(e.target.value as NotificationUrgency)}
      aria-label={label}
    >
      {URGENCIES.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  );
}

function NotificationRoutineList({
  form,
  updateRoutine,
}: {
  form: NotificationPolicy;
  updateRoutine: (
    routine: NotificationRoutine,
    next: Partial<NotificationPolicy["routines"][NotificationRoutine]>,
  ) => void;
}) {
  return (
    <div className="space-y-2">
      {ROUTINES.map((routine) => (
        <NotificationRoutineRow
          key={routine.key}
          routine={routine}
          routinePolicy={form.routines[routine.key]}
          updateRoutine={updateRoutine}
        />
      ))}
    </div>
  );
}

function NotificationRoutineRow({
  routine,
  routinePolicy,
  updateRoutine,
}: {
  routine: { key: NotificationRoutine; label: string };
  routinePolicy: NotificationPolicy["routines"][NotificationRoutine];
  updateRoutine: (
    routine: NotificationRoutine,
    next: Partial<NotificationPolicy["routines"][NotificationRoutine]>,
  ) => void;
}) {
  const channelId = `notification-${routine.key}-channel`;
  const maxId = `notification-${routine.key}-max`;
  const cooldownId = `notification-${routine.key}-cooldown`;

  return (
    <div className="grid grid-cols-2 gap-3 border-t border-gray-800 pt-3 md:grid-cols-[minmax(150px,1fr)_120px_120px_120px]">
      <label className="flex items-center gap-2 text-sm">
        <input
          type="checkbox"
          checked={routinePolicy.enabled}
          onChange={(e) => updateRoutine(routine.key, { enabled: e.target.checked })}
          aria-label={`${routine.label} enabled`}
        />
        <span>{routine.label}</span>
      </label>
      <label className="text-xs text-gray-400" htmlFor={channelId}>
        Channel
        <select
          id={channelId}
          className="input mt-1"
          value={routinePolicy.channel ?? ""}
          onChange={(e) =>
            updateRoutine(routine.key, {
              channel: e.target.value === "" ? null : (e.target.value as NotificationChannel),
            })
          }
          aria-label={`${routine.label} channel`}
        >
          <option value="">Default</option>
          {CHANNELS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <label className="text-xs text-gray-400" htmlFor={maxId}>
        Max/day
        <Input
          id={maxId}
          type="number"
          min={0}
          value={routinePolicy.max_per_day ?? ""}
          onChange={(e) =>
            updateRoutine(routine.key, {
              max_per_day: numberOrNull(e.target.value),
            })
          }
          aria-label={`${routine.label} max per day`}
          className="mt-1"
        />
      </label>
      <label className="text-xs text-gray-400" htmlFor={cooldownId}>
        Cooldown
        <Input
          id={cooldownId}
          type="number"
          min={0}
          value={routinePolicy.cooldown_minutes ?? ""}
          onChange={(e) =>
            updateRoutine(routine.key, {
              cooldown_minutes: numberOrNull(e.target.value),
            })
          }
          aria-label={`${routine.label} cooldown minutes`}
          className="mt-1"
        />
      </label>
    </div>
  );
}

function PasskeysCard() {
  const supported = isWebAuthnSupported();
  const { data: passkeys = [], isLoading } = usePasskeys();
  const register = useRegisterPasskey();
  const remove = useDeletePasskey();
  const [name, setName] = useState("");

  function handleRegister(e: React.FormEvent) {
    e.preventDefault();
    register.mutate(name.trim() || undefined, {
      onSuccess: () => setName(""),
    });
  }

  return (
    <Card>
      <div style={{ marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 16, fontWeight: 600 }}>Passkeys</h2>
        <p className="meta" style={{ marginTop: 4, color: "var(--fg-faint)" }}>
          Sign in without a password using a passkey stored on your device.
        </p>
      </div>

      {!supported && (
        <p style={{ fontSize: 13, color: "var(--st-danger)" }}>
          This browser does not support passkeys.
        </p>
      )}

      {supported && (
        <>
          <form
            onSubmit={handleRegister}
            className="row gap-2"
            style={{ alignItems: "flex-end", marginBottom: 20 }}
          >
            <div style={{ flex: 1 }}>
              <Field label="Passkey name (optional)">
                <Input
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. MacBook, iPhone"
                  aria-label="Passkey name"
                />
              </Field>
            </div>
            <Button type="submit" disabled={register.isPending}>
              {register.isPending ? "Waiting…" : "Register a passkey"}
            </Button>
          </form>

          {register.isError && (
            <p
              style={{
                margin: "0 0 12px",
                fontSize: 12.5,
                color: "var(--st-danger)",
                fontFamily: "var(--mono)",
              }}
            >
              Could not register the passkey. Please try again.
            </p>
          )}

          {isLoading ? (
            <p style={{ fontSize: 13, color: "var(--fg-dim)" }}>Loading passkeys…</p>
          ) : passkeys.length === 0 ? (
            <p style={{ fontSize: 13, color: "var(--fg-dim)" }}>
              No passkeys registered yet.
            </p>
          ) : (
            <ul style={{ listStyle: "none", margin: 0, padding: 0 }}>
              {passkeys.map((pk) => (
                <li
                  key={pk.id}
                  className="row"
                  style={{
                    justifyContent: "space-between",
                    alignItems: "center",
                    padding: "10px 0",
                    borderTop: "1px solid var(--line-soft)",
                  }}
                >
                  <div>
                    <div style={{ fontSize: 14 }}>{pk.name || "Unnamed passkey"}</div>
                    <div className="meta" style={{ color: "var(--fg-faint)", fontSize: 12 }}>
                      Added {new Date(pk.created_at).toLocaleDateString()}
                      {pk.last_used_at
                        ? ` · Last used ${new Date(pk.last_used_at).toLocaleDateString()}`
                        : ""}
                    </div>
                  </div>
                  <ConfirmButton onConfirm={() => remove.mutate(pk.id)}>Remove</ConfirmButton>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </Card>
  );
}

export function SettingsPage() {
  return (
    <RequireAuth>
      <AppShell>
        <div className="page space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h1 className="text-xl font-semibold">Settings</h1>
            <p className="text-sm text-gray-400">
              <Link to="/activity" className="underline hover:text-gray-600">
                Persona edits are reversible from the Activity page.
              </Link>
            </p>
          </div>

          <NotificationPolicyCard />
          <SoulCard />
          <PasskeysCard />
        </div>
      </AppShell>
    </RequireAuth>
  );
}
