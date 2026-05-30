import uuid
from datetime import date as _date
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict

HabitCadence = Literal["daily", "weekly"]


class HabitCreate(BaseModel):
    slug: str
    name: str
    cadence: HabitCadence = "daily"
    active: bool = True


class HabitUpdate(BaseModel):
    slug: str | None = None
    name: str | None = None
    cadence: HabitCadence | None = None
    active: bool | None = None


class HabitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    name: str
    cadence: str
    active: bool
    streak: int = 0
    logged_today: bool = False
    created_at: datetime
    updated_at: datetime


class HabitLogCreate(BaseModel):
    date: _date
    done: bool = True


class HabitLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    habit_id: uuid.UUID
    date: _date
    done: bool
    created_at: datetime
    updated_at: datetime
