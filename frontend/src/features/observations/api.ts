import { makeResourceHooks } from "../../lib/hooks";
import { resource } from "../../lib/resource";
import type { Observation, ObservationCreate, ObservationUpdate } from "../../lib/types";

export const observationsResource = resource<Observation, ObservationCreate, ObservationUpdate>(
  "/observations",
);

export const {
  useList: useObservations,
  useCreate: useCreateObservation,
  useUpdate: useUpdateObservation,
  useRemove: useDeleteObservation,
} = makeResourceHooks<Observation, ObservationCreate, ObservationUpdate>(
  "observations",
  observationsResource,
);
