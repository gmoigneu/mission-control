import { apiFetch } from "./api";
import type { User } from "./auth";

// ─── base64url <-> ArrayBuffer helpers ────────────────────────────────────────
// The backend (py_webauthn `options_to_json`) emits challenge / credential ids as
// base64url strings; the browser WebAuthn API needs BufferSources, and emits
// ArrayBuffers we must base64url-encode before sending back.

function base64urlToBuffer(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const pad = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + pad);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes.buffer;
}

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** True when the browser exposes the WebAuthn API. */
export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof navigator.credentials?.create === "function"
  );
}

// ─── Option decoding ──────────────────────────────────────────────────────────

interface JsonCredentialDescriptor {
  id: string;
  type: PublicKeyCredentialType;
  transports?: AuthenticatorTransport[];
}

function decodeDescriptors(
  list: JsonCredentialDescriptor[] | undefined,
): PublicKeyCredentialDescriptor[] | undefined {
  if (!list) return undefined;
  return list.map((d) => ({
    id: base64urlToBuffer(d.id),
    type: d.type,
    transports: d.transports,
  }));
}

function decodeCreationOptions(
  json: Record<string, unknown>,
): PublicKeyCredentialCreationOptions {
  const opts = json as unknown as PublicKeyCredentialCreationOptions & {
    challenge: string;
    user: { id: string; name: string; displayName: string };
    excludeCredentials?: JsonCredentialDescriptor[];
  };
  return {
    ...opts,
    challenge: base64urlToBuffer(opts.challenge as unknown as string),
    user: { ...opts.user, id: base64urlToBuffer(opts.user.id as unknown as string) },
    excludeCredentials: decodeDescriptors(opts.excludeCredentials),
  };
}

function decodeRequestOptions(
  json: Record<string, unknown>,
): PublicKeyCredentialRequestOptions {
  const opts = json as unknown as PublicKeyCredentialRequestOptions & {
    challenge: string;
    allowCredentials?: JsonCredentialDescriptor[];
  };
  return {
    ...opts,
    challenge: base64urlToBuffer(opts.challenge as unknown as string),
    allowCredentials: decodeDescriptors(opts.allowCredentials),
  };
}

// ─── Response encoding ────────────────────────────────────────────────────────

function encodeRegistrationCredential(cred: PublicKeyCredential): Record<string, unknown> {
  const response = cred.response as AuthenticatorAttestationResponse;
  const transports =
    typeof response.getTransports === "function" ? response.getTransports() : undefined;
  return {
    id: cred.id,
    rawId: bufferToBase64url(cred.rawId),
    type: cred.type,
    authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
    clientExtensionResults: cred.getClientExtensionResults(),
    response: {
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
      attestationObject: bufferToBase64url(response.attestationObject),
      transports,
    },
  };
}

function encodeAuthenticationCredential(cred: PublicKeyCredential): Record<string, unknown> {
  const response = cred.response as AuthenticatorAssertionResponse;
  return {
    id: cred.id,
    rawId: bufferToBase64url(cred.rawId),
    type: cred.type,
    authenticatorAttachment: cred.authenticatorAttachment ?? undefined,
    clientExtensionResults: cred.getClientExtensionResults(),
    response: {
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
      authenticatorData: bufferToBase64url(response.authenticatorData),
      signature: bufferToBase64url(response.signature),
      userHandle: response.userHandle ? bufferToBase64url(response.userHandle) : undefined,
    },
  };
}

// ─── Public flows ─────────────────────────────────────────────────────────────

/** Register a new passkey for the signed-in user. Requires an active session. */
export async function registerPasskey(name?: string): Promise<void> {
  const optionsJson = await apiFetch<Record<string, unknown>>(
    "/auth/webauthn/register/options",
    { method: "POST" },
  );
  const credential = (await navigator.credentials.create({
    publicKey: decodeCreationOptions(optionsJson),
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("Passkey registration was cancelled");
  await apiFetch<unknown>("/auth/webauthn/register/verify", {
    method: "POST",
    body: JSON.stringify({
      credential: encodeRegistrationCredential(credential),
      name: name ?? null,
    }),
  });
}

/** Sign in with an existing passkey. Returns the authenticated user. */
export async function authenticateWithPasskey(): Promise<User> {
  const optionsJson = await apiFetch<Record<string, unknown>>(
    "/auth/webauthn/authenticate/options",
    { method: "POST" },
  );
  const credential = (await navigator.credentials.get({
    publicKey: decodeRequestOptions(optionsJson),
  })) as PublicKeyCredential | null;
  if (!credential) throw new Error("Passkey sign-in was cancelled");
  return apiFetch<User>("/auth/webauthn/authenticate/verify", {
    method: "POST",
    body: JSON.stringify({ credential: encodeAuthenticationCredential(credential) }),
  });
}
