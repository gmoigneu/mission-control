export interface Context {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  status: string;
  created_at: string;
  updated_at: string;
}
export interface ContextCreate {
  slug: string;
  name: string;
  category?: string;
  description?: string | null;
  status?: string;
}
export type ContextUpdate = Partial<ContextCreate>;

export interface AuditEntry {
  id: string;
  actor: string;
  action: string;
  entity_type: string;
  entity_id: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  surface: string;
  reverted: boolean;
  created_at: string;
}

export interface Project {
  id: string;
  context_id: string;
  slug: string;
  title: string;
  status: string;
  purpose: string | null;
  body: string | null;
  created_at: string;
  updated_at: string;
}
export interface ProjectCreate {
  context_id: string;
  slug: string;
  title: string;
  status?: string;
  purpose?: string | null;
  body?: string | null;
}
export type ProjectUpdate = Partial<ProjectCreate>;

export interface Company {
  id: string;
  slug: string;
  name: string;
  domain: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}

export interface Habit {
  id: string;
  slug: string;
  name: string;
  cadence: string;
  active: boolean;
  streak: number;
  logged_today: boolean;
  created_at: string;
  updated_at: string;
}
export interface HabitCreate {
  slug: string;
  name: string;
  cadence?: string;
  active?: boolean;
}
export type HabitUpdate = Partial<HabitCreate>;

export interface HabitLog {
  id: string;
  habit_id: string;
  date: string;
  done: boolean;
  created_at: string;
  updated_at: string;
}
export interface HabitLogCreate {
  date: string;
  done?: boolean;
}

export interface Person {
  id: string;
  slug: string;
  name: string;
  role: string | null;
  company_id: string | null;
  email: string | null;
  linkedin: string | null;
  first_met: string | null;
  primary_context_id: string | null;
  summary: string | null;
  archived: boolean;
  created_at: string;
  updated_at: string;
}
export interface PersonCreate {
  slug: string;
  name: string;
  role?: string | null;
  company_id?: string | null;
  email?: string | null;
  linkedin?: string | null;
  first_met?: string | null;
  primary_context_id?: string | null;
  summary?: string | null;
}
export type PersonUpdate = Partial<PersonCreate>;

export interface Task {
  id: string;
  title: string;
  status: string;
  priority: string;
  due: string | null;
  scheduled: string | null;
  context_id: string | null;
  project_id: string | null;
  outcome: string | null;
  body: string | null;
  source: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}
export interface TaskCreate {
  title: string;
  status?: string;
  priority?: string;
  due?: string | null;
  scheduled?: string | null;
  context_id?: string | null;
  project_id?: string | null;
  outcome?: string | null;
  body?: string | null;
  source?: string | null;
}
export type TaskUpdate = Partial<TaskCreate>;

export interface Tag {
  id: string;
  name: string;
  kind: string | null;
  created_at: string;
  updated_at: string;
}
export interface TagCreate {
  name: string;
  kind?: string | null;
}
export type TagUpdate = Partial<TagCreate>;

export interface Relationship {
  id: string;
  from_person_id: string;
  to_person_id: string;
  type: string;
  context_id: string | null;
  since: string | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
}
export interface RelationshipCreate {
  from_person_id: string;
  to_person_id: string;
  type?: string;
  context_id?: string | null;
  since?: string | null;
  notes?: string | null;
}
export type RelationshipUpdate = Partial<RelationshipCreate>;

export interface Observation {
  id: string;
  subject_type: string;
  subject_id: string;
  date: string | null;
  kind: string;
  body: string;
  source: string | null;
  created_at: string;
  updated_at: string;
}
export interface ObservationCreate {
  subject_type: string;
  subject_id: string;
  body: string;
  kind?: string;
  date?: string | null;
  source?: string | null;
}
export type ObservationUpdate = Partial<ObservationCreate>;

export interface JournalEntry {
  id: string;
  date: string;
  title: string | null;
  body: string;
  mood: number | null;
  energy: number | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}
export interface JournalEntryCreate {
  date: string;
  body: string;
  title?: string | null;
  mood?: number | null;
  energy?: number | null;
  source?: string | null;
}
export type JournalEntryUpdate = Partial<JournalEntryCreate>;
export interface Review {
  id: string;
  period: string;
  date: string;
  title: string;
  body: string | null;
  highlights: string | null;
  created_at: string;
  updated_at: string;
}
export interface ReviewCreate {
  period?: string;
  date: string;
  title: string;
  body?: string | null;
  highlights?: string | null;
}
export type ReviewUpdate = Partial<ReviewCreate>;

export interface EntityTag {
  id: string;
  tag_id: string;
  subject_type: string;
  subject_id: string;
  created_at: string;
}
export interface EntityTagCreate {
  tag_id: string;
  subject_type: string;
  subject_id: string;
}

export interface SearchResult {
  subject_type: string;
  subject_id: string;
  score: number;
  snippet: string;
}

export interface EntityLink {
  id: string;
  from_type: string;
  from_id: string;
  to_type: string;
  to_id: string;
  kind: string;
  created_at: string;
}
export interface EntityLinkCreate {
  from_type: string;
  from_id: string;
  to_type: string;
  to_id: string;
  kind?: string;
}
