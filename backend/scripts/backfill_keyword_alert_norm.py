"""마켓 키워드 알림 keyword_norm 소급 백필 (W1 감사 260817_keyword_alert_audit, migration 180).

180 마이그레이션은 컬럼만 추가한다(NULL 허용) — 기존 행의 keyword_norm 을 채우는 건
이 스크립트의 역할이다. 정규화는 `app.services.search_norm.norm()` 하나만 쓴다(중복 구현 금지).

성조/대소문자만 다른 중복 처리: 예) 같은 유저가 "Mũ"와 "mu"를 각각 등록해 뒀다면
기존 UNIQUE(user_id, lower(keyword)) 는 통과했지만(서로 다른 원문), keyword_norm 기준으로는
둘 다 "mu"라 uq_mp_kw_alert(user_id, keyword_norm) 위반이 된다. 이 경우 같은 실질 구독이므로
병합이 아니라 제거가 맞다 — created_at 이 더 이른 행만 남기고 나머지는 삭제한다.

멱등: 이미 keyword_norm 이 채워진 행은 건드리지 않는다(재실행 안전, 중간에 중단돼도 됨).

운영 배포 시 마이그레이션 180 적용 후 반드시 1회 실행하라. 미실행 시 매처(noti_worker)가
raw keyword 폴백으로 계속 동작하므로 알림이 끊기지는 않지만, 성조 정규화 매칭의 이점만
사라진 채로 남는다.

Usage:
    python -m scripts.backfill_keyword_alert_norm [--dry-run]
"""

from __future__ import annotations

import argparse
import asyncio

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import MarketplaceKeywordAlert
from app.services.search_norm import norm


async def _run(dry_run: bool) -> None:
    async with AsyncSessionLocal() as db:
        rows = (
            (await db.execute(select(MarketplaceKeywordAlert).order_by(MarketplaceKeywordAlert.created_at)))
            .scalars()
            .all()
        )

        seen: dict[tuple, MarketplaceKeywordAlert] = {}
        for row in rows:
            if row.keyword_norm is not None:
                seen.setdefault((row.user_id, row.keyword_norm), row)

        updated = 0
        removed = 0
        for row in rows:
            if row.keyword_norm is not None:
                continue
            key = (row.user_id, norm(row.keyword))
            if key in seen:
                await db.delete(row)
                removed += 1
                continue
            row.keyword_norm = key[1]
            seen[key] = row
            updated += 1

        if dry_run:
            await db.rollback()
        else:
            await db.commit()
        print(f"keyword_norm 채움: {updated}건, 정규화 충돌로 제거: {removed}건 (dry_run={dry_run})")


def main() -> None:
    parser = argparse.ArgumentParser(description="marketplace_keyword_alerts.keyword_norm 소급 백필")
    parser.add_argument("--dry-run", action="store_true", help="commit 하지 않고 건수만 확인")
    args = parser.parse_args()
    asyncio.run(_run(args.dry_run))


if __name__ == "__main__":
    main()
