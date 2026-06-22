import { makeResourceHooks } from "../../lib/hooks";
import { resource } from "../../lib/resource";
import type { Context, ContextCreate, ContextUpdate } from "../../lib/types";

const contextsResource = resource<Context, ContextCreate, ContextUpdate>("/contexts");

export const {
  useList: useContexts,
  useCreate: useCreateContext,
  useUpdate: useUpdateContext,
  useRemove: useDeleteContext,
} = makeResourceHooks<Context, ContextCreate, ContextUpdate>("contexts", contextsResource);
