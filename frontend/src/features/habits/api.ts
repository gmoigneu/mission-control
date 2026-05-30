import { useMutation, useQueryClient } from "@tanstack/react-query";

import { makeResourceHooks } from "../../lib/hooks";
import { apiFetch } from "../../lib/api";
import { resource } from "../../lib/resource";
import type { Habit, HabitCreate, HabitLog, HabitLogCreate, HabitUpdate } from "../../lib/types";

export const habitsResource = resource<Habit, HabitCreate, HabitUpdate>("/habits");

export const {
  useList: useHabits,
  useCreate: useCreateHabit,
  useUpdate: useUpdateHabit,
  useRemove: useDeleteHabit,
} = makeResourceHooks<Habit, HabitCreate, HabitUpdate>("habits", habitsResource);

export function useLogHabit() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (args: { id: string; data: HabitLogCreate }) =>
      apiFetch<HabitLog>(`/habits/${args.id}/logs`, {
        method: "POST",
        body: JSON.stringify(args.data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["habits"] }),
  });
}
