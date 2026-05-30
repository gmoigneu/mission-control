import { createRouter } from "@tanstack/react-router";
import { rootRoute } from "./routes/root";
import { indexRoute } from "./routes/index";
import { loginRoute } from "./routes/login";
import { contextsRoute } from "./routes/contexts";
import { projectsRoute } from "./routes/projects";
import { peopleRoute } from "./routes/people";
import { tasksRoute } from "./routes/tasks";
import { activityRoute } from "./routes/activity";
import { placeholderRoute } from "./routes/placeholder";

const routeTree = rootRoute.addChildren([indexRoute, loginRoute, contextsRoute, projectsRoute, peopleRoute, tasksRoute, activityRoute, placeholderRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
