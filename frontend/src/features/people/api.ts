import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "../../lib/api";
import { useAuthenticatedQueryEnabled } from "../../lib/auth";
import { makeResourceHooks } from "../../lib/hooks";
import { resource } from "../../lib/resource";
import type { Person, PersonCreate, PersonUpdate } from "../../lib/types";

const peopleResource = resource<Person, PersonCreate, PersonUpdate>("/people");

export const {
  useList: usePeople,
  usePagedList: usePeoplePage,
  useCreate: useCreatePerson,
  useUpdate: useUpdatePerson,
  useRemove: useDeletePerson,
} = makeResourceHooks<Person, PersonCreate, PersonUpdate>("people", peopleResource);

/** Resolve a single person by slug — the detail page key. Fetches just that
 * record instead of scanning the paginated list (which only holds one page). */
export function usePersonBySlug(slug: string) {
  const enabled = useAuthenticatedQueryEnabled(slug.length > 0);
  return useQuery({
    queryKey: ["people", "slug", slug],
    queryFn: () => apiFetch<Person>(`/people/by-slug/${encodeURIComponent(slug)}`),
    enabled,
  });
}
