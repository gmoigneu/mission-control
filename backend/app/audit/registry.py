from app.models.company import Company
from app.models.context import Context
from app.models.project import Project

# Maps audit_log.entity_type -> the SQLAlchemy model, for generic revert.
# Extend this as new entities are added.
ENTITY_MODELS: dict[str, type] = {
    "context": Context,
    "project": Project,
    "company": Company,
}
