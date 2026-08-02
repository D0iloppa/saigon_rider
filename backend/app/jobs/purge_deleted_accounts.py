"""탈퇴 30일 경과 계정의 개인 데이터를 실제로 파기한다 (F-10).

공표 문구("계정 삭제 시 30일 이내에 모든 개인정보가 영구 삭제됩니다" —
frontend/src/locales/*/translation.json legal.privacyHtml)와 실제 동작을
맞추기 위한 배치. `delete_account`(routers/users.py)가 탈퇴 즉시 phone/nickname
을 익명화하지만, RideSession·UserQuest·UserBadge 등은 FK로 무기한 잔존했다.

**삭제 대상은 "이 유저 개인 소유"인 테이블로 한정한다.** 대표 결정(2026-08-01)에 따라
feed_posts/post_comments(피드글·댓글)도 삭제 대상에 포함됐다 — 단 두 테이블 모두 자식에
ON DELETE CASCADE 가 걸려 있어 타인이 남긴 좋아요·대댓글·해당 글/댓글에 대한 신고(reports)
행까지 함께 사라진다(상대방 권리 침해 소지를 대표가 인지하고 승인).
거래(marketplace_listings/appointments/price_offers)·리뷰(marketplace_reviews/
business_review)·신고(reports, 위 CASCADE 케이스 제외)·제재(user_sanctions)·
CS(support_tickets)·DM(dm_conversations/dm_messages)·업체 프로필(business_profile)·
크라우드소싱 제보(flood_report 등)·내부 보상 원장(internal_reward_grants)은 상대방 권리·
법적 보존 의무·타 이용자가 참조하는 공공성 데이터라 이 잡이 건드리지 않는다
(users 행 자체도 삭제하지 않음 — anonymize 유지).
표는 ai-docs/260731_remediation_ledger.md F-10 최종보고 참조.

테이블 DELETE 외에 성격이 다른 두 파기 단계가 별도로 붙는다(_OWN_DATA_TABLES 에 못 넣는 이유 포함):

1. **Engine device_user_map 해제 (기기 매핑 + FCM 푸시 토큰)** — 방침 §1 이 수집 항목으로
   공표한 푸시 토큰(FCM)은 BFF DB 에 없고 Engine DB `device_user_map.fcm_token` 에만 있다.
   BFF 는 Engine 테이블 직접 접근 금지(핵심 제약)라 SQL DELETE 가 불가능하고, 기존 HTTP API
   (GET /v1/device-map/lookup → DELETE /v1/device-map, engine_client 래퍼)로 해제한다.
   이 행을 남기면 탈퇴자에게 푸시가 계속 갈 수 있다.
2. **본인 소유 contents 파기 (행 + 디스크 파일)** — 방침 §4 파기 대상과 정확히 일치시킨다:
   프로필 사진(users.avatar_content_id)과 본인 피드 게시물 사진(feed_posts.image_content_id,
   feed_post_images.content_id)만. 매물·DM·업체 프로필·리뷰 등 보존 대상 엔티티에 붙은
   이미지는 방침이 "계속 보관"을 공표하므로 지우지 않는다. 수집 SELECT 는 반드시
   feed_posts DELETE **이전**에 실행한다(CASCADE 로 feed_post_images 가 먼저 사라지면
   content_id 를 알 수 없게 됨). 파일 삭제(unlink)는 DB 커밋 뒤 best-effort — 실패해도
   배치를 죽이지 않는다.

두 단계 모두 실패 시 로그만 남기고 계속 진행한다 — 파기된 유저도 users 행이 남아
(deleted_at + del_ phone) 다음 실행에서 다시 후보가 되므로 재시도로 자가 치유된다.
"""

import asyncio
import logging
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import bindparam, text

from ..database import AsyncSessionLocal
from ..engine_client import engine_client

log = logging.getLogger(__name__)

RETENTION_DAYS = 30

# (table, column) — 이 유저 소유이고 타인 권리·법적 보존 의무가 없는 개인 데이터만.
_OWN_DATA_TABLES: list[tuple[str, str]] = [
    ("user_otp", "user_id"),
    ("user_oauth_identities", "user_id"),
    ("user_quests", "user_id"),
    ("ride_sessions", "user_id"),
    ("ride_streaks", "user_id"),
    ("bookmarks", "user_id"),
    ("marketplace_listing_likes", "user_id"),
    ("marketplace_keyword_alerts", "user_id"),
    ("user_favorite_business", "user_id"),
    ("business_follow", "user_id"),
    ("post_likes", "user_id"),
    ("post_comment_likes", "user_id"),
    ("user_badges", "user_id"),
    ("notifications", "user_id"),
    ("notification_settings", "user_id"),
    ("user_favorite_location", "user_id"),
    # 피드글·댓글 — 대표 결정 ②(2026-08-01): 본인 소유 커뮤니티 콘텐츠도 삭제 대상에 포함.
    # 단, feed_posts/post_comments 모두 자식 테이블에 ON DELETE CASCADE 가 걸려 있어
    # 이 유저의 글/댓글이 지워지면 타인이 남긴 좋아요·대댓글·해당 글/댓글에 대한 신고(reports)까지
    # 함께 사라진다 — 상세는 ai-docs/260731_remediation_ledger.md F-10 참조.
    ("feed_posts", "user_id"),
    ("post_comments", "user_id"),
    # 팔로우 관계는 양방향 모두 삭제 — 법적 증거가 아니라 단순 관계 데이터.
    ("user_follows", "follower_id"),
    ("user_follows", "following_id"),
    # 차단은 "이 유저가 지정한" 것만 — blocked_id(타인이 이 유저를 차단한 설정)는
    # 다른 이용자의 안전 설정이므로 보존한다.
    ("user_blocks", "blocker_id"),
]

# contents 업로드 경로 규약 — routers/contents.py 와 동일 env.
CONTENTS_BASE_PATH = Path(os.getenv("CONTENTS_BASE_PATH", "/data"))

# 방침 §4 파기 대상 이미지만: 프로필 사진 + 본인 피드 게시물 사진.
# owner_type='user' AND owner_id=본인 이중 가드 — 업로드 시 owner_id 는 세션 uid 로
# 강제되지만, 만에 하나 타인/시스템 소유 content 가 참조돼 있어도 지우지 않는다.
_OWN_CONTENTS_SELECT = text(
    "SELECT c.id, c.file_path FROM contents c "
    "WHERE c.owner_type = 'user' AND c.owner_id = :uid AND c.id IN ("
    "  SELECT avatar_content_id FROM users WHERE id = :uid AND avatar_content_id IS NOT NULL"
    "  UNION"
    "  SELECT image_content_id FROM feed_posts WHERE user_id = :uid AND image_content_id IS NOT NULL"
    "  UNION"
    "  SELECT fpi.content_id FROM feed_post_images fpi"
    "  JOIN feed_posts fp ON fp.id = fpi.post_id WHERE fp.user_id = :uid"
    ")"
)

_OWN_CONTENTS_DELETE = text("DELETE FROM contents WHERE id IN :content_ids").bindparams(
    bindparam("content_ids", expanding=True)
)


async def _unlink_content_file(file_path: str) -> bool:
    """디스크의 이미지 원본 삭제 — 이미 없으면 성공(멱등). 실패는 False 로 보고만 한다."""
    try:
        await asyncio.to_thread((CONTENTS_BASE_PATH / file_path).unlink, missing_ok=True)
        return True
    except OSError:
        log.warning("content file unlink failed: %s", file_path, exc_info=True)
        return False


async def _purge_engine_device_map(user_id) -> bool:
    """Engine device_user_map 행(기기 매핑 + FCM 토큰) 해제. 행이 없으면 성공."""
    owned = await engine_client.lookup_device_map(str(user_id))
    device_uuid = owned.get("device_uuid")
    if device_uuid:
        await engine_client.delete_device_map(device_uuid, str(user_id))
    return bool(device_uuid)


def _is_purge_eligible(
    deleted_at: datetime | None,
    phone: str | None,
    now: datetime,
    retention_days: int = RETENTION_DAYS,
) -> bool:
    """① 살아있는 계정(미탈퇴) ② 탈퇴 후 retention_days 미경과 계정을 절대 배제한다."""
    if deleted_at is None:
        return False
    if phone is None or not phone.startswith("del_"):
        # delete_account 가 익명화한 흔적이 없으면(비정상 상태) 건너뛴다 — 방어적 가드.
        return False
    cutoff = now - timedelta(days=retention_days)
    return deleted_at < cutoff


async def purge_deleted_accounts(dry_run: bool = False, limit: int = 500) -> dict:
    now = datetime.now(UTC)
    purged_user_ids: list[str] = []
    skipped = 0
    archive_purged = 0
    contents_purged = 0
    device_maps_purged = 0

    try:
        async with AsyncSessionLocal() as db:
            candidates = (
                await db.execute(
                    text(
                        "SELECT id, deleted_at, phone FROM users "
                        "WHERE deleted_at IS NOT NULL AND phone LIKE 'del\\_%' ESCAPE '\\' "
                        "LIMIT :limit"
                    ),
                    {"limit": limit},
                )
            ).all()

            for row in candidates:
                user_id, deleted_at, phone = row[0], row[1], row[2]
                if not _is_purge_eligible(deleted_at, phone, now):
                    skipped += 1
                    continue
                if dry_run:
                    purged_user_ids.append(str(user_id))
                    continue
                # 파기 대상 이미지 수집 — feed_posts DELETE 전에 해야 한다 (모듈 docstring 2 참조).
                content_rows = (await db.execute(_OWN_CONTENTS_SELECT, {"uid": user_id})).all()
                for table, column in _OWN_DATA_TABLES:
                    # table/column 은 위 고정 리스트(_OWN_DATA_TABLES)에서만 오며 사용자 입력이 아니다.
                    await db.execute(text(f"DELETE FROM {table} WHERE {column} = :uid"), {"uid": user_id})
                if content_rows:
                    await db.execute(_OWN_CONTENTS_DELETE, {"content_ids": [r[0] for r in content_rows]})
                await db.commit()
                # 파일 삭제는 커밋 뒤 best-effort — 실패분은 로그로만 남는다(행은 이미 파기됨).
                for _content_id, file_path in content_rows:
                    if await _unlink_content_file(file_path):
                        contents_purged += 1
                # Engine 기기 매핑 + FCM 토큰 해제 — 실패해도 배치 계속(다음 실행에서 재시도됨).
                try:
                    if await _purge_engine_device_map(user_id):
                        device_maps_purged += 1
                except Exception:
                    log.warning("engine device-map purge failed for user=%s", user_id, exc_info=True)
                purged_user_ids.append(str(user_id))

            # ── 별도 단계: 탈퇴 식별자 해시 아카이브(withdrawn_member_archive, 170) 1년 경과분 파기.
            # 위 30일 개인데이터 파기와 기간(1년)·대상(해시 행)·단위(유저가 아니라 행의
            # purge_after)가 전부 달라 섞지 않는다. 자격 판정은 행에 박힌 purge_after 하나로 끝.
            if dry_run:
                archive_purged = (
                    await db.execute(
                        text("SELECT count(*) FROM withdrawn_member_archive WHERE purge_after < :now"),
                        {"now": now},
                    )
                ).scalar_one()
            else:
                result = await db.execute(
                    text("DELETE FROM withdrawn_member_archive WHERE purge_after < :now"), {"now": now}
                )
                await db.commit()
                archive_purged = result.rowcount

        return {
            "status": "ok",
            "dry_run": dry_run,
            "purged_count": len(purged_user_ids),
            "skipped_not_eligible": skipped,
            "purged_user_ids": purged_user_ids,
            "archive_purged_count": archive_purged,
            "contents_purged": contents_purged,
            "device_maps_purged": device_maps_purged,
        }
    except Exception:
        log.exception("Account purge batch failed")
        return {"status": "error", "dry_run": dry_run, "purged_count": len(purged_user_ids)}
