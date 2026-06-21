import { useNavigate } from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";
import { useMe } from "../lib/auth";

export function RequireAuth({ children }: { children: ReactNode }) {
  const me = useMe();
  const navigate = useNavigate();
  const shouldRedirect = !me.isLoading && (me.isError || !me.data);

  useEffect(() => {
    if (shouldRedirect) {
      void navigate({ to: "/login" });
    }
  }, [navigate, shouldRedirect]);

  if (me.isLoading)
    return (
      <div className="meta" style={{ padding: "32px" }}>
        Loading…
      </div>
    );
  if (shouldRedirect)
    return (
      <div className="meta" style={{ padding: "32px" }}>
        Redirecting…
      </div>
    );
  return <>{children}</>;
}
