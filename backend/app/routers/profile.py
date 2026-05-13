import os
import uuid
from datetime import datetime, timezone
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from ..database import get_db
from ..models import User, Content
from ..schemas import UserOut, NicknameUpdateRequest, AvatarUpdateResponse
from ..utils import build_imgproxy_url

router = APIRouter(prefix="/profile", tags=["프로필 (Profile)"])

CONTENTS_BASE_PATH = Path(os.getenv("CONTENTS_BASE_PATH", "/data"))

ALLOWED_MIME_TYPES = {
    "image/jpeg", "image/png", "image/gif", "image/webp",
}


async def _get_user_or_404(user_id: uuid.UUID, db: AsyncSession) -> User:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.post("/avatar", response_model=AvatarUpdateResponse,
             summary="프로필 사진 업로드", response_description="업데이트된 유저 정보 및 content_id")
async def upload_avatar(
    file: UploadFile = File(...),
    user_id: str = Form(...),
    db: AsyncSession = Depends(get_db),
):
    parsed_user_id = uuid.UUID(user_id)
    user = await _get_user_or_404(parsed_user_id, db)

    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=415, detail=f"Unsupported media type: {file.content_type}")

    ext = Path(file.filename or "file").suffix.lower() or ".jpg"
    filename = f"{uuid.uuid4()}{ext}"
    now = datetime.now(timezone.utc)
    rel_dir = Path("user-contents") / str(now.year) / f"{now.month:02d}"
    abs_dir = CONTENTS_BASE_PATH / rel_dir
    abs_dir.mkdir(parents=True, exist_ok=True)

    data = await file.read()
    (abs_dir / filename).write_bytes(data)
    file_path = f"{rel_dir}/{filename}"
    imgproxy_url = build_imgproxy_url(file_path)

    content = Content(
        owner_type="user",
        owner_id=parsed_user_id,
        file_path=file_path,
        mime_type=file.content_type,
        original_filename=file.filename,
        file_size=len(data),
    )
    db.add(content)
    await db.flush()  # content.id 확정

    user.avatar_content_id = content.id
    user.avatar_url = imgproxy_url
    await db.commit()
    await db.refresh(user)

    return AvatarUpdateResponse(
        user=UserOut.model_validate(user),
        content_id=content.id,
    )


@router.put("/nickname", response_model=UserOut,
            summary="닉네임 변경", response_description="업데이트된 유저 정보")
async def update_nickname(body: NicknameUpdateRequest, db: AsyncSession = Depends(get_db)):
    user = await _get_user_or_404(body.user_id, db)

    nickname = body.nickname.strip()
    if not nickname:
        raise HTTPException(status_code=400, detail="Nickname cannot be empty")
    if len(nickname) > 30:
        raise HTTPException(status_code=400, detail="Nickname too long (max 30)")

    # 중복 확인 (자기 자신 제외)
    result = await db.execute(
        select(User).where(User.nickname == nickname, User.id != body.user_id)
    )
    if result.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Nickname already taken")

    user.nickname = nickname
    await db.commit()
    await db.refresh(user)

    return UserOut.model_validate(user)
