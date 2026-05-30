import { apiFetch } from "../../lib/api";
import type { User } from "../../lib/auth";

// --- base64url helpers -----------------------------------------------------

function base64urlToBuffer(value: string): ArrayBuffer {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(padded + "=".repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

function bufferToBase64url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function isWebAuthnSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential !== "undefined" &&
    typeof navigator?.credentials?.create === "function"
  );
}

// --- option <-> credential serialization -----------------------------------

function toCreationOptions(
  options: PublicKeyCredentialCreationOptionsJSON,
): PublicKeyCredentialCreationOptions {
  return {
    ...options,
    challenge: base64urlToBuffer(options.challenge),
    user: {
      ...options.user,
      id: base64urlToBuffer(options.user.id),
    },
    excludeCredentials: (options.excludeCredentials ?? []).map((cred) => ({
      ...cred,
      id: base64urlToBuffer(cred.id),
    })),
  } as PublicKeyCredentialCreationOptions;
}

function toRequestOptions(
  options: PublicKeyCredentialRequestOptionsJSON,
): PublicKeyCredentialRequestOptions {
  return {
    ...options,
    challenge: base64urlToBuffer(options.challenge),
    allowCredentials: (options.allowCredentials ?? []).map((cred) => ({
      ...cred,
      id: base64urlToBuffer(cred.id),
    })),
  } as PublicKeyCredentialRequestOptions;
}

function serializeRegistration(credential: PublicKeyCredential): unknown {
  const response = credential.response as AuthenticatorAttestationResponse;
  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
      attestationObject: bufferToBase64url(response.attestationObject),
    },
    clientExtensionResults: credential.getClientExtensionResults(),
  };
}

function serializeAssertion(credential: PublicKeyCredential): unknown {
  const response = credential.response as AuthenticatorAssertionResponse;
  return {
    id: credential.id,
    rawId: bufferToBase64url(credential.rawId),
    type: credential.type,
    response: {
      clientDataJSON: bufferToBase64url(response.clientDataJSON),
      authenticatorData: bufferToBase64url(response.authenticatorData),
      signature: bufferToBase64url(response.signature),
      userHandle: response.userHandle
        ? bufferToBase64url(response.userHandle)
        : null,
    },
    clientExtensionResults: credential.getClientExtensionResults(),
  };
}

// --- minimal JSON option types ---------------------------------------------

interface PublicKeyCredentialCreationOptionsJSON {
  challenge: string;
  user: { id: string; name: string; displayName: string };
  excludeCredentials?: { id: string; type: string }[];
  [key: string]: unknown;
}

interface PublicKeyCredentialRequestOptionsJSON {
  challenge: string;
  allowCredentials?: { id: string; type: string }[];
  [key: string]: unknown;
}

// --- public flows -----------------------------------------------------------

export async function registerPasskey(): Promise<void> {
  const options = await apiFetch<PublicKeyCredentialCreationOptionsJSON>(
    "/auth/webauthn/register/begin",
    { method: "POST" },
  );
  const credential = (await navigator.credentials.create({
    publicKey: toCreationOptions(options),
  })) as PublicKeyCredential | null;
  if (!credential) {
    throw new Error("Passkey registration was cancelled");
  }
  await apiFetch("/auth/webauthn/register/complete", {
    method: "POST",
    body: JSON.stringify({ credential: serializeRegistration(credential) }),
  });
}

export async function loginWithPasskey(): Promise<User> {
  const options = await apiFetch<PublicKeyCredentialRequestOptionsJSON>(
    "/auth/webauthn/login/begin",
    { method: "POST" },
  );
  const credential = (await navigator.credentials.get({
    publicKey: toRequestOptions(options),
  })) as PublicKeyCredential | null;
  if (!credential) {
    throw new Error("Passkey sign-in was cancelled");
  }
  return apiFetch<User>("/auth/webauthn/login/complete", {
    method: "POST",
    body: JSON.stringify({ credential: serializeAssertion(credential) }),
  });
}
