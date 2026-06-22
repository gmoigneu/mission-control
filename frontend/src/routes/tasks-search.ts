export interface TasksSearch {
  edit?: string;
  context?: string;
  project?: string;
  completed?: boolean;
}

function stringParam(value: unknown): string | undefined {
  return value == null || value === "" ? undefined : String(value);
}

export function tasksSearch(search: Record<string, unknown>): TasksSearch {
  return {
    edit: stringParam(search.edit),
    context: stringParam(search.context),
    project: stringParam(search.project),
    completed:
      search.completed === true || search.completed === "true" ? true : undefined,
  };
}
