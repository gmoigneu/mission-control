import { makeResourceHooks } from "../../lib/hooks";
import { resource } from "../../lib/resource";
import type { EntityLink, EntityLinkCreate } from "../../lib/types";

export const entityLinksResource = resource<EntityLink, EntityLinkCreate, EntityLinkCreate>(
  "/entity-links",
);

const {
  useList: useEntityLinks,
  useCreate: useCreateEntityLink,
  useRemove: useDeleteEntityLink,
} = makeResourceHooks<EntityLink, EntityLinkCreate, EntityLinkCreate>("entity-links", entityLinksResource);

export { useEntityLinks, useCreateEntityLink, useDeleteEntityLink };
