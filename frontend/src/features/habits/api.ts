import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { makeResourceHooks } from "../../lib/hooks";
import { apiFetch } from "../../lib/api";
import { resource } from "../../lib/resource";
import type { Habit, HabitCreate, HabitLog, HabitLogCreate, HabitUpdate } from "../../lib/types";

const habitsResource = resource<Habit, HabitCreate, HabitUpdate>("/habits");

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
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["habits"] });
      qc.invalidateQueries({ queryKey: ["habit-logs"] });
    },
  });
}

interface HabitLogQuery {
  days?: number;
  end?: string;
  active?: string;
}

export function useHabitLogs(query: HabitLogQuery = {}) {
  return useQuery({
    queryKey: ["habit-logs", query],
    queryFn: () => {
      const params = new URLSearchParams();
      if (query.days !== undefined) params.set("days", String(query.days));
      if (query.end) params.set("end", query.end);
      if (query.active !== undefined) params.set("active", query.active);
      const qs = params.toString();
      return apiFetch<HabitLog[]>(`/habits/logs${qs ? `?${qs}` : ""}`);
    },
  });
}
