import { useMutation, useQueryClient } from "@tanstack/react-query";

import { apiFetch } from "../../lib/api";
import { makeResourceHooks } from "../../lib/hooks";
import { resource } from "../../lib/resource";
import type {
  Task,
  TaskCreate,
  TaskRecurrence,
  TaskRecurrenceUpdate,
  TaskUpdate,
} from "../../lib/types";

const tasksResource = resource<Task, TaskCreate, TaskUpdate>("/tasks");

export const {
  useList: useTasks,
  useCreate: useCreateTask,
  useUpdate: useUpdateTask,
  useRemove: useDeleteTask,
} = makeResourceHooks<Task, TaskCreate, TaskUpdate>("tasks", tasksResource);

export function useUpdateTaskRecurrence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: TaskRecurrenceUpdate }) =>
      apiFetch<TaskRecurrence>(`/task-recurrences/${id}`, {
        method: "PATCH",
        body: JSON.stringify(data),
      }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}

export function useDisableTaskRecurrence() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      apiFetch<TaskRecurrence>(`/task-recurrences/${id}/disable`, { method: "POST" }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["tasks"] }),
  });
}
