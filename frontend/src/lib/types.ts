export interface Context {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string | null;
  status: string;
  color: string | null;
  created_at: string;
  updated_at: string;
}
export interface ContextCreate {
  slug: string;
  name: string;
  category?: string;
  description?: string | null;
  status?: string;
  color?: string | null;
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
  tracking_type: "boolean" | "score";
  active: boolean;
  streak: number;
  logged_today: boolean;
  today_score: number | null;
  created_at: string;
  updated_at: string;
}
export interface HabitCreate {
  slug: string;
  name: string;
  cadence?: string;
  tracking_type?: "boolean" | "score";
  active?: boolean;
}
export type HabitUpdate = Partial<HabitCreate>;

export interface HabitLog {
  id: string;
  habit_id: string;
  date: string;
  done: boolean;
  score: number | null;
  created_at: string;
  updated_at: string;
}
export interface HabitLogCreate {
  date: string;
  done?: boolean;
  score?: number | null;
}

export interface DailyCheckIn {
  id: string | null;
  date: string;
  mood: number | null;
  energy: number | null;
  productivity: number | null;
  updated_at: string | null;
}
export interface DailyCheckInUpdate {
  mood?: number | null;
  energy?: number | null;
  productivity?: number | null;
}
export interface Meeting {
  id: string;
  slug: string;
  title: string;
  at: string;
  context_id: string | null;
  project_id: string | null;
  location: string | null;
  body: string | null;
  created_at: string;
  updated_at: string;
}
export interface Knowledge {
  id: string;
  slug: string;
  title: string;
  body: string | null;
  created_at: string;
  updated_at: string;
}
export interface MeetingCreate {
  slug: string;
  title: string;
  at: string;
  context_id?: string | null;
  project_id?: string | null;
  location?: string | null;
  body?: string | null;
}
export type MeetingUpdate = Partial<MeetingCreate>;
export interface KnowledgeCreate {
  slug: string;
  title: string;
  body?: string | null;
}
export type KnowledgeUpdate = Partial<KnowledgeCreate>;
export type TelosKind = "mission" | "goal" | "problem" | "metric" | "value";
export interface Telos {
  id: string;
  kind: TelosKind;
  title: string;
  body: string | null;
  parent_id: string | null;
  created_at: string;
  updated_at: string;
}
export interface TelosCreate {
  kind: TelosKind;
  title: string;
  body?: string | null;
  parent_id?: string | null;
}
export type TelosUpdate = Partial<TelosCreate>;
export interface Tone {
  id: string;
  slug: string;
  name: string;
  description: string | null;
  sample: string | null;
  created_at: string;
  updated_at: string;
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
  productivity: number | null;
  source: string | null;
  created_at: string;
  updated_at: string;
}
export interface InboxItem {
  id: string;
  body: string;
  status: string;
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
  productivity?: number | null;
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
export interface InboxItemCreate {
  body: string;
  status?: string;
  source?: string | null;
}
export type InboxItemUpdate = Partial<InboxItemCreate>;

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
  /** Display name/title of the owning entity (null if it no longer exists). */
  name: string | null;
  /** Entity slug, when the type has one; used for deep links. */
  slug: string | null;
}

/** A node returned by the `/graph/query` "neighbors" intent. */
export interface GraphNode {
  id: string;
  label: string;
  rel: string;
  label_text: string | null;
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

// ─── Graph explorer ──────────────────────────────────────────────────────────
export interface GraphFullNode {
  id: string;
  label: string;
  name: string;
  props: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
  props: Record<string, unknown>;
}

export interface GraphSnapshot {
  nodes: GraphFullNode[];
  edges: GraphEdge[];
  truncated: boolean;
}

export interface GraphRel {
  rel: string;
  dir: "in" | "out";
  id: string;
  label: string;
  name: string;
}

export interface GraphNodeDetail {
  id: string;
  label: string;
  props: Record<string, unknown>;
  rels: GraphRel[];
}
