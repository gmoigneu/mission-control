from app.models.company import Company
from app.models.context import Context
from app.models.person import Person
from app.models.project import Project
from app.models.relationship import Relationship
from app.models.task import Task

# Maps audit_log.entity_type -> the SQLAlchemy model, for generic revert.
# Extend this as new entities are added.
ENTITY_MODELS: dict[str, type] = {
    "context": Context,
    "project": Project,
    "company": Company,
    "person": Person,
    "task": Task,
    "relationship": Relationship,
}
