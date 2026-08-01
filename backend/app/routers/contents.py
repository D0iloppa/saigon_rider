import asyncio
import os
import random
import uuid
from datetime import UTC, datetime
from pathlib import Path

from fastapi import APIRouter, Cookie, Depends, File, Form, HTTPException, Query, UploadFile, status
from fastapi.responses import RedirectResponse
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..admin_auth import decode_token
from ..database import get_db
from ..deps import optional_user_session, verify_user_session
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

# 업로드 단건 상한 — nginx client_max_body_size(25m)보다 약간 낮게, 전체 메모리 적재 방어
MAX_UPLOAD_BYTES = 15 * 1024 * 1024

ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
}


def _sniff_mime(data: bytes) -> str | None:
    """실제 바이트 매직넘버로 이미지 포맷을 판별 (declared content_type 신뢰 금지)."""
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"GIF8":
        return "image/gif"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    return None


def _resolve_save_path(owner_type: str) -> tuple[Path, str]:
    """Returns (absolute_path_on_disk, file_path_relative_to_contents_root)."""
    if owner_type == "user":
        now = datetime.now(UTC)
        rel = Path("user-contents") / str(now.year) / f"{now.month:02d}"
    else:
        rel = Path("system")

    return CONTENTS_BASE_PATH / rel, str(rel)


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
    owner_id: str | None = Form(None),  # 하위호환용으로 수신만 하고 무시 — 세션 uid 로 강제
    is_private: bool = Form(False),  # F-06 잔여: 검증 문서(사업자등록증·간판) 업로드 시 true
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    # 앱 경로는 'user' 업로드만 — 'system'은 관리자 콘솔/배치 절차 전용 (클라이언트 지정 금지)
    if owner_type != "user":
        raise HTTPException(status_code=403, detail="owner_type must be 'user'")

    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=415, detail=f"Unsupported media type: {file.content_type}")

    ext = Path(file.filename or "file").suffix.lower() or ".bin"
    content_id = uuid.uuid4()
    filename = f"{content_id}{ext}"

    abs_dir, rel_dir = _resolve_save_path(owner_type)
    abs_path = abs_dir / filename
    file_path = f"{rel_dir}/{filename}"

    await asyncio.to_thread(abs_dir.mkdir, parents=True, exist_ok=True)

    data = await file.read(MAX_UPLOAD_BYTES + 1)
    if len(data) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail=f"File too large (max {MAX_UPLOAD_BYTES // (1024 * 1024)}MB)")
    if _sniff_mime(data) != file.content_type:
        raise HTTPException(status_code=400, detail="File content does not match declared content type")
    await asyncio.to_thread(abs_path.write_bytes, data)

    # owner_id 는 클라이언트 값을 신뢰하지 않고 세션 유저로 강제
    parsed_owner_id = _session_uid

    content = Content(
        id=content_id,
        owner_type=owner_type,
        owner_id=parsed_owner_id,
        file_path=file_path,
        mime_type=file.content_type,
        original_filename=file.filename,
        file_size=len(data),
        is_private=is_private,
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
    "/{content_id}",
    response_model=ContentOut,
    summary="컨텐츠 조회",
    response_description="컨텐츠 메타데이터 및 imgproxy URL",
)
async def get_content(
    content_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
    session_uid: uuid.UUID | None = Depends(optional_user_session),
    admin_session: str | None = Cookie(default=None),
):
    result = await db.execute(select(Content).where(Content.id == content_id))
    content = result.scalar_one_or_none()

    if content is None:
        raise HTTPException(status_code=404, detail="Content not found")

    if content.is_private:
        is_owner = session_uid is not None and content.owner_id == session_uid
        is_admin = admin_session is not None and decode_token(admin_session) is not None
        if not is_owner and not is_admin:
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
