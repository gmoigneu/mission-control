import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.pagination import Page, page_params, set_pagination_headers
from app.db import get_db
from app.deps import get_current_user
from app.schemas.journal_entry import (
    JournalEntryCreate,
    JournalEntryOut,
    JournalEntryUpdate,
)
from app.services import journal_entry as svc

router = APIRouter(
    prefix="/journal-entries",
    tags=["journal-entries"],
    dependencies=[Depends(get_current_user)],
)


@router.get("", response_model=list[JournalEntryOut])
async def list_journal_entries(
    response: Response,
    page: Page = Depends(page_params),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    total = await svc.count_journal_entries(db)
    set_pagination_headers(response, total=total, page=page)
    return await svc.list_journal_entries(db, limit=page.limit, offset=page.offset)


@router.post("", response_model=JournalEntryOut, status_code=status.HTTP_201_CREATED)
async def create_journal_entry(
    payload: JournalEntryCreate, db: AsyncSession = Depends(get_db)  # noqa: B008
):
    obj = await svc.create_journal_entry(db, payload, surface="ui")
    await db.commit()
    return obj


@router.get("/{journal_entry_id}", response_model=JournalEntryOut)
async def get_journal_entry(
    journal_entry_id: uuid.UUID, db: AsyncSession = Depends(get_db)  # noqa: B008
):
    obj = await svc.get_journal_entry(db, journal_entry_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return obj


@router.patch("/{journal_entry_id}", response_model=JournalEntryOut)
async def update_journal_entry(
    journal_entry_id: uuid.UUID,
    payload: JournalEntryUpdate,
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    obj = await svc.get_journal_entry(db, journal_entry_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    obj = await svc.update_journal_entry(db, obj, payload, surface="ui")
    await db.commit()
    return obj


@router.delete("/{journal_entry_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_journal_entry(
    journal_entry_id: uuid.UUID, db: AsyncSession = Depends(get_db)  # noqa: B008
):
    obj = await svc.get_journal_entry(db, journal_entry_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await svc.delete_journal_entry(db, obj, surface="ui")
    await db.commit()
