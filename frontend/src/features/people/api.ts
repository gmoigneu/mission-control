import { makeResourceHooks } from "../../lib/hooks";
import { resource } from "../../lib/resource";
import type { Person, PersonCreate, PersonUpdate } from "../../lib/types";

export const peopleResource = resource<Person, PersonCreate, PersonUpdate>("/people");

export const {
  useList: usePeople,
  useCreate: useCreatePerson,
  useUpdate: useUpdatePerson,
  useRemove: useDeletePerson,
} = makeResourceHooks<Person, PersonCreate, PersonUpdate>("people", peopleResource);
