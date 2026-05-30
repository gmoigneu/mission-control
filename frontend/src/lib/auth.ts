import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";
import { authenticateWithPasskey, registerPasskey } from "./webauthn";

export interface User {
  id: string;
  email: string;
  name: string | null;
}

export interface Passkey {
  id: string;
  name: string | null;
  created_at: string;
  last_used_at: string | null;
}

export function useMe() {
  return useQuery({
    queryKey: ["me"],
    queryFn: () => apiFetch<User>("/auth/me"),
    retry: false,
    staleTime: 30_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (creds: { email: string; password: string }) =>
      apiFetch<User>("/auth/login", { method: "POST", body: JSON.stringify(creds) }),
    onSuccess: (user) => qc.setQueryData(["me"], user),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<void>("/auth/logout", { method: "POST" }),
    onSuccess: () => qc.setQueryData(["me"], null),
  });
}

export function usePasskeyLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => authenticateWithPasskey(),
    onSuccess: (user) => qc.setQueryData(["me"], user),
  });
}

export function usePasskeys() {
  return useQuery({
    queryKey: ["passkeys"],
    queryFn: () => apiFetch<Passkey[]>("/auth/webauthn/passkeys"),
    retry: false,
  });
}

export function useRegisterPasskey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name?: string) => registerPasskey(name),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["passkeys"] }),
  });
}

export function useDeletePasskey() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<void>(`/auth/webauthn/passkeys/${id}`, { method: "DELETE" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["passkeys"] }),
  });
}
