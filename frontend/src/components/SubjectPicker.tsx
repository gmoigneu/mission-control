import { useCompanies } from "../features/companies/api";
import { useContexts } from "../features/contexts/api";
import { usePeople } from "../features/people/api";
import { useProjects } from "../features/projects/api";
import { useTasks } from "../features/tasks/api";
import { type Option, Select } from "./ui";

const SUBJECT_TYPES = ["person", "project", "context", "task", "company"];

export function SubjectPicker({
  type,
  id,
  onChange,
}: {
  type: string;
  id: string;
  onChange: (type: string, id: string) => void;
}) {
  const people = usePeople();
  const projects = useProjects();
  const contexts = useContexts();
  const tasks = useTasks();
  const companies = useCompanies();

  const optionsByType: Record<string, Option[]> = {
    person: (people.data ?? []).map((p) => ({ value: p.id, label: p.name })),
    project: (projects.data ?? []).map((p) => ({ value: p.id, label: p.title })),
    context: (contexts.data ?? []).map((c) => ({ value: c.id, label: c.name })),
    task: (tasks.data ?? []).map((t) => ({ value: t.id, label: t.title })),
    company: (companies.data ?? []).map((c) => ({ value: c.id, label: c.name })),
  };

  return (
    <div className="flex gap-2">
      <Select
        value={type}
        onChange={(t) => onChange(t, "")}
        options={SUBJECT_TYPES.map((t) => ({ value: t, label: t }))}
        placeholder="— type —"
      />
      <Select
        value={id}
        onChange={(i) => onChange(type, i)}
        options={type ? (optionsByType[type] ?? []) : []}
        placeholder="— select —"
      />
    </div>
  );
}
