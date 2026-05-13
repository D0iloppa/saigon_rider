import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import get_db
from ..models import Content
from ..schemas import ContentOut
from ..utils import build_imgproxy_url

router = APIRouter(prefix="/contents", tags=["컨텐츠 (Contents)"])

CONTENTS_BASE_PATH = Path(os.getenv("CONTENTS_BASE_PATH", "/data"))

ALLOWED_MIME_TYPES = {
    "image/jpeg", "image/png", "image/gif", "image/webp", "image/svg+xml",
}


def _resolve_save_path(owner_type: str) -> tuple[Path, str]:
    """Returns (absolute_path_on_disk, file_path_relative_to_contents_root)."""
    if owner_type == "user":
        now = datetime.now(timezone.utc)
        rel = Path("user-contents") / str(now.year) / f"{now.month:02d}"
    else:
        rel = Path("system")

    abs_dir = CONTENTS_BASE_PATH / rel
    abs_dir.mkdir(parents=True, exist_ok=True)
    return abs_dir, str(rel)


@router.post("/upload", response_model=ContentOut, status_code=status.HTTP_201_CREATED,
             summary="이미지 업로드", response_description="등록된 컨텐츠 정보 및 imgproxy URL")
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
    filename = f"{uuid.uuid4()}{ext}"

    abs_dir, rel_dir = _resolve_save_path(owner_type)
    abs_path = abs_dir / filename
    file_path = f"{rel_dir}/{filename}"

    data = await file.read()
    abs_path.write_bytes(data)

    parsed_owner_id = uuid.UUID(owner_id) if owner_id else None

    content = Content(
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


@router.get("/{content_id}", response_model=ContentOut,
            summary="컨텐츠 조회", response_description="컨텐츠 메타데이터 및 imgproxy URL")
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
