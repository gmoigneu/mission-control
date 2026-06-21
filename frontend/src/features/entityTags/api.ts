import { makeResourceHooks } from "../../lib/hooks";
import { resource } from "../../lib/resource";
import type { EntityTag, EntityTagCreate } from "../../lib/types";

const entityTagsResource = resource<EntityTag, EntityTagCreate, EntityTagCreate>(
  "/entity-tags",
);

const {
  useList: useEntityTags,
  useCreate: useCreateEntityTag,
  useRemove: useDeleteEntityTag,
} = makeResourceHooks<EntityTag, EntityTagCreate, EntityTagCreate>("entity-tags", entityTagsResource);

export { useEntityTags, useCreateEntityTag, useDeleteEntityTag };
