import uuid
from datetime import date as _date
from datetime import datetime
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field

HabitCadence = Literal["daily", "weekly"]
HabitTrackingType = Literal["boolean", "score"]


class HabitCreate(BaseModel):
    slug: str
    name: str
    cadence: HabitCadence = "daily"
    tracking_type: HabitTrackingType = "boolean"
    active: bool = True


class HabitUpdate(BaseModel):
    slug: str | None = None
    name: str | None = None
    cadence: HabitCadence | None = None
    tracking_type: HabitTrackingType | None = None
    active: bool | None = None


class HabitOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    slug: str
    name: str
    cadence: str
    tracking_type: str
    active: bool
    streak: int = 0
    logged_today: bool = False
    created_at: datetime
    updated_at: datetime


class HabitLogCreate(BaseModel):
    date: _date
    done: bool = True
    score: int | None = Field(default=None, ge=0, le=5)


class HabitLogOut(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: uuid.UUID
    habit_id: uuid.UUID
    date: _date
    done: bool
    score: int | None
    created_at: datetime
    updated_at: datetime
