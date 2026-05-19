from fastapi import APIRouter, Depends, Response

from app.database import AsyncSession
from app.deps import get_session, verify_service_key
from app.enums import ItemSlotEnum
from app.schemas import CollectionProgressRead, EquipRequest, UserEquipmentRead, UserItemRead
from app.services import inventory as inv_svc

router = APIRouter(prefix="/v1/inventory", tags=["inventory"])


@router.get("/{user_uuid}/items", response_model=list[UserItemRead],
            dependencies=[Depends(verify_service_key)])
async def get_items(
    user_uuid: str,
    db: AsyncSession = Depends(get_session),
) -> list:
    return await inv_svc.get_items(db, user_uuid)


@router.get("/{user_uuid}/equipment", response_model=list[UserEquipmentRead],
            dependencies=[Depends(verify_service_key)])
async def get_equipment(
    user_uuid: str,
    db: AsyncSession = Depends(get_session),
) -> list:
    return await inv_svc.get_equipment(db, user_uuid)


@router.put("/{user_uuid}/equip", response_model=UserEquipmentRead,
            dependencies=[Depends(verify_service_key)])
async def equip_item(
    user_uuid: str,
    data: EquipRequest,
    db: AsyncSession = Depends(get_session),
) -> UserEquipmentRead:
    return await inv_svc.equip_item(db, user_uuid, data.item_code)


@router.get("/{user_uuid}/collection-progress", response_model=list[CollectionProgressRead],
            dependencies=[Depends(verify_service_key)])
async def get_collection_progress(
    user_uuid: str,
    db: AsyncSession = Depends(get_session),
) -> list:
    return await inv_svc.get_collection_progress(db, user_uuid)


@router.delete("/{user_uuid}/equip/{slot}", status_code=204,
               dependencies=[Depends(verify_service_key)])
async def unequip_slot(
    user_uuid: str,
    slot: ItemSlotEnum,
    db: AsyncSession = Depends(get_session),
) -> Response:
    await inv_svc.unequip_slot(db, user_uuid, slot)
    return Response(status_code=204)
