import uuid

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession

from app.db import get_db
from app.deps import get_current_user
from app.schemas.knowledge import KnowledgeCreate, KnowledgeOut, KnowledgeUpdate
from app.services import knowledge as svc

router = APIRouter(
    prefix="/knowledge", tags=["knowledge"], dependencies=[Depends(get_current_user)]
)


@router.get("", response_model=list[KnowledgeOut])
async def list_knowledge(db: AsyncSession = Depends(get_db)):  # noqa: B008
    return await svc.list_knowledge(db)


@router.post("", response_model=KnowledgeOut, status_code=status.HTTP_201_CREATED)
async def create_knowledge(payload: KnowledgeCreate, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.create_knowledge(db, payload, surface="ui")
    await db.commit()
    return obj


@router.get("/{knowledge_id}", response_model=KnowledgeOut)
async def get_knowledge(knowledge_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.get_knowledge(db, knowledge_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    return obj


@router.patch("/{knowledge_id}", response_model=KnowledgeOut)
async def update_knowledge(
    knowledge_id: uuid.UUID, payload: KnowledgeUpdate, db: AsyncSession = Depends(get_db)  # noqa: B008
):
    obj = await svc.get_knowledge(db, knowledge_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    obj = await svc.update_knowledge(db, obj, payload, surface="ui")
    await db.commit()
    return obj


@router.delete("/{knowledge_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_knowledge(knowledge_id: uuid.UUID, db: AsyncSession = Depends(get_db)):  # noqa: B008
    obj = await svc.get_knowledge(db, knowledge_id)
    if obj is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Not found")
    await svc.delete_knowledge(db, obj, surface="ui")
    await db.commit()
