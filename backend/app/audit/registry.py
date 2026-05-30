from app.models.context import Context

# Maps audit_log.entity_type -> the SQLAlchemy model, for generic revert.
# Extend this as new entities are added.
ENTITY_MODELS: dict[str, type] = {
    "context": Context,
}
