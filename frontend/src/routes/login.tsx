import { createRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";
import { useLogin, useMe, usePasskeyLogin } from "../lib/auth";
import { isWebAuthnSupported } from "../lib/webauthn";
import { rootRoute } from "./root";

// ─── Logo mark (reused from AppShell) ─────────────────────────────────────────

function Logo() {
  return (
    <span
      style={{
        width: 36,
        height: 36,
        borderRadius: 10,
        background: "var(--surface-3)",
        border: "1px solid var(--line-bright)",
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        position: "relative",
        flexShrink: 0,
      }}
    >
      <span
        style={{
          width: 10,
          height: 10,
          borderRadius: 9,
          background: "var(--signal)",
          boxShadow: "0 0 12px var(--signal-halo)",
        }}
      />
      <span
        style={{
          position: "absolute",
          inset: 6,
          border: "1px solid var(--line-bright)",
          borderRadius: 6,
          opacity: 0.6,
        }}
      />
    </span>
  );
}

// ─── Login page ────────────────────────────────────────────────────────────────

export function LoginPage() {
  const navigate = useNavigate();
  const me = useMe();
  const login = useLogin();
  const passkeyLogin = usePasskeyLogin();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const passkeySupported = isWebAuthnSupported();

  useEffect(() => {
    if (me.data) void navigate({ to: "/" });
  }, [me.data, navigate]);

  function onSubmit(e: FormEvent) {
    e.preventDefault();
    login.mutate({ email, password }, { onSuccess: () => navigate({ to: "/" }) });
  }

  function onPasskey() {
    passkeyLogin.mutate(undefined, { onSuccess: () => navigate({ to: "/" }) });
  }

  if (me.isLoading || me.data) {
    return (
      <div className="meta" style={{ padding: "32px" }}>
        Loading…
      </div>
    );
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        background: "var(--bg)",
        padding: "24px 16px",
      }}
    >
      {/* Card */}
      <div
        className="card ticks rise"
        style={{
          width: "100%",
          maxWidth: 380,
          padding: "40px 36px 36px",
        }}
      >
        {/* Logo + wordmark */}
        <div
          className="row gap-3"
          style={{ marginBottom: 32 }}
        >
          <Logo />
          <span
            className="serif"
            style={{ fontSize: 16, fontWeight: 460, letterSpacing: "-0.01em" }}
          >
            Mission Control
          </span>
        </div>

        {/* Heading */}
        <h1
          className="title"
          style={{ margin: "0 0 28px" }}
        >
          Sign in
        </h1>

        <form onSubmit={onSubmit} style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Email */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label
              htmlFor="login-email"
              className="label"
              style={{ display: "block" }}
            >
              Email
            </label>
            <input
              id="login-email"
              className="input"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="username"
              placeholder="you@example.com"
              required
            />
          </div>

          {/* Password */}
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <label
              htmlFor="login-password"
              className="label"
              style={{ display: "block" }}
            >
              Password
            </label>
            <input
              id="login-password"
              className="input"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              placeholder="••••••••"
              required
            />
          </div>

          {/* Error */}
          {login.isError && (
            <p
              style={{
                margin: 0,
                fontSize: 12.5,
                color: "var(--st-danger)",
                fontFamily: "var(--mono)",
              }}
            >
              Invalid credentials — check your email and password.
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            className="btn primary"
            disabled={login.isPending}
            style={{ width: "100%", justifyContent: "center", marginTop: 4 }}
          >
            {login.isPending ? "Signing in…" : "Sign in"}
          </button>

          {/* Passkey sign-in */}
          {passkeySupported && (
            <>
              <div
                className="row"
                style={{ alignItems: "center", gap: 10, margin: "2px 0" }}
              >
                <span className="hr" style={{ flex: 1, height: 1 }} />
                <span className="meta" style={{ color: "var(--fg-faint)", fontSize: 11 }}>
                  or
                </span>
                <span className="hr" style={{ flex: 1, height: 1 }} />
              </div>
              <button
                type="button"
                className="btn"
                onClick={onPasskey}
                disabled={passkeyLogin.isPending}
                style={{ width: "100%", justifyContent: "center" }}
              >
                {passkeyLogin.isPending ? "Waiting for passkey…" : "Sign in with passkey"}
              </button>
              {passkeyLogin.isError && (
                <p
                  style={{
                    margin: 0,
                    fontSize: 12.5,
                    color: "var(--st-danger)",
                    fontFamily: "var(--mono)",
                  }}
                >
                  Passkey sign-in failed — try again or use your password.
                </p>
              )}
            </>
          )}
        </form>

        {/* Footer note */}
        <p
          className="meta"
          style={{
            marginTop: 24,
            textAlign: "center",
            color: "var(--fg-faint)",
            fontSize: 11,
          }}
        >
          Your personal OS. Private by design.
        </p>
      </div>
    </div>
  );
}

export const loginRoute = createRoute({
  getParentRoute: () => rootRoute,
  path: "/login",
  component: LoginPage,
});
