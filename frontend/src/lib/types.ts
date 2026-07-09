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
  agent_run_id: string | null;
  reverted: boolean;
  created_at: string;
}

export interface RelatedEntityRef {
  entity_type: string;
  entity_id: string;
  label: string | null;
}

export interface ProactiveRun {
  id: string;
  routine_type: string;
  routine_name: string;
  trigger_reason: string;
  trigger_data_summary: string;
  related_entities: RelatedEntityRef[];
  policy_decision: string;
  channels: string[];
  message_title: string;
  message_summary: string;
  message_body: string;
  delivery_status: Record<string, string>;
  outcome: "sent" | "opened" | "dismissed" | "muted" | "acted" | "expired";
  agent_run_id: string | null;
  audit_log_ids: string[];
  dismissed_at: string | null;
  muted_at: string | null;
  created_at: string;
  updated_at: string;
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
  recurrence_id: string | null;
  recurrence: TaskRecurrence | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
}
export type TaskRecurrenceFrequency = "daily" | "weekly" | "monthly";
export interface TaskRecurrenceRule {
  frequency: TaskRecurrenceFrequency;
  start_date: string;
  weekday?: number | null;
  month_day?: number | null;
}
export interface TaskRecurrence {
  id: string;
  title: string;
  priority: string;
  context_id: string | null;
  project_id: string | null;
  outcome: string | null;
  body: string | null;
  source: string | null;
  frequency: TaskRecurrenceFrequency;
  start_date: string;
  weekday: number | null;
  month_day: number | null;
  active: boolean;
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
  recurrence?: TaskRecurrenceRule | null;
}
export type TaskUpdate = Partial<TaskCreate>;
export type TaskRecurrenceUpdate = Partial<
  Pick<
    TaskRecurrence,
    | "title"
    | "priority"
    | "context_id"
    | "project_id"
    | "outcome"
    | "body"
    | "source"
    | "frequency"
    | "start_date"
    | "weekday"
    | "month_day"
    | "active"
  >
>;

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
  from_person_name?: string | null;
  from_person_slug?: string | null;
  to_person_id: string;
  to_person_name?: string | null;
  to_person_slug?: string | null;
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

export type PlanningKind =
  | "evening_plan"
  | "morning_triage"
  | "midday_replan"
  | "follow_through_nudge";
export type PlanningStatus = "draft" | "sent" | "reviewed" | "dismissed" | "applied";
export type PlanningAction =
  | "keep_today"
  | "move_tomorrow"
  | "defer"
  | "mark_done"
  | "archive"
  | "clarify"
  | "convert_inbox_to_task"
  | "none";

export interface PlanningRecommendation {
  id: string;
  type: "task" | "inbox_item";
  task_id?: string;
  inbox_item_id?: string;
  title: string;
  bucket: string;
  rank: number;
  suggested_action: PlanningAction;
  reason: string;
  proposed_changes: Record<string, string | null>;
  status: "pending" | "applied" | "dismissed";
  due?: string | null;
  scheduled?: string | null;
}

export interface PlanningMessageBody {
  recommendations?: PlanningRecommendation[];
  sections?: {
    committed_task_ids?: string[];
    overdue_task_ids?: string[];
    due_today_task_ids?: string[];
    due_soon_task_ids?: string[];
    stale_or_unclear_task_ids?: string[];
    inbox_item_ids?: string[];
  };
}

export interface PlanningMessage {
  id: string;
  kind: PlanningKind;
  status: PlanningStatus;
  title: string;
  summary: string;
  body: PlanningMessageBody;
  related_task_ids: string[];
  related_inbox_item_ids: string[];
  target_date: string;
  app_link: string;
  sent_channels: string[];
  agent_run_id: string | null;
  sent_at: string | null;
  reviewed_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface PlanningMessageCreate {
  kind: PlanningKind;
  status?: PlanningStatus;
  title: string;
  summary: string;
  body?: PlanningMessageBody;
  related_task_ids?: string[];
  related_inbox_item_ids?: string[];
  target_date: string;
  app_link?: string | null;
  sent_channels?: string[];
  agent_run_id?: string | null;
}

export interface PlanningMessageGenerate {
  kind: PlanningKind;
  target_date?: string | null;
  deliver_telegram?: boolean;
}

export interface PlanningApplyItem {
  recommendation_id: string;
  action?: PlanningAction;
  changes?: Record<string, string | null>;
}

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
  slug?: string | null;
}

export interface EntityLink {
  id: string;
  from_type: string;
  from_id: string;
  from_name?: string | null;
  from_slug?: string | null;
  to_type: string;
  to_id: string;
  to_name?: string | null;
  to_slug?: string | null;
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
