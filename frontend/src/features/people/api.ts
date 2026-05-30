import { useQuery } from "@tanstack/react-query";

import { apiFetchPage } from "../../lib/api";
import type { Page } from "../../lib/api";
import { makeResourceHooks } from "../../lib/hooks";
import { resource } from "../../lib/resource";
import type { Person, PersonCreate, PersonUpdate } from "../../lib/types";

export const PEOPLE_PAGE_SIZE = 50;

export const peopleResource = resource<Person, PersonCreate, PersonUpdate>("/people");

export const {
  useList: usePeople,
  useCreate: useCreatePerson,
  useUpdate: useUpdatePerson,
  useRemove: useDeletePerson,
} = makeResourceHooks<Person, PersonCreate, PersonUpdate>("people", peopleResource);

export function usePeoplePage(
  { limit = PEOPLE_PAGE_SIZE, offset = 0 }: { limit?: number; offset?: number } = {},
) {
  return useQuery({
    queryKey: ["people", { limit, offset }],
    queryFn: () =>
      apiFetchPage<Person[]>(`/people?limit=${limit}&offset=${offset}`),
    placeholderData: (prev: Page<Person[]> | undefined) => prev,
  });
}
