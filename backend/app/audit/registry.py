from app.models.company import Company
from app.models.context import Context
from app.models.entity_link import EntityLink
from app.models.entity_tag import EntityTag
from app.models.knowledge import Knowledge
from app.models.observation import Observation
from app.models.person import Person
from app.models.project import Project
from app.models.relationship import Relationship
from app.models.tag import Tag
from app.models.task import Task
from app.models.task_link import TaskLink

# Maps audit_log.entity_type -> the SQLAlchemy model, for generic revert.
# Extend this as new entities are added.
ENTITY_MODELS: dict[str, type] = {
    "context": Context,
    "project": Project,
    "company": Company,
    "knowledge": Knowledge,
    "person": Person,
    "task": Task,
    "relationship": Relationship,
    "observation": Observation,
    "tag": Tag,
    "entity_tag": EntityTag,
    "entity_link": EntityLink,
    "task_link": TaskLink,
}
