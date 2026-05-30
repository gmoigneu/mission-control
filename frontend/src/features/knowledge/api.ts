import { makeResourceHooks } from "../../lib/hooks";
import { resource } from "../../lib/resource";
import type { Knowledge } from "../../lib/types";

export const knowledgeResource = resource<Knowledge, Partial<Knowledge>, Partial<Knowledge>>(
  "/knowledge",
);

export const {
  useList: useKnowledge,
  useCreate: useCreateKnowledge,
  useUpdate: useUpdateKnowledge,
  useRemove: useDeleteKnowledge,
} = makeResourceHooks<Knowledge, Partial<Knowledge>, Partial<Knowledge>>(
  "knowledge",
  knowledgeResource,
);
