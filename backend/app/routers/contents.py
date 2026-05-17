import os
import random
import uuid
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..models import Content
from ..schemas import ContentOut
from ..utils import build_imgproxy_url

router = APIRouter(prefix="/contents", tags=["컨텐츠 (Contents)"])


def _is_uuid(val: str) -> bool:
    try:
        uuid.UUID(val)
        return True
    except ValueError:
        return False


CONTENTS_BASE_PATH = Path(os.getenv("CONTENTS_BASE_PATH", "/data"))

ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
    "image/svg+xml",
}


def _resolve_save_path(owner_type: str) -> tuple[Path, str]:
    """Returns (absolute_path_on_disk, file_path_relative_to_contents_root)."""
    if owner_type == "user":
        now = datetime.now(UTC)
        rel = Path("user-contents") / str(now.year) / f"{now.month:02d}"
    else:
        rel = Path("system")

    abs_dir = CONTENTS_BASE_PATH / rel
    abs_dir.mkdir(parents=True, exist_ok=True)
    return abs_dir, str(rel)


@router.post(
    "/upload",
    response_model=ContentOut,
    status_code=status.HTTP_201_CREATED,
    summary="이미지 업로드",
    response_description="등록된 컨텐츠 정보 및 imgproxy URL",
)
async def upload_content(
    file: UploadFile = File(...),
    owner_type: str = Form(...),
    owner_id: str | None = Form(None),
    db: AsyncSession = Depends(get_db),
):
    if owner_type not in ("system", "user"):
        raise HTTPException(status_code=400, detail="owner_type must be 'system' or 'user'")

    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=415, detail=f"Unsupported media type: {file.content_type}")

    ext = Path(file.filename or "file").suffix.lower() or ".bin"
    content_id = uuid.uuid4()
    filename = f"{content_id}{ext}"

    abs_dir, rel_dir = _resolve_save_path(owner_type)
    abs_path = abs_dir / filename
    file_path = f"{rel_dir}/{filename}"

    data = await file.read()
    abs_path.write_bytes(data)

    parsed_owner_id = uuid.UUID(owner_id) if owner_id else None

    content = Content(
        id=content_id,
        owner_type=owner_type,
        owner_id=parsed_owner_id,
        file_path=file_path,
        mime_type=file.content_type,
        original_filename=file.filename,
        file_size=len(data),
    )
    db.add(content)
    await db.commit()
    await db.refresh(content)

    return ContentOut(
        id=content.id,
        owner_type=content.owner_type,
        owner_id=content.owner_id,
        file_path=content.file_path,
        mime_type=content.mime_type,
        original_filename=content.original_filename,
        file_size=content.file_size,
        imgproxy_url=build_imgproxy_url(content.file_path),
        created_at=content.created_at,
    )


async def _serve_pool_image(
    db: AsyncSession,
    owner_type: str,
    w: int,
    h: int,
    seed: str | None,
) -> RedirectResponse:
    """owner_type 풀에서 이미지 1장을 골라 imgproxy 302 redirect 로 서빙.

    seed 가 있으면 풀 크기로 모듈러 인덱싱 → 결정론적 선택, 없으면 랜덤.
    """
    result = await db.execute(select(Content).where(Content.owner_type == owner_type).order_by(Content.created_at))
    pool = result.scalars().all()
    if not pool:
        raise HTTPException(status_code=404, detail=f"No '{owner_type}' images registered")

    if seed:
        idx = int(uuid.UUID(seed).int % len(pool)) if _is_uuid(seed) else (hash(seed) % len(pool))
        content = pool[idx]
    else:
        content = random.choice(pool)

    url = build_imgproxy_url(content.file_path, options=f"rs:fill:{w}:{h}:1")
    return RedirectResponse(url=url, status_code=302, headers={"Cache-Control": "no-store"})


@router.get(
    "/mock-img",
    summary="Mock 이미지 서빙",
    response_description="owner_type='mock' 중 seed 기반 결정론적 선택 → imgproxy 302 redirect",
)
async def serve_mock_image(
    w: int = Query(default=800, ge=1, le=4096),
    h: int = Query(default=450, ge=1, le=4096),
    seed: str | None = Query(default=None, description="결정론적 선택용 시드 (quest_id 등)"),
    db: AsyncSession = Depends(get_db),
):
    return await _serve_pool_image(db, "mock", w, h, seed)


@router.get(
    "/profile-mock-img",
    summary="기본 프로필(아바타) 이미지 서빙",
    response_description="owner_type='profile_mock' 중 seed(user_id) 기반 결정론적 선택 → imgproxy 302 redirect",
)
async def serve_profile_mock_image(
    w: int = Query(default=240, ge=1, le=4096),
    h: int = Query(default=240, ge=1, le=4096),
    seed: str | None = Query(default=None, description="결정론적 선택용 시드 (user_id 등)"),
    db: AsyncSession = Depends(get_db),
):
    return await _serve_pool_image(db, "profile_mock", w, h, seed)


@router.get(
    "/{content_id}/img",
    summary="이미지 서빙 (content_id → imgproxy redirect)",
    response_description="imgproxy URL로 302 리다이렉트",
)
async def serve_content_image(
    content_id: uuid.UUID,
    w: int = Query(default=800, ge=1, le=4096),
    h: int = Query(default=450, ge=1, le=4096),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(select(Content).where(Content.id == content_id))
    content = result.scalar_one_or_none()
    if content is None:
        raise HTTPException(status_code=404, detail="Content not found")
    url = build_imgproxy_url(content.file_path, options=f"rs:fill:{w}:{h}:1")
    return RedirectResponse(url=url, status_code=302)


@router.get(
    "/{content_id}",
    response_model=ContentOut,
    summary="컨텐츠 조회",
    response_description="컨텐츠 메타데이터 및 imgproxy URL",
)
async def get_content(content_id: uuid.UUID, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(Content).where(Content.id == content_id))
    content = result.scalar_one_or_none()

    if content is None:
        raise HTTPException(status_code=404, detail="Content not found")

    return ContentOut(
        id=content.id,
        owner_type=content.owner_type,
        owner_id=content.owner_id,
        file_path=content.file_path,
        mime_type=content.mime_type,
        original_filename=content.original_filename,
        file_size=content.file_size,
        imgproxy_url=build_imgproxy_url(content.file_path),
        created_at=content.created_at,
    )
