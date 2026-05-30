import { createRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";

import { AppShell } from "../components/AppShell";
import { RequireAuth } from "../components/RequireAuth";
import { Button, Card, Field } from "../components/ui";
import {
  usePersona,
  useResetPersona,
  useUpdatePersona,
} from "../features/persona/api";
import { rootRoute } from "./root";

interface FormState {
  name: string;
  role: string;
  tone: string;
  greeting: string;
  principles: string;
  boundaries: string;
  instructions: string;
  enabled: boolean;
}

const EMPTY_FORM: FormState = {
  name: "",
  role: "",
  tone: "",
  greeting: "",
  principles: "",
  boundaries: "",
  instructions: "",
  enabled: true,
};

const inputClass =
  "w-full rounded border border-gray-300 px-3 py-2 text-sm focus:border-gray-500 focus:outline-none";

export function SettingsPage() {
  const { data: persona } = usePersona();
  const updatePersona = useUpdatePersona();
  const resetPersona = useResetPersona();

  const [form, setForm] = useState<FormState>(EMPTY_FORM);

  // Hydrate the form whenever the persona loads/changes.
  useEffect(() => {
    if (persona) {
      setForm({
        name: persona.name ?? "",
        role: persona.role ?? "",
        tone: persona.tone ?? "",
        greeting: persona.greeting ?? "",
        principles: persona.principles ?? "",
        boundaries: persona.boundaries ?? "",
        instructions: persona.instructions ?? "",
        enabled: persona.enabled,
      });
    }
  }, [persona]);

  function handleText(key: keyof FormState) {
    return (
      e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>,
    ) => setForm((prev) => ({ ...prev, [key]: e.target.value }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    updatePersona.mutate({
      name: form.name,
      role: form.role || null,
      tone: form.tone || null,
      greeting: form.greeting || null,
      principles: form.principles || null,
      boundaries: form.boundaries || null,
      instructions: form.instructions || null,
      enabled: form.enabled,
    });
  }

  function handleReset() {
    resetPersona.mutate();
  }

  return (
    <RequireAuth>
      <AppShell>
        <div className="p-6 space-y-6 max-w-3xl">
          <div className="flex items-center justify-between">
            <h1 className="text-xl font-semibold">Settings</h1>
          </div>

          <Card>
            <div className="mb-4">
              <h2 className="text-lg font-medium">Soul</h2>
              <p className="text-sm text-gray-500">
                Aya&rsquo;s identity and voice. Tool-use and safety rules are
                always applied by the system and can&rsquo;t be removed here.
              </p>
            </div>

            <form onSubmit={handleSubmit} className="space-y-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={form.enabled}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, enabled: e.target.checked }))
                  }
                  aria-label="Enabled"
                />
                Use this personality (when off, the built-in default is used)
              </label>

              <Field label="Name">
                <input
                  className={inputClass}
                  value={form.name}
                  onChange={handleText("name")}
                  placeholder="Aya"
                  aria-label="Name"
                />
              </Field>
              <Field label="Role">
                <input
                  className={inputClass}
                  value={form.role}
                  onChange={handleText("role")}
                  placeholder="your mission-control assistant"
                  aria-label="Role"
                />
              </Field>
              <Field label="Tone">
                <input
                  className={inputClass}
                  value={form.tone}
                  onChange={handleText("tone")}
                  placeholder="Warm, direct, and concise"
                  aria-label="Tone"
                />
              </Field>
              <Field label="Greeting">
                <input
                  className={inputClass}
                  value={form.greeting}
                  onChange={handleText("greeting")}
                  placeholder="Hey — I'm Aya. What can I take off your plate?"
                  aria-label="Greeting"
                />
              </Field>
              <Field label="Principles">
                <textarea
                  className={inputClass}
                  rows={2}
                  value={form.principles}
                  onChange={handleText("principles")}
                  placeholder="How Aya should approach the work"
                  aria-label="Principles"
                />
              </Field>
              <Field label="Boundaries">
                <textarea
                  className={inputClass}
                  rows={2}
                  value={form.boundaries}
                  onChange={handleText("boundaries")}
                  placeholder="What Aya should never do"
                  aria-label="Boundaries"
                />
              </Field>
              <Field label="Instructions">
                <textarea
                  className={inputClass}
                  rows={5}
                  value={form.instructions}
                  onChange={handleText("instructions")}
                  placeholder="Freeform guidance for Aya's voice and behavior"
                  aria-label="Instructions"
                />
              </Field>

              <div className="flex gap-2">
                <Button type="submit" disabled={updatePersona.isPending}>
                  {updatePersona.isPending ? "Saving…" : "Save"}
                </Button>
                <Button
                  type="button"
                  onClick={handleReset}
                  disabled={resetPersona.isPending}
                  className="bg-gray-400 hover:bg-gray-500"
                >
                  Reset to default
                </Button>
              </div>
            </form>
          </Card>

          {persona?.preview && (
            <Card>
              <h2 className="text-sm font-medium mb-2">
                Composed system prompt (preview)
              </h2>
              <pre
                className="whitespace-pre-wrap text-xs text-gray-600"
                aria-label="System prompt preview"
              >
                {persona.preview}
              </pre>
            </Card>
          )}
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
