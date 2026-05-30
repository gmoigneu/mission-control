import uuid

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.pagination import Page, page_params, set_pagination_headers
from app.db import get_db
from app.deps import get_current_user
from app.schemas.company import CompanyCreate, CompanyOut, CompanyUpdate
from app.services import company as svc

router = APIRouter(
    prefix="/companies", tags=["companies"], dependencies=[Depends(get_current_user)]
)


@router.get("", response_model=list[CompanyOut])
async def list_companies(
    response: Response,
    page: Page = Depends(page_params),  # noqa: B008
    db: AsyncSession = Depends(get_db),  # noqa: B008
):
    total = await svc.count_companies(db)
    set_pagination_headers(response, total=total, page=page)
    return await svc.list_companies(db, limit=page.limit, offset=page.offset)


@router.post("", response_model=CompanyOut, status_code=status.HTTP_201_CREATED)
async def create_company(payload: CompanyCreate, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.create_company(db, payload, surface="ui")
    await db.commit()
    return obj


@router.get("/{company_id}", response_model=CompanyOut)
async def get_company(company_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.get_company(db, company_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return obj


@router.patch("/{company_id}", response_model=CompanyOut)
async def update_company(
    company_id: uuid.UUID, payload: CompanyUpdate, db: AsyncSession = Depends(get_db)  # noqa: B008
):
    obj = await svc.get_company(db, company_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    obj = await svc.update_company(db, obj, payload, surface="ui")
    await db.commit()
    return obj


@router.delete("/{company_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_company(company_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.get_company(db, company_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await svc.delete_company(db, obj, surface="ui")
    await db.commit()
