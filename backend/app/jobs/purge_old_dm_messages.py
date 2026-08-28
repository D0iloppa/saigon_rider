"""DM 메시지 보관기간 경과분 파기 (215_dm_message_sync 후속 보관정책).

`dm_messages` 는 기본 365일 보관 후 배치 삭제한다. 소프트 삭제된 메시지(deleted_at 있음)도
같은 기준을 따른다 — T&S 신고 처리·분쟁 대응 근거로 보관기간까지는 남긴다(조기 파기 안 함).
단, reports 가 참조하는(신고 이력이 있는) 메시지는 보관기간이 지나도 파기하지 않는다 —
reports.group_message_id 가 ON DELETE CASCADE 라 메시지를 지우면 신고 이력 자체가 사라진다.

⚠️ 정확한 보관 일수는 법무 판단이 필요할 수 있다(베트남 개인정보/전자상거래 규정) —
확정 전까지 아래 config 상수(DM_RETENTION_DAYS)가 SoT 이고, 변경은 이 상수 하나로 끝난다.

첨부 컨텐츠 파기 — 이 프로젝트의 contents GC 관례(purge_deleted_accounts 참조)를 미러링한다:
메시지 삭제 **전에** image_content_id/audio_content_id 가 걸린 contents 행(id, file_path)을
수집하고, 메시지 → contents 행 순으로 DELETE 한 뒤, 디스크 파일 unlink 는 커밋 후
best-effort 로 처리한다(실패해도 배치를 죽이지 않는다 — 행은 이미 파기됨).
DM 첨부는 메시지 단위 업로드라 다른 엔티티가 참조하지 않지만, 방어적으로 "파기 대상
메시지만 참조하는" contents 로 한정한다(잔존 dm_messages 가 참조 중이면 건너뜀).

답장 앵커(reply_to_message_id)는 FK ON DELETE SET NULL — 원본이 파기돼도 답장 메시지의
reply_preview 스냅샷으로 렌더가 유지된다. 공감(dm_message_reactions)은 ON DELETE CASCADE.
"""

import asyncio
import logging
import os
from datetime import UTC, datetime, timedelta
from pathlib import Path

from sqlalchemy import bindparam, text

from ..database import AsyncSessionLocal

log = logging.getLogger(__name__)

# 기본 보관기간 (일) — 법무 확정 전 임시값. 변경은 이 상수만.
DM_RETENTION_DAYS = 365

# contents 업로드 경로 규약 — routers/contents.py / purge_deleted_accounts.py 와 동일 env.
CONTENTS_BASE_PATH = Path(os.getenv("CONTENTS_BASE_PATH", "/data"))

# 파기 후보 조건 — 보관기간 경과분 중 **신고(reports) 이력이 걸린 메시지는 제외**한다.
# reports.group_message_id 가 ON DELETE CASCADE 라 메시지를 하드 삭제하면 신고 행까지
# 사라진다 — docstring 의 "T&S 근거 보관" 원칙(purge_deleted_accounts 의 reports 보존
# 선례)에 따라 신고가 참조하는 메시지는 이번 배치에서 건너뛴다(다음 배치에서 재평가).
_EXPIRED_CONDITION = (
    "created_at < :cutoff AND id NOT IN (SELECT group_message_id FROM reports WHERE group_message_id IS NOT NULL)"
)

# 파기 대상 메시지 외에 같은 content 를 참조할 수 있는 (table, column) — 이 프로젝트는
# content_id 재사용을 막지 않으므로(예: 아바타 content 를 DM 첨부로 재전송), 아래 실제
# 존재하는 참조 컬럼 전부에서 미참조일 때만 contents 행을 지운다.
_OTHER_CONTENT_REFS: list[tuple[str, str]] = [
    ("districts", "image_content_id"),
    ("users", "avatar_content_id"),
    ("quests", "thumbnail_content_id"),
    ("quests", "main_content_id"),
    ("quests", "banner_content_id"),
    ("feed_posts", "image_content_id"),
    ("community_groups", "cover_content_id"),
    ("business_profile", "photo_content_id"),
    ("business_profile", "biz_license_content_id"),
    ("business_profile", "signboard_content_id"),
    ("poi", "photo_content_id"),
    ("marketplace_ads", "image_content_id"),
    ("badges", "icon_content_id"),
    ("dm_conversations", "photo_content_id"),
    ("feed_post_images", "content_id"),
    ("marketplace_listing_images", "content_id"),
    ("business_news_photo", "content_id"),
    ("report_images", "content_id"),
]
_OTHER_REFS_SUBQUERY = " UNION ".join(
    f"SELECT {column} FROM {table} WHERE {column} IS NOT NULL" for table, column in _OTHER_CONTENT_REFS
)

# 파기 대상 메시지가 참조하는 첨부 contents — 파기에서 살아남는 메시지(보관기간 안 또는
# 신고 이력 보유)가 같은 content 를 참조하고 있으면 방어적으로 제외하고, 다른 엔티티
# (_OTHER_CONTENT_REFS)가 참조 중인 content 도 지우지 않는다.
_EXPIRED_ATTACHMENT_CONTENTS_SELECT = text(
    "SELECT c.id, c.file_path FROM contents c "
    "WHERE c.id IN ("
    f"  SELECT image_content_id FROM dm_messages WHERE {_EXPIRED_CONDITION} AND image_content_id IS NOT NULL"
    "  UNION"
    f"  SELECT audio_content_id FROM dm_messages WHERE {_EXPIRED_CONDITION} AND audio_content_id IS NOT NULL"
    ") AND c.id NOT IN ("
    f"  SELECT image_content_id FROM dm_messages WHERE NOT ({_EXPIRED_CONDITION}) AND image_content_id IS NOT NULL"
    "  UNION"
    f"  SELECT audio_content_id FROM dm_messages WHERE NOT ({_EXPIRED_CONDITION}) AND audio_content_id IS NOT NULL"
    f") AND c.id NOT IN ({_OTHER_REFS_SUBQUERY})"
)

_EXPIRED_MESSAGES_DELETE = text(f"DELETE FROM dm_messages WHERE {_EXPIRED_CONDITION}")

_ATTACHMENT_CONTENTS_DELETE = text("DELETE FROM contents WHERE id IN :content_ids").bindparams(
    bindparam("content_ids", expanding=True)
)


async def _unlink_content_file(file_path: str) -> bool:
    """디스크의 첨부 원본 삭제 — 이미 없으면 성공(멱등). 실패는 False 로 보고만 한다."""
    try:
        await asyncio.to_thread((CONTENTS_BASE_PATH / file_path).unlink, missing_ok=True)
        return True
    except OSError:
        log.warning("dm content file unlink failed: %s", file_path, exc_info=True)
        return False


async def purge_old_dm_messages(dry_run: bool = False) -> dict:
    cutoff = datetime.now(UTC) - timedelta(days=DM_RETENTION_DAYS)
    try:
        async with AsyncSessionLocal() as db:
            if dry_run:
                purged = (
                    await db.execute(
                        text(f"SELECT count(*) FROM dm_messages WHERE {_EXPIRED_CONDITION}"), {"cutoff": cutoff}
                    )
                ).scalar_one()
                return {"status": "ok", "dry_run": True, "purged_count": purged, "contents_purged": 0}

            # 첨부 contents 수집은 메시지 DELETE **이전** — 지우고 나면 content_id 를 알 수 없다.
            content_rows = (await db.execute(_EXPIRED_ATTACHMENT_CONTENTS_SELECT, {"cutoff": cutoff})).all()
            result = await db.execute(_EXPIRED_MESSAGES_DELETE, {"cutoff": cutoff})
            if content_rows:
                await db.execute(_ATTACHMENT_CONTENTS_DELETE, {"content_ids": [r[0] for r in content_rows]})
            await db.commit()

            # 파일 삭제는 커밋 뒤 best-effort (행은 이미 파기됨)
            contents_purged = 0
            for _content_id, file_path in content_rows:
                if await _unlink_content_file(file_path):
                    contents_purged += 1

            return {
                "status": "ok",
                "dry_run": False,
                "purged_count": result.rowcount,
                "contents_purged": contents_purged,
            }
    except Exception:
        log.exception("DM message purge batch failed")
        return {"status": "error", "dry_run": dry_run, "purged_count": 0}
