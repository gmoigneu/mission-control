import { makeResourceHooks } from "../../lib/hooks";
import { resource } from "../../lib/resource";
import type { Company } from "../../lib/types";

export const companiesResource = resource<Company, Partial<Company>, Partial<Company>>("/companies");

export const {
  useList: useCompanies,
  useCreate: useCreateCompany,
  useUpdate: useUpdateCompany,
  useRemove: useDeleteCompany,
} = makeResourceHooks<Company, Partial<Company>, Partial<Company>>("companies", companiesResource);
