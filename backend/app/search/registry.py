from __future__ import annotations

from collections.abc import Iterable
from dataclasses import dataclass
from typing import Any

from app.models.company import Company
from app.models.context import Context
from app.models.habit import Habit
from app.models.inbox_item import InboxItem
from app.models.journal_entry import JournalEntry
from app.models.knowledge import Knowledge
from app.models.meeting import Meeting
from app.models.observation import Observation
from app.models.person import Person
from app.models.project import Project
from app.models.review import Review
from app.models.tag import Tag
from app.models.task import Task
from app.models.telos import Telos
from app.models.tone import Tone


@dataclass(frozen=True)
class SearchableSpec:
    subject_type: str
    model: type[Any]
    display_attr: str
    slug_attr: str | None = None


_SPECS: tuple[SearchableSpec, ...] = (
    SearchableSpec("context", Context, "name", "slug"),
    SearchableSpec("project", Project, "title", "slug"),
    SearchableSpec("company", Company, "name", "slug"),
    SearchableSpec("person", Person, "name", "slug"),
    SearchableSpec("task", Task, "title"),
    SearchableSpec("observation", Observation, "body"),
    SearchableSpec("tag", Tag, "name"),
    SearchableSpec("journal_entry", JournalEntry, "title"),
    SearchableSpec("review", Review, "title"),
    SearchableSpec("habit", Habit, "name", "slug"),
    SearchableSpec("meeting", Meeting, "title", "slug"),
    SearchableSpec("knowledge", Knowledge, "title", "slug"),
    SearchableSpec("inbox_item", InboxItem, "body"),
    SearchableSpec("telos", Telos, "title"),
    SearchableSpec("tone", Tone, "name", "slug"),
)

SEARCHABLE_SPECS: dict[str, SearchableSpec] = {spec.subject_type: spec for spec in _SPECS}
SEARCHABLE_TYPES = frozenset(SEARCHABLE_SPECS)


def iter_searchable_specs() -> Iterable[SearchableSpec]:
    return _SPECS
