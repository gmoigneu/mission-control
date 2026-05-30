import { useState } from "react";
import { createFileRoute, Link } from "@tanstack/react-router";
import { isWebAuthnSupported, registerPasskey } from "../features/webauthn/api";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const [status, setStatus] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onRegister() {
    setStatus(null);
    setError(null);
    setLoading(true);
    try {
      await registerPasskey();
      setStatus("Passkey registered");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Passkey registration failed");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="settings">
      <h1>Settings</h1>
      <section className="settings-panel">
        <h2>Passkeys</h2>
        <p>Register a passkey for password-free sign in.</p>
        {isWebAuthnSupported() ? (
          <button type="button" onClick={onRegister} disabled={loading}>
            {loading ? "Registering..." : "Register a passkey"}
          </button>
        ) : (
          <p>This browser does not support passkeys.</p>
        )}
        {status && <p className="status">{status}</p>}
        {error && <p className="error">{error}</p>}
      </section>
      <p>
        <Link to="/">Back to home</Link>
      </p>
    </div>
  );
}
