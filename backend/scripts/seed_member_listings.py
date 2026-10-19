"""오픈 전 지인 계정에 실제 소유 물건을 매물로 일괄 등록한다 (앱 UI 대신 스크립트).

계정은 운영에 이미 소셜 가입돼 있다(이메일로 식별). 매물은 앱에서 만든 것과 같이 동작해야 하므로
(이후 DM→약속→거래완료→후기 실거래 가능) 해당 user 소유 ON_SALE 로 넣는다.

동작
- pack (로컬, DB 불필요): 상품 JSON + 이미지 폴더 + group→email 매핑 → tar 번들 1개.
  이미지 파일·필수 필드(category_code/district 포함)·매핑 누락 시 실패.
- import (bff 컨테이너): 번들을 멱등 반영. 사전검사(사용자·카테고리·구·좌표→ward·금칙어·번들 파일)를
  전부 통과해야 쓰기를 시작한다 — 하나라도 실패하면 아무것도 쓰지 않고 중단(없는 email 은 목록 출력).
  --dry-run 은 사전검사 + 사용자별 생성 예정 목록만 출력.
- withdraw (bff 컨테이너): 번들에서 재계산한 결정적 id 의 매물 중 ON_SALE/RESERVED 만 WITHDRAWN 으로 내린다.
  SOLD 등 다른 상태는 건드리지 않는다. 스키마 변경 없음.

설계 메모
- 앱 경로(routers/market.py create_listing, routers/contents.py upload_content)가 쓰는 서비스 함수를 그대로
  재사용한다: banned_keywords / in_service_area / find_nearest_ward_id / immediate_blob / compute_text_simhash /
  compute_dhash / noti_events.enqueue / log_transition / warm_translations. 라우터 함수는 HTTP 세션 의존이라
  호출하지 못해 INSERT 만 직접 한다(같은 필드·같은 훅). funnel_events(LISTING_CREATE)는 사용자 행동 지표
  오염을 피하려 기록하지 않는다.
- 이미지는 앱 업로드와 동일하게 변환·리사이즈 없이 원본 바이트를 `user-contents/YYYY/MM/<uuid>.<ext>` 에 쓰고
  contents(owner_type=user, owner_id=판매자, phash)를 만든다. URL 은 읽기 시점에 build_imgproxy_url 이 만든다.
  이미지 저장소 = bff 컨테이너 `/data`(env CONTENTS_BASE_PATH, 호스트 ./contents).
- 멱등 = 번들의 `no` 로 만든 uuid5 결정적 id(매물·이미지행·content). 이미 있는 매물은 건너뛴다(앱에서 상태가
  바뀌었어도 덮어쓰지 않음). 매물 단위 트랜잭션, 파일은 DB 행보다 먼저 쓴다.
- 좌표 = 구 중심(districts.center_lat/lng) 반경 ~700m 안 결정적 분산 → ward 가 배정되는 지점만 채택(동네지도 노출).
  같은 판매자는 같은 구(번들 데이터 책임). created_at/bumped_at 은 now 기준 결정적 오프셋(매물마다 서로 다름).
- 이 스크립트는 BFF 테이블(users/user_oauth_identities/contents/marketplace_*)만 만진다. Engine DB 접근 없음.
- 번호·이메일 등 개인정보는 코드에 없다. 번들 manifest 에는 email 이 들어 있으므로 사용 후 번들을 삭제할 것.

매핑 파일 예시 (--map, group→email)
  {"A": "a@example.com", "B": "b@example.com", "C": "c@example.com", "D": "d@example.com", "E": "e@example.com"}

Usage (repo 루트에서)
  # 1) 로컬: 번들 생성 (images-root = 이미지 JSON 의 "image" 경로 기준 디렉터리, 예: 저장소 루트)
  python backend/scripts/seed_member_listings.py pack --json ./listings.json --images-root . \
      --map ./group_email.json --out ./seed_member.tar
  # 2) DEV 검증: 번들을 bff 컨테이너로 넣고 dry-run → import → withdraw
  docker compose --env-file .env cp ./seed_member.tar bff:/tmp/seed_member.tar
  docker compose --env-file .env exec bff python -m scripts.seed_member_listings import --bundle /tmp/seed_member.tar --dry-run
  docker compose --env-file .env exec bff python -m scripts.seed_member_listings import --bundle /tmp/seed_member.tar
  docker compose --env-file .env exec bff python -m scripts.seed_member_listings withdraw --bundle /tmp/seed_member.tar --dry-run
  # 3) PROD: 번들 전송 → 컨테이너로 복사 → import --dry-run → import → (필요 시) withdraw
  scp ./seed_member.tar <prod-host>:<prod-repo>/seed_member.tar
  docker compose --env-file .env cp ./seed_member.tar bff:/tmp/seed_member.tar
  docker compose --env-file .env exec bff python -m scripts.seed_member_listings import --bundle /tmp/seed_member.tar --dry-run
  docker compose --env-file .env exec bff python -m scripts.seed_member_listings import --bundle /tmp/seed_member.tar
  docker compose --env-file .env exec bff python -m scripts.seed_member_listings withdraw --bundle /tmp/seed_member.tar [--dry-run]
"""

from __future__ import annotations

import argparse
import asyncio
import io
import json
import math
import os
import sys
import tarfile
import uuid
from datetime import UTC, datetime, timedelta
from decimal import Decimal
from pathlib import Path

_NS = uuid.UUID("7d3e9a52-4c1b-4f08-b6a7-2e5f1c9d8a31")
CONTENTS_BASE = Path(os.getenv("CONTENTS_BASE_PATH", "/data"))
MAX_UPLOAD_BYTES = 15 * 1024 * 1024  # routers/contents.py MAX_UPLOAD_BYTES 와 동일
SPREAD_RADII_M = (700, 300, 0)  # ward 미배정이면 반경을 줄여 재시도, 마지막은 구 중심
_FIELDS = ("no", "group", "image", "title", "category_code", "price_vnd", "district", "description")


def _did(kind: str, key: object) -> uuid.UUID:
    return uuid.uuid5(_NS, f"{kind}:{key}")


# ── pack (로컬) ─────────────────────────────────────────────────────────
def do_pack(json_path: str, images_root: str, map_path: str, out: str) -> None:
    items = json.loads(Path(json_path).read_text(encoding="utf-8"))
    group_email = json.loads(Path(map_path).read_text(encoding="utf-8"))
    errors: list[str] = []
    manifest, files = [], []
    for it in items:
        tag = f"#{it.get('no')}"
        n_err = len(errors)
        for f in _FIELDS:
            if it.get(f) in (None, ""):
                errors.append(f"{tag}: '{f}' 누락")
        if it.get("group") and not group_email.get(it["group"]):
            errors.append(f"{tag}: 매핑 파일에 group '{it['group']}' 없음")
        img = Path(images_root) / it.get("image", "")
        data = img.read_bytes() if it.get("image") and img.is_file() else None
        if data is None:
            errors.append(f"{tag}: 이미지 없음 {img}")
        elif data[:4] != b"RIFF" or data[8:12] != b"WEBP":
            errors.append(f"{tag}: webp 아님 {img}")
        elif len(data) > MAX_UPLOAD_BYTES:
            errors.append(f"{tag}: 이미지 15MB 초과 {img}")
        if len(errors) > n_err:
            continue
        manifest.append(
            {
                **{f: it[f] for f in _FIELDS if f != "image"},
                "ward": it.get("ward"),  # 선택: 구 중심이 서비스 영역 밖일 때 기준점으로 쓸 wards.code
                "email": group_email[it["group"]],
                "original_filename": img.name,
                "file": f"files/{it['no']}.webp",
            }
        )
        files.append((f"files/{it['no']}.webp", data))
    if len({m["no"] for m in manifest}) != len(manifest):
        errors.append("no 중복")
    if errors:
        print("\n".join(errors))
        sys.exit(f"pack 실패: {len(errors)}건")
    with tarfile.open(out, "w") as tar:
        raw = json.dumps({"version": 1, "listings": manifest}, ensure_ascii=False, indent=1).encode()
        ti = tarfile.TarInfo("manifest.json")
        ti.size = len(raw)
        tar.addfile(ti, io.BytesIO(raw))
        for name, data in files:
            ti = tarfile.TarInfo(name)
            ti.size = len(data)
            tar.addfile(ti, io.BytesIO(data))
    print(f"wrote {out}: {len(manifest)} listings (manifest 에 email 포함 — 사용 후 삭제)")


def _load_bundle(tar: tarfile.TarFile) -> list[dict]:
    return json.load(tar.extractfile("manifest.json"))["listings"]


# ── import (컨테이너) ───────────────────────────────────────────────────
def _spread(no: int, lat0: float, lng0: float, radius_m: int) -> tuple[float, float]:
    """구 중심 반경 radius_m 안에서 no 기반 결정적 분산."""
    h = _did("geo", no).int
    r = radius_m * math.sqrt((h & 0xFFFF) / 0xFFFF)
    th = 2 * math.pi * (((h >> 16) & 0xFFFF) / 0xFFFF)
    return (
        round(lat0 + r * math.sin(th) / 111_320, 6),
        round(lng0 + r * math.cos(th) / (111_320 * math.cos(math.radians(lat0))), 6),
    )


async def _preflight(db, items: list[dict], names: set[str]) -> tuple[dict | None, list[str]]:
    """쓰기 전 전체 검사. 반환: ({no: {seller_id, category_id, district_id, ward_id, lat, lng}}, errors)."""
    from sqlalchemy import func, select

    from app.models import District, MarketplaceCategory, User, UserOAuthIdentity, Ward
    from app.services.banned_keywords import banned_keywords
    from app.services.service_area import in_service_area
    from app.utils import find_nearest_ward_id

    errors: list[str] = []
    emails = {it["email"].strip().lower() for it in items}
    rows = (
        await db.execute(
            select(func.lower(UserOAuthIdentity.email), User.id)
            .join(User, User.id == UserOAuthIdentity.user_id)
            .where(func.lower(UserOAuthIdentity.email).in_(emails), User.deleted_at.is_(None))
        )
    ).all()
    by_email: dict[str, set[uuid.UUID]] = {}
    for em, uid in rows:
        by_email.setdefault(em, set()).add(uid)
    missing = sorted(emails - by_email.keys())
    if missing:
        errors.append("users 에 없는 email: " + ", ".join(missing))
    errors += [f"email 이 여러 user 에 연결됨: {em}" for em, ids in by_email.items() if len(ids) > 1]

    cats = {c.code: c.id for c in (await db.execute(select(MarketplaceCategory))).scalars()}
    dists = {d.code: d for d in (await db.execute(select(District))).scalars()}
    wards = {w.code: w for w in (await db.execute(select(Ward).where(Ward.is_active == True))).scalars()}
    banned = await banned_keywords(db)
    plan: dict[int, dict] = {}
    for it in items:
        tag = f"#{it['no']}"
        if it["file"] not in names:
            errors.append(f"{tag}: 번들에 {it['file']} 없음")
        if it["category_code"] not in cats:
            errors.append(f"{tag}: 알 수 없는 category_code {it['category_code']}")
        d = dists.get(it["district"])
        if d is None or d.center_lat is None or d.center_lng is None:
            errors.append(f"{tag}: 구 {it['district']} 없음 또는 중심 좌표 없음")
            continue
        if any(kw in f"{it['title']} {it['description']}".lower() for kw in banned):
            errors.append(f"{tag}: 금칙어 포함")
        lat0, lng0 = d.center_lat, d.center_lng
        if it.get("ward"):
            w = wards.get(it["ward"])
            if w is None:
                errors.append(f"{tag}: 알 수 없는 ward {it['ward']}")
                continue
            lat0, lng0 = w.center_lat, w.center_lng
        ward_id = lat = lng = None
        for radius in SPREAD_RADII_M:
            lat, lng = _spread(it["no"], lat0, lng0, radius)
            ward_id = await find_nearest_ward_id(db, lat, lng) if in_service_area(lat, lng) else None
            if ward_id is not None:
                break
        if ward_id is None:
            errors.append(f"{tag}: 구 {it['district']} 중심 근처에서 ward 가 배정되지 않음")
        seller = by_email.get(it["email"].strip().lower())
        plan[it["no"]] = {
            "seller_id": next(iter(seller)) if seller and len(seller) == 1 else None,
            "category_id": cats.get(it["category_code"]),
            "district_id": d.id,
            "ward_id": ward_id,
            "lat": lat,
            "lng": lng,
        }
    return (None if errors else plan), errors


async def do_import(bundle: str, dry: bool) -> None:
    from sqlalchemy import select

    from app.database import AsyncSessionLocal
    from app.models import Content, MarketplaceListing, MarketplaceListingImage
    from app.services import noti_events
    from app.services.listing_fingerprint import compute_dhash, compute_text_simhash
    from app.services.listing_state import log_transition
    from app.services.search_index import immediate_blob
    from app.services.search_norm import norm
    from app.services.translate import warm_translations

    created = 0
    with tarfile.open(bundle) as tar:
        items = _load_bundle(tar)
        names = set(tar.getnames())
        async with AsyncSessionLocal() as db:
            plan, errors = await _preflight(db, items, names)
            if plan is None:
                print("사전검사 실패 — 아무것도 쓰지 않고 중단:\n" + "\n".join(f"  - {e}" for e in errors))
                sys.exit(1)
            existing = set(
                (
                    await db.execute(
                        select(MarketplaceListing.id).where(
                            MarketplaceListing.id.in_([_did("listing", it["no"]) for it in items])
                        )
                    )
                ).scalars()
            )
            now = datetime.now(UTC)
            todo = [(i, it) for i, it in enumerate(items) if _did("listing", it["no"]) not in existing]
            for em in sorted({it["email"] for _, it in todo}):
                print(f"[{em}]")
                for _, it in todo:
                    if it["email"] == em:
                        print(f"  create #{it['no']} {it['title'][:40]!r} {it['price_vnd']:,}đ {it['district']}")
            print(f"{len(todo)} to create, {len(items) - len(todo)} already exist")
            if dry:
                print("dry-run: nothing written")
                return
            for i, it in todo:
                p, lid = plan[it["no"]], _did("listing", it["no"])
                created_at = now - timedelta(minutes=60 + 37 * i)
                bumped_at = now - timedelta(minutes=11 * i)
                try:
                    data = tar.extractfile(it["file"]).read()
                    cid = _did("content", it["no"])
                    rel = f"user-contents/{now.year}/{now.month:02d}"
                    file_path = f"{rel}/{cid}.webp"
                    (CONTENTS_BASE / rel).mkdir(parents=True, exist_ok=True)  # 파일 먼저, 그다음 DB
                    (CONTENTS_BASE / file_path).write_bytes(data)
                    title = it["title"].strip()
                    db.add(
                        Content(
                            id=cid,
                            owner_type="user",
                            owner_id=p["seller_id"],
                            file_path=file_path,
                            mime_type="image/webp",
                            original_filename=it["original_filename"],
                            file_size=len(data),
                            phash=compute_dhash(data),
                        )
                    )
                    await db.flush()
                    db.add(
                        MarketplaceListing(
                            id=lid,
                            seller_id=p["seller_id"],
                            category_id=p["category_id"],
                            title=title,
                            description=it["description"],
                            price_vnd=it["price_vnd"],
                            status="ON_SALE",
                            district_id=p["district_id"],
                            ward_id=p["ward_id"],
                            latitude=Decimal(str(p["lat"])),
                            longitude=Decimal(str(p["lng"])),
                            bumped_at=bumped_at,
                            created_at=created_at,
                            updated_at=bumped_at,
                            search_blob=immediate_blob([title, it["description"]]),
                            text_fingerprint=compute_text_simhash(norm(f"{title} {it['description']}")),
                        )
                    )
                    await db.flush()
                    db.add(
                        MarketplaceListingImage(
                            id=_did("image", it["no"]), listing_id=lid, content_id=cid, sort_order=0
                        )
                    )
                    noti_events.enqueue(
                        db,
                        "market.listing_created",
                        {
                            "listing_id": str(lid),
                            "title": title,
                            "seller_id": str(p["seller_id"]),
                            "price_vnd": it["price_vnd"],
                        },
                    )
                    noti_events.enqueue(
                        db,
                        "search.reindex",
                        {"entity_type": "listing", "entity_id": str(lid), "texts": [title, it["description"]]},
                    )
                    log_transition(
                        db, lid, None, "ON_SALE", actor_type="system", actor_id=p["seller_id"], reason="seed_import"
                    )
                    await db.commit()
                    created += 1
                    print(f"created #{it['no']} {lid}")
                    await warm_translations([title, it["description"]])  # 앱의 background.add_task 와 동일(실패 삼킴)
                except Exception as e:  # 매물 단위 격리 — 나머지는 계속, 재실행하면 이어서 처리
                    await db.rollback()
                    print(f"! failed #{it['no']} {lid}: {e!r}")
    print(f"imported {created} new; rerun is safe")


# ── withdraw (컨테이너) ─────────────────────────────────────────────────
async def do_withdraw(bundle: str, dry: bool) -> None:
    from sqlalchemy import select

    from app.database import AsyncSessionLocal
    from app.models import MarketplaceListing
    from app.services.listing_state import log_transition

    with tarfile.open(bundle) as tar:
        ids = [_did("listing", it["no"]) for it in _load_bundle(tar)]
    async with AsyncSessionLocal() as db:
        rows = (await db.execute(select(MarketplaceListing).where(MarketplaceListing.id.in_(ids)))).scalars().all()
        n = 0
        for li in rows:
            if li.status not in ("ON_SALE", "RESERVED"):
                print(f"keep {li.id} {li.title[:40]!r} ({li.status})")
                continue
            print(f"withdraw {li.id} {li.title[:40]!r} ({li.status})")
            n += 1
            if not dry:
                log_transition(db, li.id, li.status, "WITHDRAWN", actor_type="system", reason="seed_withdraw")
                li.status, li.updated_at = "WITHDRAWN", datetime.now(UTC)
        if not dry:
            await db.commit()
    print(f"{n} listings {'would be ' if dry else ''}withdrawn ({len(ids) - len(rows)} not found)")


def main() -> None:
    p = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    sub = p.add_subparsers(dest="cmd", required=True)
    k = sub.add_parser("pack")
    k.add_argument("--json", required=True)
    k.add_argument("--images-root", required=True)
    k.add_argument("--map", required=True, help="group→email 매핑 json")
    k.add_argument("--out", required=True)
    for name in ("import", "withdraw"):
        s = sub.add_parser(name)
        s.add_argument("--bundle", required=True)
        s.add_argument("--dry-run", action="store_true")
    a = p.parse_args()
    if a.cmd == "pack":
        do_pack(a.json, a.images_root, a.map, a.out)
    elif a.cmd == "import":
        asyncio.run(do_import(a.bundle, a.dry_run))
    else:
        asyncio.run(do_withdraw(a.bundle, a.dry_run))


if __name__ == "__main__":
    main()
