import { createRouter } from "@tanstack/react-router";
import { rootRoute } from "./routes/root";
import { indexRoute } from "./routes/index";
import { loginRoute } from "./routes/login";
import { contextsRoute } from "./routes/contexts";
import { projectsRoute } from "./routes/projects";
import { peopleRoute } from "./routes/people";
import { tasksRoute } from "./routes/tasks";
import { companiesRoute } from "./routes/companies";
import { telosRoute } from "./routes/telos";
import { tagsRoute } from "./routes/tags";
import { relationshipsRoute } from "./routes/relationships";
import { observationsRoute } from "./routes/observations";
import { entityTagsRoute } from "./routes/entity-tags";
import { entityLinksRoute } from "./routes/entity-links";
import { activityRoute } from "./routes/activity";
import { searchRoute } from "./routes/search";
import { placeholderRoute } from "./routes/placeholder";

const routeTree = rootRoute.addChildren([indexRoute, loginRoute, contextsRoute, projectsRoute, peopleRoute, tasksRoute, companiesRoute, telosRoute, tagsRoute, relationshipsRoute, observationsRoute, entityTagsRoute, entityLinksRoute, activityRoute, searchRoute, placeholderRoute]);

export const router = createRouter({ routeTree });

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}
