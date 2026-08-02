"""영업 확보 업체 CSV 일괄 등록 — `admin_api/biz.py` `create_biz_account()` 와 동일한 부수효과
(status=APPROVED·user_id=NULL·reviewed_at·search_blob 즉시 적재·번역 워밍)를 DB 직접 삽입으로
재현한다(어드민 UI 로 수십 건을 하나씩 넣는 비효율 해소, 2026-08-02).

CSV 컬럼(헤더 필수): name,category,address,latitude,longitude,phone,intro
  - intro 는 비어도 됨. 그 외는 필수.
  - category 는 `business_category.code` 중 하나여야 한다.
  - latitude/longitude 는 호치민 대략 범위(위도 10.4~11.1, 경도 106.4~107.0) 안이어야 한다.
    ⚠️ 이 범위는 "말이 되는 좌표인가"만 거르는 넓은 체크다. 실제 서비스 노출 지역(37개 동,
    `service_area.py`)보다 넓다 — 그 경계 밖 좌표는 등록은 허용하고 경고만 출력한다(대표가
    나중에 경계를 넓힐 수 있어 등록을 막지 않음, 2026-08-02 지시).

Usage:
    # 1) 미리보기만 (기본값 — 아무것도 DB 에 쓰지 않음)
    DATABASE_URL=postgresql+asyncpg://... python -m scripts.import_business_csv \\
        scripts/business_import_sample.csv

    # 2) 실제 반영
    DATABASE_URL=postgresql+asyncpg://... python -m scripts.import_business_csv \\
        scripts/business_import_sample.csv --commit

중복 방지: 같은 (name, address) 조합이 이미 DB 에 있거나 같은 CSV 안에서 반복되면 건너뛴다.
한 행이 검증에 실패해도(필수 필드 누락·잘못된 category·좌표 범위 밖) 전체 실행은 중단되지
않고 해당 행만 건너뛰며 사유와 행 번호를 출력한다.
"""

from __future__ import annotations

import argparse
import asyncio
import csv
import sys
from datetime import UTC, datetime
from decimal import Decimal, InvalidOperation

from sqlalchemy import select

from app.database import AsyncSessionLocal
from app.models import BusinessCategory, BusinessProfile
from app.services import noti_events
from app.services.search_index import immediate_blob
from app.services.service_area import in_service_area
from app.services.translate import warm_translations

REQUIRED_FIELDS = ("name", "category", "address", "latitude", "longitude", "phone")
# 넓은 형식 검사용 범위 — 서비스 노출 지역(37개 동)보다 넓다. service_area.in_service_area() 는
# 별도로 경고만 낸다(등록 차단 아님).
_HCMC_LAT_RANGE = (Decimal("10.4"), Decimal("11.1"))
_HCMC_LNG_RANGE = (Decimal("106.4"), Decimal("107.0"))


class SkipRow(Exception):
    """검증 실패 — 이 행만 건너뛴다(reason 은 요약 집계용 키)."""

    def __init__(self, reason: str):
        super().__init__(reason)
        self.reason = reason


def _parse_row(row: dict[str, str], valid_categories: set[str]) -> dict:
    for field in REQUIRED_FIELDS:
        if not (row.get(field) or "").strip():
            raise SkipRow(f"필수 필드 누락: {field}")

    category = row["category"].strip()
    if category not in valid_categories:
        raise SkipRow(f"알 수 없는 category: {category!r}")

    try:
        lat = Decimal(row["latitude"].strip())
        lng = Decimal(row["longitude"].strip())
    except InvalidOperation as exc:
        raise SkipRow(f"위경도 파싱 실패: {exc}") from None

    if not (_HCMC_LAT_RANGE[0] <= lat <= _HCMC_LAT_RANGE[1]):
        raise SkipRow(f"위도 범위 밖: {lat}")
    if not (_HCMC_LNG_RANGE[0] <= lng <= _HCMC_LNG_RANGE[1]):
        raise SkipRow(f"경도 범위 밖: {lng}")

    return {
        "name": row["name"].strip(),
        "category": category,
        "address": row["address"].strip(),
        "latitude": lat,
        "longitude": lng,
        "phone": row["phone"].strip(),
        "intro": (row.get("intro") or "").strip() or None,
    }


async def _existing_pairs(db) -> set[tuple[str, str]]:
    rows = (await db.execute(select(BusinessProfile.name, BusinessProfile.address))).all()
    return {(name, address) for name, address in rows}


async def _run(csv_path: str, commit: bool) -> None:
    with open(csv_path, encoding="utf-8-sig", newline="") as f:
        reader = csv.DictReader(f)
        expected_fields = (*REQUIRED_FIELDS, "intro")
        if reader.fieldnames is None or not set(expected_fields).issubset(reader.fieldnames):
            print(f"ERROR: CSV 헤더가 예상과 다릅니다. 기대: {expected_fields}", file=sys.stderr)
            sys.exit(1)
        raw_rows = list(enumerate(reader, start=2))  # 2 = 헤더 다음 첫 데이터 행

    async with AsyncSessionLocal() as db:
        valid_categories = {c for (c,) in (await db.execute(select(BusinessCategory.code))).all()}
        seen_pairs = await _existing_pairs(db)

        succeeded: list[dict] = []
        skip_reasons: dict[str, int] = {}
        boundary_warnings = 0

        for line_num, row in raw_rows:
            try:
                parsed = _parse_row(row, valid_categories)
                pair = (parsed["name"], parsed["address"])
                if pair in seen_pairs:
                    raise SkipRow("중복(name+address 이미 존재)")
            except SkipRow as exc:
                print(f"  [건너뜀] 행 {line_num}: {exc.reason}")
                skip_reasons[exc.reason.split(":")[0]] = skip_reasons.get(exc.reason.split(":")[0], 0) + 1
                continue

            if not in_service_area(float(parsed["latitude"]), float(parsed["longitude"])):
                boundary_warnings += 1
                print(f"  [경고] 행 {line_num}: 서비스 지역(37개 동) 밖 좌표 — 등록은 진행하되 지도에 안 뜰 수 있음")

            seen_pairs.add(pair)  # 같은 CSV 안의 이후 중복 행도 잡기
            succeeded.append({"line_num": line_num, **parsed})

        for item in succeeded:
            now = datetime.now(UTC)
            bp = BusinessProfile(
                user_id=None,
                name=item["name"],
                category=item["category"],
                address=item["address"],
                intro=item["intro"],
                latitude=item["latitude"],
                longitude=item["longitude"],
                phone=item["phone"],
                status="APPROVED",
                reviewed_at=now,
                created_at=now,
                updated_at=now,
                search_blob=immediate_blob([item["name"], item["address"], item["intro"]]),
            )
            db.add(bp)
            savepoint = await db.begin_nested()  # 한 행의 flush 실패가 나머지 행을 죽이지 않도록
            try:
                await db.flush()
                await savepoint.commit()
            except Exception as exc:  # DB 제약 위반 등 예상치 못한 실패 — 이 행만 건너뛰고 계속
                await savepoint.rollback()
                print(f"  [건너뜀] 행 {item['line_num']}: DB 삽입 실패: {exc}")
                skip_reasons["DB 삽입 실패"] = skip_reasons.get("DB 삽입 실패", 0) + 1
                succeeded.remove(item)
                continue
            noti_events.enqueue(
                db,
                "search.reindex",
                {
                    "entity_type": "biz",
                    "entity_id": str(bp.id),
                    "texts": [item["name"], item["address"], item["intro"]],
                },
            )
            item["profile_id"] = bp.id

        if not commit:
            await db.rollback()
            print(f"\n[dry-run] {len(succeeded)}건 등록 예정(실제 반영 안 함, --commit 으로 반영)")
        else:
            await db.commit()
            print(f"\n[commit] {len(succeeded)}건 DB 반영 완료")
            for item in succeeded:
                await warm_translations([item["name"], item["address"], item["intro"] or ""])

    total_skipped = sum(skip_reasons.values())
    print(f"\n=== 요약: 성공 {len(succeeded)} / 건너뜀 {total_skipped} ===")
    for reason, count in sorted(skip_reasons.items(), key=lambda kv: -kv[1]):
        print(f"  - {reason}: {count}건")
    if boundary_warnings:
        print(f"  (서비스 지역 밖 경고 {boundary_warnings}건 — 등록은 됐으나 지도 노출 여부 확인 필요)")


def main() -> None:
    parser = argparse.ArgumentParser(description="업체 CSV 일괄 등록 (기본 dry-run)")
    parser.add_argument("csv_path", help="CSV 파일 경로 (컬럼: name,category,address,latitude,longitude,phone,intro)")
    parser.add_argument("--commit", action="store_true", help="실제 DB 반영(기본은 미리보기만, 아무것도 쓰지 않음)")
    args = parser.parse_args()

    asyncio.run(_run(args.csv_path, args.commit))


if __name__ == "__main__":
    main()
