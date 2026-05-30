import { Navigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useMe } from "../lib/auth";

export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe();
  if (me.isLoading) return <div className="p-8 text-gray-400">Loading…</div>;
  if (me.isError) return <Navigate to="/login" />;
  return <>{children}</>;
}
