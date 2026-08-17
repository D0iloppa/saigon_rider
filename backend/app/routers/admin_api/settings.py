"""admin JSON API — 설정 (닉네임 단어사전·앱 버전 관리·서비스 설정·관리자 프로필).

`admin_legacy.py`의 동명 Jinja 라우트(`/settings`, 1191-2101행)를 4개 서브기능으로
나눠 JSON 응답으로 이관한 것 — Engine 무관, BFF 로컬 테이블(users/nickname_words/
app_versions/app_config)만 다룬다. 민감도에 따라 게이트를 분리했다: 앱 버전·서비스
설정(전역 서비스 동작 변경)은 `verify_root_api`(root/admin, manager 차단), 닉네임
단어사전·관리자 본인 프로필(자기 자신·컨텐츠 모더레이션, 위해 적음)은 `verify_admin_api`
(manager 포함). 관리자 프로필은 공용 관리자 계정(ADMIN_USER_ID)의 User 행을 다룬다 —
legacy `_get_admin_user`/`_admin_avatar_url`와 동일. 아바타는 업로드 위젯 대신
contents 중개 규약(content_id UUID 입력, badges.py의 icon_content_id와 동일 패턴)을
따른다. 구 `/admin-legacy/settings` 라우트는 손대지 않고 병행 유지한다.
"""

import os
import uuid
from datetime import UTC, datetime
from typing import Literal

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_admin_api, verify_root_api
from ...database import get_db
from ...models import AppConfig, AppVersion, NicknameWord, User
from ...utils import resolve_avatar_url
from ._audit import audit

router = APIRouter(prefix="/settings")

ADMIN_USER_ID = uuid.UUID(os.getenv("ADMIN_USER_ID", "00000000-0000-0000-0000-000000000001"))


async def _get_admin_user(db: AsyncSession) -> User:
    user = await db.get(User, ADMIN_USER_ID)
    if user is None:
        raise HTTPException(status_code=500, detail="Admin user seed not found.")
    return user


# ── 관리자 본인 프로필 (닉네임/아바타) ────────────────────────────────


class ProfileRow(BaseModel):
    nickname: str | None
    avatar_content_id: uuid.UUID | None
    avatar_url: str


class NicknameUpdateRequest(BaseModel):
    nickname: str


class AvatarUpdateRequest(BaseModel):
    content_id: uuid.UUID | None = None


def _profile_row(user: User) -> ProfileRow:
    return ProfileRow(
        nickname=user.nickname,
        avatar_content_id=user.avatar_content_id,
        avatar_url=resolve_avatar_url(user),
    )


@router.get("/profile", response_model=ProfileRow, summary="관리자 본인 프로필 조회")
async def get_profile(
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    user = await _get_admin_user(db)
    return _profile_row(user)


@router.put("/profile/nickname", response_model=ProfileRow, summary="관리자 본인 닉네임 변경")
async def update_profile_nickname(
    body: NicknameUpdateRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    user = await _get_admin_user(db)
    nickname = body.nickname.strip()
    if not nickname:
        raise HTTPException(status_code=400, detail="닉네임을 입력하세요.")
    if len(nickname) > 30:
        raise HTTPException(status_code=400, detail="닉네임은 30자 이하여야 합니다.")

    dup = (await db.execute(select(User).where(User.nickname == nickname, User.id != user.id))).scalar_one_or_none()
    if dup is not None:
        raise HTTPException(status_code=409, detail="이미 다른 유저가 사용 중인 닉네임입니다.")

    user.nickname = nickname
    await audit(db, session, request, "SETTINGS_NICKNAME_UPDATE", "user", str(user.id), {"nickname": nickname})
    await db.commit()
    await db.refresh(user)
    return _profile_row(user)


@router.put("/profile/avatar", response_model=ProfileRow, summary="관리자 본인 아바타 변경")
async def update_profile_avatar(
    body: AvatarUpdateRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    user = await _get_admin_user(db)
    user.avatar_content_id = body.content_id
    await audit(
        db, session, request, "SETTINGS_AVATAR_UPDATE", "user", str(user.id), {"content_id": str(body.content_id)}
    )
    await db.commit()
    await db.refresh(user)
    return _profile_row(user)


# ── 닉네임 단어사전 ──────────────────────────────────────────────────


class NicknameWordRow(BaseModel):
    model_config = {"from_attributes": True}

    id: int
    word: str
    word_type: str
    created_at: datetime


class NicknameWordCreateRequest(BaseModel):
    word: str
    word_type: Literal["adjective", "noun"]


@router.get("/nickname-words", response_model=list[NicknameWordRow], summary="닉네임 단어사전 목록")
async def list_nickname_words(
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    words = (await db.execute(select(NicknameWord).order_by(NicknameWord.word_type, NicknameWord.word))).scalars().all()
    return [NicknameWordRow.model_validate(w) for w in words]


@router.post("/nickname-words", response_model=NicknameWordRow, status_code=201, summary="닉네임 단어 추가")
async def create_nickname_word(
    body: NicknameWordCreateRequest,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    word = body.word.strip()
    if not word:
        raise HTTPException(status_code=400, detail="단어를 입력하세요.")

    dup = (
        await db.execute(
            select(NicknameWord).where(NicknameWord.word == word, NicknameWord.word_type == body.word_type)
        )
    ).scalar_one_or_none()
    if dup:
        raise HTTPException(status_code=409, detail="이미 등록된 단어입니다.")

    row = NicknameWord(word=word, word_type=body.word_type)
    db.add(row)
    await db.flush()
    await audit(
        db,
        session,
        request,
        "SETTINGS_NICKNAME_WORD_ADD",
        "nickname_word",
        str(row.id),
        {"word": word, "word_type": body.word_type},
    )
    await db.commit()
    await db.refresh(row)
    return NicknameWordRow.model_validate(row)


@router.delete("/nickname-words/{word_id}", status_code=204, summary="닉네임 단어 삭제")
async def delete_nickname_word(
    word_id: int,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    row = await db.get(NicknameWord, word_id)
    if row is None:
        raise HTTPException(status_code=404, detail="Nickname word not found")
    await db.delete(row)
    await audit(
        db, session, request, "SETTINGS_NICKNAME_WORD_DELETE", "nickname_word", str(word_id), {"word": row.word}
    )
    await db.commit()


# ── 앱 버전 관리 (root 전용) ──────────────────────────────────────────


class AppVersionRow(BaseModel):
    id: int
    version: str
    is_active: bool
    is_force_update: bool
    release_note: str | None
    released_at: datetime | None
    ios_build: str | None
    android_build: str | None


class AppVersionCreateRequest(BaseModel):
    version: str
    ios_build: str = ""
    android_build: str = ""
    release_note: str = ""
    is_force_update: bool = False
    is_active: bool = False


@router.get("/versions", response_model=list[AppVersionRow], summary="앱 버전 목록")
async def list_versions(
    _session: AdminSession = Depends(verify_root_api),
    db: AsyncSession = Depends(get_db),
):
    primary_versions = (
        (
            await db.execute(
                select(AppVersion)
                .where(AppVersion.platform == "primary")
                .order_by(AppVersion.released_at.desc().nullslast(), AppVersion.id.desc())
            )
        )
        .scalars()
        .all()
    )
    child_versions = (
        (
            await db.execute(
                select(AppVersion).where(
                    AppVersion.parent_id.in_([pv.id for pv in primary_versions]),
                    AppVersion.platform != "primary",
                )
            )
        )
        .scalars()
        .all()
        if primary_versions
        else []
    )
    children_by_parent: dict[int, list[AppVersion]] = {}
    for cv in child_versions:
        children_by_parent.setdefault(cv.parent_id, []).append(cv)

    rows = []
    for pv in primary_versions:
        pv_children = children_by_parent.get(pv.id, [])
        ios_v = next((c for c in pv_children if c.platform == "ios"), None)
        android_v = next((c for c in pv_children if c.platform == "android"), None)
        rows.append(
            AppVersionRow(
                id=pv.id,
                version=pv.version,
                is_active=pv.is_active,
                is_force_update=pv.is_force_update,
                release_note=pv.release_note,
                released_at=pv.released_at,
                ios_build=ios_v.build_number if ios_v else None,
                android_build=android_v.build_number if android_v else None,
            )
        )
    return rows


@router.post("/versions", response_model=AppVersionRow, status_code=201, summary="앱 버전 추가")
async def create_version(
    body: AppVersionCreateRequest,
    request: Request,
    session: AdminSession = Depends(verify_root_api),
    db: AsyncSession = Depends(get_db),
):
    version = body.version.strip()
    if not version:
        raise HTTPException(status_code=400, detail="버전 처리 중 오류가 발생했습니다.")

    if body.is_active:
        for old in (await db.execute(select(AppVersion).where(AppVersion.is_active == True))).scalars().all():
            old.is_active = False

    released_at = datetime.now(UTC) if body.is_active else None
    primary = AppVersion(
        version=version,
        platform="primary",
        release_note=body.release_note or None,
        is_force_update=body.is_force_update,
        is_active=body.is_active,
        released_at=released_at,
    )
    db.add(primary)
    await db.flush()

    ios = AppVersion(
        version=version,
        platform="ios",
        parent_id=primary.id,
        build_number=body.ios_build.strip() or None,
        release_note=body.release_note or None,
        is_force_update=body.is_force_update,
        is_active=body.is_active,
        released_at=released_at,
    )
    android = AppVersion(
        version=version,
        platform="android",
        parent_id=primary.id,
        build_number=body.android_build.strip() or None,
        release_note=body.release_note or None,
        is_force_update=body.is_force_update,
        is_active=body.is_active,
        released_at=released_at,
    )
    db.add_all([ios, android])
    await audit(db, session, request, "SETTINGS_VERSION_ADD", "app_version", str(primary.id), {"version": version})
    await db.commit()
    return AppVersionRow(
        id=primary.id,
        version=primary.version,
        is_active=primary.is_active,
        is_force_update=primary.is_force_update,
        release_note=primary.release_note,
        released_at=primary.released_at,
        ios_build=ios.build_number,
        android_build=android.build_number,
    )


@router.delete("/versions/{version_id}", status_code=204, summary="앱 버전 삭제")
async def delete_version(
    version_id: int,
    request: Request,
    session: AdminSession = Depends(verify_root_api),
    db: AsyncSession = Depends(get_db),
):
    v = await db.get(AppVersion, version_id)
    if v is None:
        raise HTTPException(status_code=404, detail="App version not found")
    await db.delete(v)
    await audit(db, session, request, "SETTINGS_VERSION_DELETE", "app_version", str(version_id), {"version": v.version})
    await db.commit()


# ── 서비스 설정 (root 전용) ───────────────────────────────────────────


class ServiceConfigRow(BaseModel):
    dm_poll_interval: str
    keyword_alert_max_count: str


class ServiceConfigRequest(BaseModel):
    dm_poll_interval: str
    keyword_alert_max_count: str


@router.get("/service-config", response_model=ServiceConfigRow, summary="서비스 설정 조회")
async def get_service_config(
    _session: AdminSession = Depends(verify_root_api),
    db: AsyncSession = Depends(get_db),
):
    dm_row = (
        await db.execute(select(AppConfig).where(AppConfig.group_name == "dm", AppConfig.key == "unread_poll_interval"))
    ).scalar_one_or_none()
    kw_row = (
        await db.execute(
            select(AppConfig).where(AppConfig.group_name == "market", AppConfig.key == "keyword_alert_max_count")
        )
    ).scalar_one_or_none()
    return ServiceConfigRow(
        dm_poll_interval=dm_row.value if dm_row else "30",
        keyword_alert_max_count=kw_row.value if kw_row else "20",
    )


@router.put("/service-config", response_model=ServiceConfigRow, summary="서비스 설정 저장")
async def update_service_config(
    body: ServiceConfigRequest,
    request: Request,
    session: AdminSession = Depends(verify_root_api),
    db: AsyncSession = Depends(get_db),
):
    try:
        dm_val = int(body.dm_poll_interval)
        if not 10 <= dm_val <= 300:
            raise ValueError
    except ValueError as e:
        raise HTTPException(status_code=400, detail="설정값이 올바르지 않습니다.") from e

    try:
        kw_val = int(body.keyword_alert_max_count)
        if not 1 <= kw_val <= 100:
            raise ValueError
    except ValueError as e:
        raise HTTPException(status_code=400, detail="설정값이 올바르지 않습니다.") from e

    dm_row = (
        await db.execute(select(AppConfig).where(AppConfig.group_name == "dm", AppConfig.key == "unread_poll_interval"))
    ).scalar_one_or_none()
    if dm_row:
        dm_row.value = str(dm_val)
    else:
        db.add(
            AppConfig(
                group_name="dm",
                key="unread_poll_interval",
                value=str(dm_val),
                description="DM 미읽음 폴링 주기 (초, 10~300)",
            )
        )

    kw_row = (
        await db.execute(
            select(AppConfig).where(AppConfig.group_name == "market", AppConfig.key == "keyword_alert_max_count")
        )
    ).scalar_one_or_none()
    if kw_row:
        kw_row.value = str(kw_val)
    else:
        db.add(
            AppConfig(
                group_name="market",
                key="keyword_alert_max_count",
                value=str(kw_val),
                description="키워드 알림 최대 개수 (사용자당, 1~100)",
            )
        )

    await audit(
        db,
        session,
        request,
        "SETTINGS_SERVICE_CONFIG_UPDATE",
        "app_config",
        "dm.unread_poll_interval",
        {"dm_poll_interval": dm_val, "keyword_alert_max_count": kw_val},
    )
    await db.commit()
    return ServiceConfigRow(dm_poll_interval=str(dm_val), keyword_alert_max_count=str(kw_val))
