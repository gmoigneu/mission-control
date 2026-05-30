import uuid
from datetime import date as _date

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.schemas.journal import (
    JournalEntryCreate,
    JournalEntryOut,
    JournalEntryUpdate,
    JournalLogCreate,
    JournalLogOut,
)
from app.services import journal as svc

router = APIRouter(prefix="/journal", tags=["journal"], dependencies=[Depends(get_current_user)])


@router.get("", response_model=list[JournalEntryOut])
async def list_journal_entries(db: AsyncSession = Depends(get_db)):  # noqa: B008
    return await svc.list_journal_entries(db)


@router.post("", response_model=JournalEntryOut, status_code=status.HTTP_201_CREATED)
async def create_journal_entry(
    payload: JournalEntryCreate, db: AsyncSession = Depends(get_db)  # noqa: B008
):
    try:
        obj = await svc.create_journal_entry(db, payload, surface="ui")
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_409_CONFLICT, detail=str(exc)) from exc
    await db.commit()
    return obj


@router.get("/by-date/{day}", response_model=JournalEntryOut)
async def get_journal_entry_by_date(day: _date, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.get_journal_entry_by_date(db, day)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return obj


@router.get("/{entry_id}", response_model=JournalEntryOut)
async def get_journal_entry(
    entry_id: uuid.UUID, db: AsyncSession = Depends(get_db)  # noqa: B008
):
    obj = await svc.get_journal_entry(db, entry_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return obj


@router.patch("/{entry_id}", response_model=JournalEntryOut)
async def update_journal_entry(
    entry_id: uuid.UUID,
    payload: JournalEntryUpdate,
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    obj = await svc.get_journal_entry(db, entry_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    obj = await svc.update_journal_entry(db, obj, payload, surface="ui")
    await db.commit()
    return obj


@router.delete("/{entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_journal_entry(
    entry_id: uuid.UUID, db: AsyncSession = Depends(get_db)  # noqa: B008
):
    obj = await svc.get_journal_entry(db, entry_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await svc.delete_journal_entry(db, obj, surface="ui")
    await db.commit()


@router.get("/{entry_id}/logs", response_model=list[JournalLogOut])
async def list_journal_logs(
    entry_id: uuid.UUID, db: AsyncSession = Depends(get_db)  # noqa: B008
):
    obj = await svc.get_journal_entry(db, entry_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return await svc.list_journal_logs(db, entry_id)


@router.post(
    "/{entry_id}/logs", response_model=JournalLogOut, status_code=status.HTTP_201_CREATED
)
async def add_journal_log(
    entry_id: uuid.UUID,
    payload: JournalLogCreate,
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    entry = await svc.get_journal_entry(db, entry_id)
    if entry is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    obj = await svc.add_journal_log(db, entry, payload, surface="ui")
    await db.commit()
    return obj


@router.delete("/logs/{log_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_journal_log(
    log_id: uuid.UUID, db: AsyncSession = Depends(get_db)  # noqa: B008
):
    obj = await svc.get_journal_log(db, log_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await svc.delete_journal_log(db, obj, surface="ui")
    await db.commit()
