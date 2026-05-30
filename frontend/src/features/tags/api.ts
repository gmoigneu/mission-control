import { makeResourceHooks } from "../../lib/hooks";
import { resource } from "../../lib/resource";
import type { Tag, TagCreate, TagUpdate } from "../../lib/types";

export const tagsResource = resource<Tag, TagCreate, TagUpdate>("/tags");

export const {
  useList: useTags,
  useCreate: useCreateTag,
  useUpdate: useUpdateTag,
  useRemove: useDeleteTag,
} = makeResourceHooks<Tag, TagCreate, TagUpdate>("tags", tagsResource);
