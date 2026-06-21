import { useQuery } from "@tanstack/react-query";

import { apiFetch } from "../../lib/api";
import { makeResourceHooks } from "../../lib/hooks";
import { resource } from "../../lib/resource";
import type { Company } from "../../lib/types";

const companiesResource = resource<Company, Partial<Company>, Partial<Company>>("/companies");

export const {
  useList: useCompanies,
  useCreate: useCreateCompany,
  useUpdate: useUpdateCompany,
  useRemove: useDeleteCompany,
} = makeResourceHooks<Company, Partial<Company>, Partial<Company>>("companies", companiesResource);

export function useCompanyBySlug(slug: string) {
  return useQuery({
    queryKey: ["companies", "slug", slug],
    queryFn: () => apiFetch<Company>(`/companies/by-slug/${encodeURIComponent(slug)}`),
    enabled: slug.length > 0,
  });
}
