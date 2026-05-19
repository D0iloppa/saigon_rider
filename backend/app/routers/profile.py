import logging
import os
import random
import uuid
from datetime import UTC, datetime
from pathlib import Path

import httpx
from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ..database import get_db
from ..deps import verify_user_session
from ..engine_client import engine_client
from ..models import Content, NicknameWord, RiderType, User
from ..schemas import (
    AvatarUpdateResponse,
    NicknameCheckResponse,
    NicknameUpdateRequest,
    ProfileSaveRequest,
    RandomNicknameResponse,
    RpBalanceResponse,
    UserOut,
)

log = logging.getLogger(__name__)
router = APIRouter(prefix="/profile", tags=["프로필 (Profile)"])

CONTENTS_BASE_PATH = Path(os.getenv("CONTENTS_BASE_PATH", "/data"))

ALLOWED_MIME_TYPES = {
    "image/jpeg",
    "image/png",
    "image/gif",
    "image/webp",
}


async def _get_user_or_404(user_id: uuid.UUID, db: AsyncSession) -> User:
    result = await db.execute(select(User).where(User.id == user_id))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=404, detail="User not found")
    return user


@router.post(
    "/avatar",
    response_model=AvatarUpdateResponse,
    summary="프로필 사진 업로드",
    response_description="업데이트된 유저 정보 및 content_id",
)
async def upload_avatar(
    file: UploadFile = File(...),
    user_id: str = Form(...),
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    parsed_user_id = uuid.UUID(user_id)
    user = await _get_user_or_404(parsed_user_id, db)

    if file.content_type not in ALLOWED_MIME_TYPES:
        raise HTTPException(status_code=415, detail=f"Unsupported media type: {file.content_type}")

    ext = Path(file.filename or "file").suffix.lower() or ".jpg"
    filename = f"{uuid.uuid4()}{ext}"
    now = datetime.now(UTC)
    rel_dir = Path("user-contents") / str(now.year) / f"{now.month:02d}"
    abs_dir = CONTENTS_BASE_PATH / rel_dir
    abs_dir.mkdir(parents=True, exist_ok=True)

    data = await file.read()
    (abs_dir / filename).write_bytes(data)
    file_path = f"{rel_dir}/{filename}"

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
    content_id = content.id

    # 프로필 사진은 contents 테이블로 중개 — content_id 만 저장 (URL 직접 저장 금지)
    user.avatar_content_id = content_id
    await db.commit()

    user = (await db.execute(select(User).where(User.id == parsed_user_id))).scalar_one()
    return AvatarUpdateResponse(
        user=UserOut.model_validate(user),
        content_id=content_id,
    )


@router.put("/nickname", response_model=UserOut, summary="닉네임 변경", response_description="업데이트된 유저 정보")
async def update_nickname(
    body: NicknameUpdateRequest,
    db: AsyncSession = Depends(get_db),
    _session_uid: uuid.UUID = Depends(verify_user_session),
):
    user = await _get_user_or_404(body.user_id, db)

    nickname = body.nickname.strip()
    if not nickname:
        raise HTTPException(status_code=400, detail="Nickname cannot be empty")
    if len(nickname) > 30:
        raise HTTPException(status_code=400, detail="Nickname too long (max 30)")

    result = await db.execute(select(User).where(User.nickname == nickname, User.id != body.user_id))
    if result.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Nickname already taken")

    user.nickname = nickname
    await db.commit()

    user = await _get_user_or_404(body.user_id, db)
    return UserOut.model_validate(user)


# A-1
@router.get("/check-nickname", response_model=NicknameCheckResponse, summary="닉네임 중복 확인")
async def check_nickname(nickname: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.nickname == nickname.strip()))
    available = result.scalar_one_or_none() is None
    return NicknameCheckResponse(available=available, nickname=nickname.strip())


# A-2
@router.put("", response_model=UserOut, summary="프로필 저장 (닉네임 + rider_type 동시 설정)")
async def save_profile(
    body: ProfileSaveRequest, db: AsyncSession = Depends(get_db), _session_uid: uuid.UUID = Depends(verify_user_session)
):
    user = await _get_user_or_404(body.user_id, db)

    nickname = body.nickname.strip()
    if not nickname:
        raise HTTPException(status_code=400, detail="Nickname cannot be empty")
    if len(nickname) > 30:
        raise HTTPException(status_code=400, detail="Nickname too long (max 30)")

    if body.rider_type:
        rt_result = await db.execute(select(RiderType).where(RiderType.code == body.rider_type))
        rt = rt_result.scalar_one_or_none()
        if rt is None:
            raise HTTPException(status_code=400, detail=f"Invalid rider_type: {body.rider_type}")
    else:
        rt_result = await db.execute(select(RiderType).order_by(RiderType.id).limit(1))
        rt = rt_result.scalar_one_or_none()
        if rt is None:
            raise HTTPException(status_code=503, detail="No rider types configured")

    dup = await db.execute(select(User).where(User.nickname == nickname, User.id != body.user_id))
    if dup.scalar_one_or_none() is not None:
        raise HTTPException(status_code=409, detail="Nickname already taken")

    user.nickname = nickname
    user.rider_type_id = rt.id
    await db.commit()
    await db.refresh(user, ["rider_type"])
    return UserOut.model_validate(user)


@router.get("/random-nickname", response_model=RandomNicknameResponse, summary="랜덤 닉네임 생성")
async def random_nickname(db: AsyncSession = Depends(get_db)):
    adj_rows = (
        (await db.execute(select(NicknameWord.word).where(NicknameWord.word_type == "adjective"))).scalars().all()
    )
    noun_rows = (await db.execute(select(NicknameWord.word).where(NicknameWord.word_type == "noun"))).scalars().all()
    if not adj_rows or not noun_rows:
        raise HTTPException(status_code=503, detail="Nickname word pool is empty")
    adj = random.choice(adj_rows)
    noun = random.choice(noun_rows)
    suffix = random.randint(100, 999)
    return RandomNicknameResponse(nickname=f"{adj} {noun} {suffix}")


@router.get("/{user_id}/rp-balance", response_model=RpBalanceResponse, summary="RP 잔액 조회")
async def get_rp_balance(user_id: uuid.UUID):
    try:
        data = await engine_client.get_balance(str(user_id))
        return RpBalanceResponse(**data)
    except httpx.HTTPStatusError as exc:
        if exc.response.status_code == 404:
            raise HTTPException(status_code=404, detail="User not found in SRE engine") from exc
        log.warning("Engine balance request failed: %s", exc)
        raise HTTPException(status_code=503, detail="SRE engine unavailable") from exc
    except httpx.RequestError as exc:
        log.warning("Engine connection error: %s", exc)
        raise HTTPException(status_code=503, detail="SRE engine unavailable") from exc
