import { makeResourceHooks } from "../../lib/hooks";
import { resource } from "../../lib/resource";
import type { Task, TaskCreate, TaskUpdate } from "../../lib/types";

export const tasksResource = resource<Task, TaskCreate, TaskUpdate>("/tasks");

export const {
  useList: useTasks,
  useCreate: useCreateTask,
  useUpdate: useUpdateTask,
  useRemove: useDeleteTask,
} = makeResourceHooks<Task, TaskCreate, TaskUpdate>("tasks", tasksResource);
