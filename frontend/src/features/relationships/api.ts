import { makeResourceHooks } from "../../lib/hooks";
import { resource } from "../../lib/resource";
import type { Relationship, RelationshipCreate, RelationshipUpdate } from "../../lib/types";

const relationshipsResource = resource<Relationship, RelationshipCreate, RelationshipUpdate>(
  "/relationships",
);

export const {
  useList: useRelationships,
  useCreate: useCreateRelationship,
  useUpdate: useUpdateRelationship,
  useRemove: useDeleteRelationship,
} = makeResourceHooks<Relationship, RelationshipCreate, RelationshipUpdate>(
  "relationships",
  relationshipsResource,
);
