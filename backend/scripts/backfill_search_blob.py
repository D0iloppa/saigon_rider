"""P5: 다국어 검색 blob 소급 백필 (260801_multilingual_search_design.md §5 P5).

2패스:
  1) ``--no-translate``(기본) — 전체 blob 을 원문만으로 즉시 채운다. API 호출 0, 즉시 recall 확보.
     P0(Google Translate 403) 가 죽어 있어도 실행 가능·유의미하다.
  2) ``--translate`` — 미번역분만 ``warm_translations`` 로 번역을 채운 뒤 blob 을 재계산한다.
     Google Translate API 를 호출한다.

⚠️ 이 스크립트의 --translate 는 **이번 세션에서 실행하지 않는다** — P0(403 User Rate Limit
   Exceeded) 가 3주째 살아있는 상태라 호출해봐야 전부 실패하고 쿼터만 태운다. 대표/감독이 P0
   복구(빌링·쿼터 확인)를 마친 뒤에만 실행할 것.

Usage:
    # 1패스 — 원문만 즉시 채움 (지금 바로 실행 가능)
    DATABASE_URL=postgresql+asyncpg://... python -m scripts.backfill_search_blob --entity all

    # 2패스 — 번역 얹기 (P0 복구 후에만!)
    DATABASE_URL=postgresql+asyncpg://... python -m scripts.backfill_search_blob \\
        --entity listing --translate --rps 5

멱등: 같은 행을 여러 번 처리해도 결과가 같다(UPDATE, 신규 행 생성 없음). 중간에 중단돼도
다음 실행이 처음부터 다시 돌아 최신 상태로 수렴한다(별도 커서 불필요 — 대상 건수가 수백 건대라
전체 재스캔 비용이 무시할 만하다, Simplicity First).
"""

from __future__ import annotations

import argparse
import asyncio
import sys
import time

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import BusinessNews, BusinessProfile, FeedPost, MarketplaceAd, MarketplaceListing
from app.services.search_index import build_blob, immediate_blob
from app.services.translate import warm_translations

# entity 키 → (모델, 검색 대상 원문 필드 추출) — search_index._TEXT_FIELDS 와 동일 매핑.
_ENTITY_MODELS = {
    "listing": (MarketplaceListing, lambda r: [r.title, r.description]),
    "biz": (BusinessProfile, lambda r: [r.name, r.address, r.intro]),
    "news": (BusinessNews, lambda r: [r.title, r.body]),
    "feed": (FeedPost, lambda r: [r.content]),
    "ad": (MarketplaceAd, lambda r: [r.title, r.body]),
}


async def _run(entity: str, translate: bool, limit: int | None, rps: float, dry_run: bool) -> None:
    targets = _ENTITY_MODELS if entity == "all" else {entity: _ENTITY_MODELS[entity]}
    async with AsyncSessionLocal() as db:
        for name, (model, text_fn) in targets.items():
            stmt = select(model).order_by(model.id)
            if limit:
                stmt = stmt.limit(limit)
            rows = (await db.execute(stmt)).scalars().all()

            done = 0
            failed = 0
            for row in rows:
                texts = text_fn(row)
                try:
                    if translate:
                        await warm_translations(texts)
                        row.search_blob = await build_blob(texts, db)
                        if rps > 0:
                            time.sleep(1.0 / rps)  # Google 쿼터 재발화 방지 (레이트리밋 필수)
                    else:
                        row.search_blob = immediate_blob(texts)
                    done += 1
                except Exception as exc:  # 한 행 실패가 전체 백필을 중단시키지 않음 — 실패만 집계
                    failed += 1
                    print(f"  ! {name} id={row.id} 실패: {exc}", file=sys.stderr)

            if dry_run:
                await db.rollback()
            else:
                await db.commit()
            print(f"{name}: {done}건 처리, {failed}건 실패 (translate={translate}, dry_run={dry_run})")


def main() -> None:
    parser = argparse.ArgumentParser(description="다국어 검색 search_blob 소급 백필")
    parser.add_argument("--entity", choices=[*_ENTITY_MODELS, "all"], default="all")
    parser.add_argument("--translate", dest="translate", action="store_true", help="번역까지 채움(API 호출 발생)")
    parser.add_argument("--no-translate", dest="translate", action="store_false", help="원문만 즉시 채움(기본)")
    parser.set_defaults(translate=False)
    parser.add_argument("--limit", type=int, default=None, help="엔티티별 처리 상한(테스트용)")
    parser.add_argument("--rps", type=float, default=5.0, help="--translate 시 요청 속도 제한(초당 건수)")
    parser.add_argument("--dry-run", action="store_true", help="commit 하지 않고 건수만 확인")
    args = parser.parse_args()

    if args.translate:
        print(
            "WARNING: --translate 는 Google Translate API 를 호출합니다. "
            "P0(403 User Rate Limit Exceeded) 복구를 확인한 뒤에만 실행하세요.",
            file=sys.stderr,
        )

    asyncio.run(_run(args.entity, args.translate, args.limit, args.rps, args.dry_run))


if __name__ == "__main__":
    main()
