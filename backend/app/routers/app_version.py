from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func, select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import AppConfig, AppVersion
from ..schemas import AppVersionChild, AppVersionCurrentOut, AppVersionOut, Page

router = APIRouter(prefix="/app-version", tags=["앱 버전 (App Version)"])

# ── Public app-config endpoint ────────────────────────────────────────────────
config_router = APIRouter(prefix="/app-config", tags=["앱 설정 (App Config)"])


@config_router.get("", summary="프론트엔드용 앱 설정값 조회")
async def get_app_config(db: AsyncSession = Depends(get_db)) -> dict:
    """프론트엔드가 읽어야 하는 app_config 값을 반환."""
    rows = (await db.execute(select(AppConfig))).scalars().all()
    cfg = {f"{r.group_name}.{r.key}": r.value for r in rows}
    return {
        "dm_poll_interval": int(cfg.get("dm.unread_poll_interval", "30")),
        "google_client_id": cfg.get("oauth.google_client_id_web", ""),
    }


@router.get("/current", response_model=AppVersionCurrentOut)
async def get_current_version(db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AppVersion).where(AppVersion.is_active == True).order_by(AppVersion.id))
    rows = result.scalars().all()

    out = AppVersionCurrentOut()
    for v in rows:
        child = AppVersionChild.model_validate(v)
        if v.platform == "primary":
            out.primary = child
        elif v.platform == "ios":
            out.ios = child
        elif v.platform == "android":
            out.android = child
    return out


@router.get("/releases", response_model=Page[AppVersionOut])
async def list_releases(
    page: int = 1,
    size: int = 20,
    db: AsyncSession = Depends(get_db),
):
    base = select(func.count()).select_from(AppVersion).where(AppVersion.platform == "primary")
    total = (await db.execute(base)).scalar_one()

    result = await db.execute(
        select(AppVersion)
        .where(AppVersion.platform == "primary")
        .order_by(AppVersion.released_at.desc().nullslast(), AppVersion.id.desc())
        .offset((page - 1) * size)
        .limit(size)
    )
    primaries = result.scalars().all()

    items = []
    for pv in primaries:
        children_result = await db.execute(select(AppVersion).where(AppVersion.parent_id == pv.id))
        children = [AppVersionChild.model_validate(c) for c in children_result.scalars().all()]
        out = AppVersionOut.model_validate(pv)
        out.children = children
        items.append(out)

    return Page(items=items, total=total, page=page, size=size)


@router.get("/{version_id}", response_model=AppVersionOut)
async def get_version(version_id: int, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(AppVersion).where(AppVersion.id == version_id))
    v = result.scalar_one_or_none()
    if not v:
        raise HTTPException(404, "Version not found")

    children_result = await db.execute(select(AppVersion).where(AppVersion.parent_id == v.id))
    children = [AppVersionChild.model_validate(c) for c in children_result.scalars().all()]
    out = AppVersionOut.model_validate(v)
    out.children = children
    return out
