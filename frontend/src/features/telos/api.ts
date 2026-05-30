import { makeResourceHooks } from "../../lib/hooks";
import { resource } from "../../lib/resource";
import type { Telos, TelosCreate, TelosUpdate } from "../../lib/types";

export const telosResource = resource<Telos, TelosCreate, TelosUpdate>("/telos");

export const {
  useList: useTelos,
  useCreate: useCreateTelos,
  useUpdate: useUpdateTelos,
  useRemove: useDeleteTelos,
} = makeResourceHooks<Telos, TelosCreate, TelosUpdate>("telos", telosResource);
