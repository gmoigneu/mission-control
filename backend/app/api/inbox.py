import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.pagination import Page, page_params, set_pagination_headers
from app.db import get_db
from app.deps import get_current_user
from app.schemas.capture import CaptureApplyResponse, InboxPromotionRequest
from app.schemas.inbox_item import InboxItemCreate, InboxItemOut, InboxItemUpdate
from app.services import capture as capture_svc
from app.services import inbox_item as svc

router = APIRouter(
    prefix="/inbox", tags=["inbox"], dependencies=[Depends(get_current_user)]
)


@router.get("", response_model=list[InboxItemOut])
async def list_inbox_items(  # noqa: B008
    response: Response,
    status: str | None = None,
    page: Page = Depends(page_params),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    total = await svc.count_inbox_items(db, status=status)
    set_pagination_headers(response, total=total, page=page)
    return await svc.list_inbox_items(
        db, status=status, limit=page.limit, offset=page.offset
    )


@router.post("", response_model=InboxItemOut, status_code=status.HTTP_201_CREATED)
async def create_inbox_item(
    payload: InboxItemCreate, db: AsyncSession = Depends(get_db)  # noqa: B008
):
    obj = await svc.create_inbox_item(db, payload, surface="ui")
    await db.commit()
    return obj


@router.get("/{item_id}", response_model=InboxItemOut)
async def get_inbox_item(item_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.get_inbox_item(db, item_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return obj


@router.patch("/{item_id}", response_model=InboxItemOut)
async def update_inbox_item(
    item_id: uuid.UUID, payload: InboxItemUpdate, db: AsyncSession = Depends(get_db)  # noqa: B008
):
    obj = await svc.get_inbox_item(db, item_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    obj = await svc.update_inbox_item(db, obj, payload, surface="ui")
    await db.commit()
    return obj


@router.delete("/{item_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_inbox_item(item_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.get_inbox_item(db, item_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await svc.delete_inbox_item(db, obj, surface="ui")
    await db.commit()


@router.post("/{item_id}/promote", response_model=CaptureApplyResponse)
async def promote_inbox_item(
    item_id: uuid.UUID,
    payload: InboxPromotionRequest,
    db: AsyncSession = Depends(get_db),  # noqa: B008
) -> CaptureApplyResponse:
    try:
        writes, run_id = await capture_svc.promote_inbox_item(db, item_id, payload)
    except ValueError as exc:
        detail = str(exc)
        code = status.HTTP_404_NOT_FOUND if "not found" in detail else status.HTTP_422_UNPROCESSABLE_ENTITY
        raise HTTPException(status_code=code, detail=detail) from exc
    await db.commit()
    obj = await svc.get_inbox_item(db, item_id)
    capture = await capture_svc.get_capture(db, obj.capture_id) if obj and obj.capture_id else None
    return CaptureApplyResponse(
        agent_run_id=run_id,
        reply="Inbox item promoted.",
        writes=writes,
        capture=capture,  # type: ignore[arg-type]
    )
