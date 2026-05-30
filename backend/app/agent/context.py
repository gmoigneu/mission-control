import uuid
from contextvars import ContextVar

agent_run_id_var: ContextVar[uuid.UUID | None] = ContextVar("agent_run_id", default=None)
surface_var: ContextVar[str] = ContextVar("surface", default="chat")
