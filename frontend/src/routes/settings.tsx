import { createRoute } from "@tanstack/react-router";
import { useState } from "react";
import { AppShell } from "../components/AppShell";
import { ConfirmButton } from "../components/ConfirmButton";
import { RequireAuth } from "../components/RequireAuth";
import { Button, Card, Field, Input } from "../components/ui";
import {
  useDeletePasskey,
  usePasskeys,
  useRegisterPasskey,
} from "../lib/auth";
import { isWebAuthnSupported } from "../lib/webauthn";
import { rootRoute } from "./root";

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
        <div className="p-6 space-y-6" style={{ maxWidth: 640 }}>
          <h1 className="text-xl font-semibold">Settings</h1>
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
