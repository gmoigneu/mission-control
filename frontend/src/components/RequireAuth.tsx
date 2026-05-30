import { Navigate } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { useMe } from "../lib/auth";

export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe();
  if (me.isLoading)
    return (
      <div className="meta" style={{ padding: "32px" }}>
        Loading…
      </div>
    );
  if (me.isError || !me.data) return <Navigate to="/login" />;
  return <>{children}</>;
}
