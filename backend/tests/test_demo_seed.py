from sqlalchemy import func, select

from app.demo_seed import seed_demo
from app.models.habit import Habit, HabitLog
from app.models.journal_entry import JournalEntry
from app.models.person import Person
from app.models.task import Task


async def test_seed_demo_populates_entities(db):
    # reset=False keeps the additive path so the shared test transaction (which
    # rolls back) isn't disturbed by a TRUNCATE.
    counts = await seed_demo(db, email="demo@example.test", password="pw123456", reset=False)

    assert counts["people"] == 14
    assert counts["tasks"] == 16
    assert counts["companies"] == 6
    assert counts["habits"] == 6
    assert counts["daily_checkins"] == 183
    assert counts["habit_logs"] == 1098

    maya = (await db.execute(select(Person).where(Person.slug == "maya-chen"))).scalar_one()
    assert maya.name == "Maya Chen"
    assert maya.company_id is not None
    assert maya.primary_context_id is not None

    open_tasks = (
        await db.execute(select(func.count()).select_from(Task).where(Task.status == "open"))
    ).scalar()
    assert open_tasks and open_tasks > 0

    seeded_habits = (await db.execute(select(func.count()).select_from(Habit))).scalar()
    seeded_logs = (await db.execute(select(func.count()).select_from(HabitLog))).scalar()
    seeded_checkins = (await db.execute(select(func.count()).select_from(JournalEntry))).scalar()
    assert seeded_habits == 6
    assert seeded_logs == 1098
    assert seeded_checkins == 183
