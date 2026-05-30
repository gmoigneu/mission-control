import { makeResourceHooks } from "../../lib/hooks";
import { resource } from "../../lib/resource";
import type { Tone } from "../../lib/types";

export const tonesResource = resource<Tone, Partial<Tone>, Partial<Tone>>("/tones");

export const {
  useList: useTones,
  useCreate: useCreateTone,
  useUpdate: useUpdateTone,
  useRemove: useDeleteTone,
} = makeResourceHooks<Tone, Partial<Tone>, Partial<Tone>>("tones", tonesResource);
