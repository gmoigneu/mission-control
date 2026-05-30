import { createRoute, Link } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { RequireAuth } from "../components/RequireAuth";
import { Button, Card, Field, Input, Textarea } from "../components/ui";
import type { Persona, PersonaUpdate } from "../features/persona/api";
import { usePersona, useResetPersona, useSavePersona } from "../features/persona/api";
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

export function SettingsPage() {
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
    <RequireAuth>
      <AppShell>
        <div className="p-6 space-y-6">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">Settings</h1>
            <p className="text-sm text-gray-400">
              <Link to="/activity" className="underline hover:text-gray-600">
                Persona edits are reversible from the Activity page.
              </Link>
            </p>
          </div>

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
                  <Button
                    type="button"
                    onClick={handleReset}
                    disabled={reset.isPending}
                    className="bg-gray-400 hover:bg-gray-500"
                  >
                    Reset to default
                  </Button>
                  {saved && <span className="text-sm text-green-600">Saved</span>}
                </div>
              </form>
            </Card>
          </section>
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
