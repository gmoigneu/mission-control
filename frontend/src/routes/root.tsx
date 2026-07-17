import { createRootRoute, Outlet } from "@tanstack/react-router";

import { AyaQuake } from "../components/AyaQuake";
import { AyaProvider } from "../features/agent/AyaProvider";

export const rootRoute = createRootRoute({
  // AyaProvider wraps both the routed pages (whose AppShell holds the toggle
  // buttons) and the quake window, which is mounted once here so it survives
  // route navigation. AyaQuake renders nothing until the user is authenticated.
  component: () => (
    <AyaProvider>
      <Outlet />
      <AyaQuake />
    </AyaProvider>
  ),
});
