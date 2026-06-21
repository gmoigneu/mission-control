import { createRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { ConfirmButton } from "../components/ConfirmButton";
import { RequireAuth } from "../components/RequireAuth";
import { Button, Card, Field, Input, Textarea } from "../components/ui";
import type { Persona, PersonaUpdate } from "../features/persona/api";
import { usePersona, useResetPersona, useSavePersona } from "../features/persona/api";
import { useDeletePasskey, usePasskeys, useRegisterPasskey } from "../lib/auth";
import { isWebAuthnSupported } from "../lib/webauthn";
import { rootRoute } from "./root";

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

function SoulCard() {
  const { data: persona } = usePersona();
  const save = useSavePersona();
  const reset = useResetPersona();

  const [form, setForm] = useState<SoulForm>(EMPTY_FORM);
  const [saved, setSaved] = useState(false);

  // Hydrate the form from the loaded persona without an effect: when a new
  // persona object arrives (initial load, save, or reset), adjust state during
  // render — the React-recommended alternative to setState-in-effect.
  const [syncedPersona, setSyncedPersona] = useState<Persona | null>(null);
  if (persona && persona !== syncedPersona) {
    setSyncedPersona(persona);
    setForm(personaToForm(persona));
  }

  function change<K extends keyof SoulForm>(key: K) {
    return (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => {
      const value = e.target.value;
      setForm((prev) => ({ ...prev, [key]: value }));
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
                setForm((prev) => ({ ...prev, enabled: e.target.checked }));
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
                    <div className="meta" style={{ color: "var(--fg-faint)", fontSize: 11 }}>
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

          <SoulCard />
          <PasskeysCard />
        </div>
      </AppShell>
    </RequireAuth>
  );
}

export const settingsRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/settings",
  component: SettingsPage,
});
