"""워키토키 모듈(d_modules/WalkieTalkie) 을 이 앱에 연결하는 어댑터.

모듈은 이 앱의 스키마를 전혀 모른다 — 사용자를 불투명 문자열로만 다루고, 참석·권한 판정은
전부 여기로 위임한다(`MembershipPort`). 즉 **정책은 이 파일에만 있고 모듈에는 없다.**
덕분에 그룹 운영진의 강퇴·블랙리스트가 워키토키에도 자동으로 적용된다.

주의: 포트는 송신 1회 + 수신 조회마다 불린다. 각 구현은 인덱스 하나로 끝나는 질의만 해야 한다 —
무겁게 짜면 폴링 부하 개선분을 어댑터가 도로 까먹는다.
"""

import logging
import os
import uuid
from pathlib import Path

from fastapi import Depends
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncEngine, AsyncSession, async_sessionmaker

from ..deps import verify_user_session
from ..models import Content, DmConversation, DmConversationBan, DmConversationMember, User


def _as_uuid(ref: str) -> uuid.UUID | None:
    try:
        return uuid.UUID(ref)
    except (ValueError, AttributeError):
        return None


class DmMembership:
    """참석·권한 판정 = 이 앱의 DM 대화방 멤버십 + 블랙리스트.

    - direct 대화: 두 참여자만
    - group/open 대화: 활성 멤버(left_at IS NULL) 이면서 밴되지 않은 사용자
    """

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def _allowed(self, channel_ref: str, user_ref: str) -> bool:
        conv_id, uid = _as_uuid(channel_ref), _as_uuid(user_ref)
        if conv_id is None or uid is None:
            return False
        async with self._session_factory() as db:
            conv = await db.get(DmConversation, conv_id)
            if conv is None:
                return False
            if conv.conversation_type == "direct":
                return uid in (conv.participant_1, conv.participant_2)
            banned = (
                await db.execute(
                    select(DmConversationBan.user_id).where(
                        DmConversationBan.conversation_id == conv_id,
                        DmConversationBan.user_id == uid,
                    )
                )
            ).first()
            if banned is not None:
                return False
            member = (
                await db.execute(
                    select(DmConversationMember.user_id).where(
                        DmConversationMember.conversation_id == conv_id,
                        DmConversationMember.user_id == uid,
                        DmConversationMember.left_at.is_(None),
                    )
                )
            ).first()
            return member is not None

    async def can_listen(self, channel_ref: str, user_ref: str) -> bool:
        return await self._allowed(channel_ref, user_ref)

    async def can_speak(self, channel_ref: str, user_ref: str) -> bool:
        # 듣기와 말하기의 권한을 지금은 동일하게 둔다. 나중에 "읽기 전용 채널"이 필요해지면
        # 여기만 갈라지고 모듈은 손대지 않는다.
        return await self._allowed(channel_ref, user_ref)

    async def list_members(self, channel_ref: str) -> list[str]:
        conv_id = _as_uuid(channel_ref)
        if conv_id is None:
            return []
        async with self._session_factory() as db:
            conv = await db.get(DmConversation, conv_id)
            if conv is None:
                return []
            if conv.conversation_type == "direct":
                return [str(p) for p in (conv.participant_1, conv.participant_2) if p is not None]
            banned = {
                b
                for (b,) in (
                    await db.execute(
                        select(DmConversationBan.user_id).where(DmConversationBan.conversation_id == conv_id)
                    )
                ).all()
            }
            rows = (
                await db.execute(
                    select(DmConversationMember.user_id).where(
                        DmConversationMember.conversation_id == conv_id,
                        DmConversationMember.left_at.is_(None),
                    )
                )
            ).all()
            return [str(u) for (u,) in rows if u not in banned]


class UserIdentity:
    """표시 이름 조회 — 모듈은 user_ref 문자열만 알고 있으므로 여기서 닉네임을 붙인다."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def display_names(self, user_refs: list[str]) -> dict[str, str]:
        ids = [u for u in (_as_uuid(r) for r in user_refs) if u is not None]
        if not ids:
            return {}
        async with self._session_factory() as db:
            rows = (await db.execute(select(User.id, User.nickname).where(User.id.in_(ids)))).all()
        return {str(uid): (nick or "") for uid, nick in rows}


class ContentsBlobs:
    """음성 파일을 이 앱의 `contents` 체계에 저장한다.

    모듈 자체 파일 저장(LocalFileBlobs) 대신 이걸 쓰는 이유: 이 앱은 모든 미디어를 contents 로
    중개하고 백업·파기 경로가 거기에 걸려 있다(CLAUDE.md 규약). 모듈이 별도 디렉터리에 쌓으면
    그 경로들이 음성만 비켜간다.
    """

    def __init__(self, session_factory: async_sessionmaker[AsyncSession], base_path: Path) -> None:
        self._session_factory = session_factory
        self._base = base_path

    async def put(self, data: bytes, mime_type: str) -> str:
        ext = ".m4a" if mime_type in ("audio/m4a", "audio/mp4") else ".aac"
        rel = f"walkie/{uuid.uuid4().hex}{ext}"
        abs_path = self._base / rel
        abs_path.parent.mkdir(parents=True, exist_ok=True)
        abs_path.write_bytes(data)
        async with self._session_factory() as db:
            content = Content(file_path=rel, mime_type=mime_type, file_size=len(data), owner_type="user")
            db.add(content)
            await db.commit()
            return str(content.id)

    async def url(self, key: str) -> str | None:
        cid = _as_uuid(key)
        if cid is None:
            return None
        async with self._session_factory() as db:
            content = await db.get(Content, cid)
            if content is None:
                return None
        # D-5: 오디오는 imgproxy 를 거치지 않고 원본 서빙 경로를 쓴다(contents.py 와 동일 규칙).
        return f"/api/bff/contents/{key}/raw"

    async def delete(self, key: str) -> None:
        cid = _as_uuid(key)
        if cid is None:
            return
        async with self._session_factory() as db:
            content = await db.get(Content, cid)
            if content is None:
                return
            path = self._base / content.file_path
            if path.exists():
                path.unlink()
            await db.delete(content)
            await db.commit()


class FcmNotifier:
    """새 음성 도착 푸시 — 앱이 백그라운드면 스트림·폴링이 모두 멈추므로 푸시가 유일한 경로다."""

    def __init__(self, session_factory: async_sessionmaker[AsyncSession]) -> None:
        self._session_factory = session_factory

    async def notify_voice(
        self,
        channel_ref: str,
        user_refs: list[str],
        sender_ref: str,
        message_id: str,
        audio_url: str | None,
    ) -> None:
        """기존 DM 알림 파이프라인(`dm.message_sent`)에 그대로 실어 보낸다.

        별도 이벤트 타입을 만들지 않는 이유: 워커에 이미 음성메시지 분기(message_type='voice',
        "바로 재생" 액션)가 있어 알림 문구·딥링크·중복제거를 전부 재사용할 수 있다.

        실패해도 음성 전송 자체는 성공으로 둔다. 다만 **백그라운드에서는 푸시가 유일한 수신
        경로**라, 조용히 삼키지 않고 로그로 남긴다.
        """
        try:
            from . import noti_events

            async with self._session_factory() as db:
                uid = _as_uuid(sender_ref)
                sender = await db.get(User, uid) if uid else None
                noti_events.enqueue(
                    db,
                    "dm.message_sent",
                    {
                        "conversation_id": channel_ref,
                        "sender_id": sender_ref,
                        "recipient_ids": user_refs,
                        "sender_nickname": (sender.nickname if sender and sender.nickname else ""),
                        "preview": "음성 메시지를 보냈습니다",
                        "message_type": "voice",
                        "message_id": message_id,
                        # 워커의 음성 분기는 audio_url 이 있어야 발화한다 — 이게 없으면
                        # 일반 텍스트 알림으로 떨어져 백그라운드 자동재생이 성립하지 않는다.
                        "audio_url": audio_url,
                    },
                )
                await db.commit()
        except Exception:
            logging.getLogger(__name__).warning("walkie voice push enqueue failed", exc_info=True)


async def current_user_ref(session_uid: uuid.UUID = Depends(verify_user_session)) -> str:
    """호스트 인증을 모듈이 요구하는 형태(문자열)로 변환하는 얇은 어댑터.

    모듈은 세션·쿠키·JWT 중 무엇을 쓰는지 몰라도 되고, 우리는 기존 인증 의존성을 그대로 쓴다.
    """
    return str(session_uid)


def build_walkie(engine: AsyncEngine, contents_base_path: Path):
    """모듈 인스턴스 조립. `app/main.py` 가 호출한다."""
    from walkie_talkie import WalkieConfig, WalkieTalkie

    session_factory = async_sessionmaker(engine, expire_on_commit=False, class_=AsyncSession)
    # 다중 워커 브로드캐스트(Phase 3, 위치채널과 공유하는 REALTIME_BROADCAST 스위치) — 모듈은
    # `BroadcastPort` 를 이미 주입식으로 받으므로 패키지 내부는 손대지 않는다.
    broadcaster = None
    if os.getenv("REALTIME_BROADCAST", "inprocess").strip().lower() == "redis":
        from .realtime_broadcast import RedisBroadcaster

        broadcaster = RedisBroadcaster(prefix="wt:bcast:")
    return WalkieTalkie(
        # db_url 은 넘기지만 실제로는 engine 이 우선한다 — 호스트 커넥션 풀을 그대로 공유해
        # 풀이 둘로 갈라지지 않게 한다.
        # 202608 개편(대표 지시): 음성메시지가 DmDetail 채팅 이력에 영구 버블로 남는 것으로
        # 바뀌면서 "전원 재생 시 즉시삭제" 정책을 폐기한다 — 언제든 재생 가능해야 하므로.
        # 24시간 TTL(voice_message_ttl_sec, 기본값 유지)이 스토리지 관리를 대신한다.
        config=WalkieConfig(db_url="", delete_blob_after_play=False),
        engine=engine,
        membership=DmMembership(session_factory),
        identity=UserIdentity(session_factory),
        blobs=ContentsBlobs(session_factory, contents_base_path),
        notifier=FcmNotifier(session_factory),
        current_user_ref=current_user_ref,
        prefix="/walkie",
        broadcaster=broadcaster,
    )
