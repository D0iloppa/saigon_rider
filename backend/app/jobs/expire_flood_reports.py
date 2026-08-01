"""만료된 활성 침수 신고의 상태를 주기적으로 정리한다."""

import logging

from sqlalchemy import text

from ..database import AsyncSessionLocal

log = logging.getLogger(__name__)


async def expire_stale_flood_reports() -> bool:
    try:
        async with AsyncSessionLocal() as db:
            await db.execute(
                text("""
                    UPDATE flood_report
                       SET status = 'EXPIRED'
                     WHERE status = 'ACTIVE'
                       AND expires_at < NOW()
                       AND NOT EXISTS (
                           SELECT report_id
                             FROM flood_confirmation
                            WHERE report_id = flood_report.report_id
                              AND confirmation_type = 'still_flooded'
                              AND confirmed_at > NOW() - INTERVAL '2 hours'
                              AND lat IS NOT NULL
                              AND lng IS NOT NULL
                            GROUP BY report_id
                           HAVING COUNT(DISTINCT user_id) >= 2
                       )
                """)
            )
            await db.commit()
        return True
    except Exception:
        log.exception("Expired flood report cleanup failed")
        return False
