from app.models.agent_persona import AgentPersona
from app.models.company import Company
from app.models.capture import Capture
from app.models.context import Context
from app.models.entity_link import EntityLink
from app.models.entity_tag import EntityTag
from app.models.habit import Habit, HabitLog
from app.models.inbox_item import InboxItem
from app.models.journal_entry import JournalEntry
from app.models.knowledge import Knowledge
from app.models.meeting import Meeting
from app.models.observation import Observation
from app.models.person import Person
from app.models.project import Project
from app.models.relationship import Relationship
from app.models.review import Review
from app.models.tag import Tag
from app.models.task import Task
from app.models.task_link import TaskLink
from app.models.telos import Telos
from app.models.tone import Tone

# Maps audit_log.entity_type -> the SQLAlchemy model, for generic revert.
# Extend this as new entities are added.
ENTITY_MODELS: dict[str, type] = {
    "context": Context,
    "project": Project,
    "company": Company,
    "capture": Capture,
    "knowledge": Knowledge,
    "person": Person,
    "meeting": Meeting,
    "task": Task,
    "relationship": Relationship,
    "observation": Observation,
    "review": Review,
    "inbox_item": InboxItem,
    "tag": Tag,
    "entity_tag": EntityTag,
    "entity_link": EntityLink,
    "task_link": TaskLink,
    "journal_entry": JournalEntry,
    "habit": Habit,
    "habit_log": HabitLog,
    "telos": Telos,
    "tone": Tone,
    "agent_persona": AgentPersona,
}
