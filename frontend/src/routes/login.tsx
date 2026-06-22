import { createRoute, useNavigate } from "@tanstack/react-router";
import { type FormEvent, useEffect, useState } from "react";
import { useLogin, useMe, usePasskeyLogin } from "../lib/auth";
import { isWebAuthnSupported } from "../lib/webauthn";
import { rootRoute } from "./root";

// ─── Logo mark (reused from AppShell) ─────────────────────────────────────────

function Logo() {
  return (
    <span className="app-logo login-logo">
      <span className="app-logo-core" />
      <span className="app-logo-frame" />
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
    login.mutate({ email, password });
  }

  function onPasskey() {
    passkeyLogin.mutate();
  }

  if (me.isLoading || me.data) {
    return (
      <div className="meta login-loading">
        Loading…
      </div>
    );
  }

  return (
    <div className="login-page">
      {/* Card */}
      <div
        className="card ticks rise login-card"
      >
        {/* Logo + wordmark */}
        <div className="row gap-3 login-brand">
          <Logo />
          <span className="serif login-wordmark">
            Mission Control
          </span>
        </div>

        {/* Heading */}
        <h1 className="title login-title">
          Sign in
        </h1>

        <form onSubmit={onSubmit} className="login-form">
          {/* Email */}
          <div className="login-field">
            <label
              htmlFor="login-email"
              className="label login-label"
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
          <div className="login-field">
            <label
              htmlFor="login-password"
              className="label login-label"
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
            <p className="login-error">
              Invalid credentials — check your email and password.
            </p>
          )}

          {/* Submit */}
          <button
            type="submit"
            className="btn primary login-button"
            disabled={login.isPending}
          >
            {login.isPending ? "Signing in…" : "Sign in"}
          </button>

          {/* Passkey sign-in */}
          {passkeySupported && (
            <>
              <div className="row login-divider">
                <span className="hr login-divider-line" />
                <span className="meta login-divider-label">
                  or
                </span>
                <span className="hr login-divider-line" />
              </div>
              <button
                type="button"
                className="btn login-button"
                onClick={onPasskey}
                disabled={passkeyLogin.isPending}
              >
                {passkeyLogin.isPending ? "Waiting for passkey…" : "Sign in with passkey"}
              </button>
              {passkeyLogin.isError && (
                <p className="login-error">
                  Passkey sign-in failed — try again or use your password.
                </p>
              )}
            </>
          )}
        </form>

        {/* Footer note */}
        <p className="meta login-footer">
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
