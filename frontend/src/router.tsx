import { createRouter } from "@tanstack/react-router";
import { rootRoute } from "./routes/root";
import { indexRoute } from "./routes/index";
import { loginRoute } from "./routes/login";
import { placeholderRoute } from "./routes/placeholder";

const routeTree = rootRoute.addChildren([indexRoute, loginRoute, placeholderRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
