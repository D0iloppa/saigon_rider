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
"""

import logging
from datetime import UTC, datetime, timedelta

from sqlalchemy import text

from ..database import AsyncSessionLocal

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
                for table, column in _OWN_DATA_TABLES:
                    # table/column 은 위 고정 리스트(_OWN_DATA_TABLES)에서만 오며 사용자 입력이 아니다.
                    await db.execute(text(f"DELETE FROM {table} WHERE {column} = :uid"), {"uid": user_id})
                await db.commit()
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
        }
    except Exception:
        log.exception("Account purge batch failed")
        return {"status": "error", "dry_run": dry_run, "purged_count": len(purged_user_ids)}
