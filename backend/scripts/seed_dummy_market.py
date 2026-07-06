"""SGR-310 후속 — 동네지도 37개 ward 폴리곤(frontend depth1)에 맞춰
wards 테이블을 채우고, ward마다 더미 마켓 상품을 시딩한다.

배경: wards 테이블이 비어있어(0행) 지도에 그려지는 37개 ward 폴리곤과
marketplace_listings.ward_id가 전혀 연결되지 않은 상태였음. OSM 전체
임포트(ward_import.py, 168개 목표)는 지도 SVG 아트(37개)와 범위가 달라
이 스크립트는 실제 그려지는 37개만 정확히 채운다.

Usage:
    DATABASE_URL=postgresql://user:pw@host:5432/db \\
    python -m scripts.seed_dummy_market [--per-ward 5] [--dry-run]
"""

import argparse
import json
import os
import random
import sys
import unicodedata
import uuid
from pathlib import Path

import psycopg2

from scripts.assign_wards import haversine_m

# 지도 SVG 아트의 SoT — 여기서 wards[].{slug,n,gps}를 그대로 읽는다.
# 하드카피를 두면 JSON 변경 후 재시드 시 stale 좌표가 upsert되어
# 폴리곤↔wards 테이블 불일치(SGR-310 유형)가 재발한다.
DEPTH1_JSON = Path(__file__).resolve().parents[2] / "frontend/src/components/maps/v2/saigon-depth1.json"


def load_depth1_wards() -> list[tuple[str, str, float, float]]:
    data = json.loads(DEPTH1_JSON.read_text(encoding="utf-8"))
    wards = [
        (w["slug"], w["n"], w["gps"]["lat"], w["gps"]["lng"])
        for w in data["wards"]
        if w.get("slug") and w.get("n") and w.get("gps")
    ]
    if not wards:
        print(f"ERROR: {DEPTH1_JSON} 에서 ward를 읽지 못했습니다.", file=sys.stderr)
        sys.exit(1)
    return wards


# 기존 마켓 더미(system/marketplace/*.jpg)의 contents.id — 오토바이 카테고리용
BIKE_CONTENT_IDS = [
    "c0000000-0000-4000-8000-000000000001",
    "c0000000-0000-4000-8000-000000000002",
    "c0000000-0000-4000-8000-000000000003",
    "c0000000-0000-4000-8000-000000000004",
    "c0000000-0000-4000-8000-000000000005",
    "c0000000-0000-4000-8000-000000000006",
    "c0000000-0000-4000-8000-000000000007",
    "c0000000-0000-4000-8000-000000000008",
    "c0000000-0000-4000-8000-000000000009",
    "c0000000-0000-4000-8000-00000000000a",
    "c0000000-0000-4000-8000-00000000000b",
]

# system/mock/mock-0N.jpg 의 contents.id — 그 외 카테고리 범용 플레이스홀더
MOCK_CONTENT_IDS = [
    "93e10211-3d73-4f00-91c4-d3b0c1c95723",
    "9cc6a515-5fa6-40a1-ae30-d20df38359bc",
    "830364ac-c336-42fb-8740-ab29abb4cd54",
    "5509974c-9fec-4313-8c33-56e899ff8edd",
    "86b86aac-9e52-46d2-9322-62f8179f6068",
]

# leaf category_id -> (titles, price_min, price_max, is_moto)
LEAF_CATALOG = {
    1: (["Phụ tùng xe máy chính hãng", "Bộ phụ tùng thay thế"], 50_000, 500_000, True),
    2: (["Áo giáp bảo hộ đi xe", "Bộ đồ bảo hộ đi mưa"], 100_000, 600_000, True),
    3: (["Ốp gương xe máy", "Bao tay lái chống nắng"], 30_000, 300_000, True),
    4: (["Honda Wave 2019 — còn đẹp", "Yamaha Exciter 150 chính chủ"], 8_000_000, 35_000_000, True),
    22: (["Nhớt Motul 4T 1L", "Bộ lọc nhớt + nhớt thay"], 50_000, 300_000, True),
    23: (["Mũ bảo hiểm 3/4 mới 95%", "Nón fullface size L"], 150_000, 700_000, True),
    24: (["iPhone 12 64GB quốc tế", "Samsung Galaxy A52 like new"], 2_000_000, 12_000_000, False),
    25: (["Laptop Dell Inspiron i5", "MacBook Air M1 2020"], 5_000_000, 20_000_000, False),
    26: (["iPad Gen 9 wifi 64GB"], 3_000_000, 9_000_000, False),
    27: (["Máy ảnh Canon EOS M10"], 2_000_000, 8_000_000, False),
    28: (["Tai nghe Bluetooth Sony"], 200_000, 2_000_000, False),
    29: (["Máy PS4 Slim 500GB kèm 2 tay cầm"], 2_000_000, 6_000_000, False),
    30: (["Đồng hồ thông minh Xiaomi"], 300_000, 2_000_000, False),
    31: (["Sạc dự phòng 20000mAh"], 100_000, 500_000, False),
    32: (["Tủ lạnh mini 90L"], 1_000_000, 4_000_000, False),
    33: (["Máy giặt Electrolux 8kg"], 2_000_000, 6_000_000, False),
    34: (["Máy lạnh Panasonic 1HP đã qua sử dụng"], 2_000_000, 7_000_000, False),
    35: (["Smart TV Samsung 43 inch"], 2_000_000, 6_000_000, False),
    36: (["Nồi cơm điện Cuckoo"], 200_000, 800_000, False),
    37: (["Máy hút bụi cầm tay"], 300_000, 1_500_000, False),
    38: (["Quạt điện đứng Senko"], 100_000, 500_000, False),
    39: (["Nệm cao su Kymdan 1m6"], 1_000_000, 4_000_000, False),
    40: (["Sofa góc da simili"], 1_500_000, 5_000_000, False),
    41: (["Bàn học gỗ + ghế"], 300_000, 1_200_000, False),
    42: (["Tủ nhựa 5 tầng"], 200_000, 800_000, False),
    43: (["Đèn bàn học LED"], 50_000, 200_000, False),
    44: (["Tranh treo tường decor"], 50_000, 300_000, False),
    45: (["Kệ giày mini"], 100_000, 400_000, False),
    46: (["Bộ nồi inox 3 món"], 200_000, 600_000, False),
    47: (["Bộ chén đĩa sứ 12 món"], 100_000, 400_000, False),
    48: (["Bộ dao kéo bếp"], 50_000, 250_000, False),
    49: (["Thùng đựng gạo nhựa"], 50_000, 200_000, False),
    50: (["Set quần áo trẻ em 2-4 tuổi"], 50_000, 200_000, False),
    51: (["Xe đẩy em bé Fatz"], 500_000, 2_000_000, False),
    52: (["Bộ đồ chơi xếp hình Lego"], 100_000, 500_000, False),
    53: (["Nôi cũi gỗ cho bé"], 500_000, 2_000_000, False),
    54: (["Bình sữa + máy hâm sữa"], 100_000, 400_000, False),
    55: (["Áo sơ mi nữ công sở"], 50_000, 200_000, False),
    56: (["Giày cao gót size 36"], 100_000, 350_000, False),
    57: (["Túi xách nữ da PU"], 150_000, 500_000, False),
    58: (["Vòng tay bạc 925"], 100_000, 400_000, False),
    59: (["Áo khoác nam da PU"], 150_000, 500_000, False),
    60: (["Giày sneaker nam size 41"], 200_000, 600_000, False),
    61: (["Balo laptop nam"], 150_000, 450_000, False),
    62: (["Dây lưng da nam"], 80_000, 250_000, False),
    63: (["Bộ dưỡng da Innisfree"], 150_000, 500_000, False),
    64: (["Bảng phấn mắt 12 màu"], 100_000, 350_000, False),
    65: (["Nước hoa mini 30ml"], 200_000, 600_000, False),
    66: (["Máy uốn tóc mini"], 150_000, 450_000, False),
    67: (["Máy rửa mặt Foreo like new"], 300_000, 900_000, False),
    68: (["Bộ tạ tay 10kg"], 200_000, 600_000, False),
    69: (["Xe đạp thể thao Giant"], 2_000_000, 6_000_000, False),
    70: (["Bộ gậy golf tập"], 1_000_000, 3_000_000, False),
    71: (["Lều cắm trại 4 người"], 500_000, 1_500_000, False),
    72: (["Vợt cầu lông Yonex"], 200_000, 600_000, False),
    73: (["Bộ bài Uno + board game"], 50_000, 200_000, False),
    74: (["Đàn guitar acoustic"], 800_000, 2_500_000, False),
    75: (["Mô hình Gundam sưu tầm"], 200_000, 800_000, False),
    76: (["Bộ màu vẽ Winsor"], 150_000, 500_000, False),
    77: (["Ống nhòm du lịch"], 150_000, 450_000, False),
    78: (["Sách kỹ năng sống (combo 5 cuốn)"], 50_000, 150_000, False),
    79: (["Sách giáo khoa lớp 10 (bộ)"], 80_000, 200_000, False),
    80: (["Truyện tranh One Piece (10 tập)"], 100_000, 250_000, False),
    81: (["Sách tô màu cho bé"], 30_000, 100_000, False),
    82: (["Voucher ăn uống 200k"], 150_000, 190_000, False),
    83: (["Vé xem concert (2 vé)"], 500_000, 1_500_000, False),
    84: (["Voucher khách sạn Đà Lạt 2N1Đ"], 300_000, 900_000, False),
    85: (["Combo mứt Tết handmade"], 100_000, 300_000, False),
    86: (["Sữa hạt dinh dưỡng (hộp)"], 150_000, 400_000, False),
    87: (["Cà phê rang xay 500g"], 80_000, 200_000, False),
    88: (["Thức ăn cho mèo Royal Canin 2kg"], 150_000, 400_000, False),
    89: (["Lồng vận chuyển thú cưng"], 200_000, 600_000, False),
    90: (["Cát vệ sinh cho mèo (bao 10kg)"], 100_000, 250_000, False),
    91: (["Cây kim tiền để bàn"], 50_000, 200_000, False),
    92: (["Cây mai nhỏ chưng Tết"], 200_000, 800_000, False),
    93: (["Chậu sứ trồng cây (bộ 3)"], 80_000, 250_000, False),
    21: (["Đồ dùng cũ thanh lý"], 50_000, 300_000, False),
}
LEAF_IDS = list(LEAF_CATALOG.keys())

# 개발용 테스트 계정(SaigonRider) — 채팅 테스트를 위해 등록자를 이 계정으로 고정
SELLER_ID = "d80efb02-8a43-4e55-830a-050d7bf4403b"


def ascii_name(name_vi: str) -> str:
    decomposed = unicodedata.normalize("NFKD", name_vi)
    stripped = "".join(c for c in decomposed if not unicodedata.combining(c))
    return stripped.replace("Đ", "D").replace("đ", "d")


def upsert_wards(cur, depth1_wards: list[tuple[str, str, float, float]]) -> dict[str, int]:
    for idx, (slug, name_vi, lat, lng) in enumerate(depth1_wards):
        code = f"HCMC_{slug.upper().replace('-', '_')}"
        cur.execute(
            """
            INSERT INTO wards (code, city_code, name_vi, name_en, center_lat, center_lng, sort_order)
            VALUES (%s, 'HCMC', %s, %s, %s, %s, %s)
            ON CONFLICT (code) DO UPDATE SET
                name_vi = EXCLUDED.name_vi, name_en = EXCLUDED.name_en,
                center_lat = EXCLUDED.center_lat, center_lng = EXCLUDED.center_lng,
                sort_order = EXCLUDED.sort_order
            """,
            (code, name_vi, ascii_name(name_vi), lat, lng, idx),
        )
    cur.execute("SELECT code, id, center_lat, center_lng FROM wards WHERE city_code = 'HCMC'")
    return {row[0]: row for row in cur.fetchall()}


def nearest_district_id(lat: float, lng: float, districts: list[tuple[int, float, float]]) -> int | None:
    if not districts:
        return None
    return min(districts, key=lambda d: haversine_m(lat, lng, d[1], d[2]))[0]


def round_price(v: float) -> int:
    return round(v / 10_000) * 10_000


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--per-ward", type=int, default=5)
    parser.add_argument("--dry-run", action="store_true")
    parser.add_argument("--seed", type=int, default=42)
    args = parser.parse_args()

    random.seed(args.seed)

    db_url = os.getenv("DATABASE_URL", "")
    if not db_url:
        print("ERROR: DATABASE_URL not set", file=sys.stderr)
        sys.exit(1)
    db_url = db_url.replace("postgresql+asyncpg://", "postgresql://")

    conn = psycopg2.connect(db_url)
    conn.autocommit = False
    cur = conn.cursor()

    try:
        depth1_wards = load_depth1_wards()
        ward_rows = upsert_wards(cur, depth1_wards)
        print(f"[wards] {len(ward_rows)}개 upsert 완료")

        cur.execute("SELECT id, center_lat, center_lng FROM districts WHERE center_lat IS NOT NULL")
        districts = cur.fetchall()

        cur.execute("SELECT 1 FROM users WHERE id = %s", (SELLER_ID,))
        if not cur.fetchone():
            print(f"ERROR: 판매자 계정({SELLER_ID})을 찾을 수 없습니다.", file=sys.stderr)
            sys.exit(1)

        if args.dry_run:
            print(
                f"[dry-run] {len(ward_rows)}개 ward x {args.per_ward}건 = {len(ward_rows) * args.per_ward}건 생성 예정, DB 반영 안 함."
            )
            return

        created = 0
        for slug, _name_vi, _, _ in depth1_wards:
            code = f"HCMC_{slug.upper().replace('-', '_')}"
            _, ward_id, w_lat, w_lng = ward_rows[code]

            for _ in range(args.per_ward):
                leaf_id = random.choice(LEAF_IDS)
                titles, pmin, pmax, is_moto = LEAF_CATALOG[leaf_id]
                title = random.choice(titles)
                price = round_price(random.uniform(pmin, pmax))
                is_negotiable = random.random() < 0.4
                original_price = round_price(price * 1.15) if is_negotiable else None
                status_roll = random.random()
                status = "ON_SALE" if status_roll < 0.85 else ("RESERVED" if status_roll < 0.93 else "SOLD")

                lat = w_lat + random.uniform(-0.004, 0.004)
                lng = w_lng + random.uniform(-0.004, 0.004)
                district_id = nearest_district_id(lat, lng, districts)

                listing_id = str(uuid.uuid4())
                content_id = random.choice(BIKE_CONTENT_IDS if is_moto else MOCK_CONTENT_IDS)

                cur.execute(
                    """
                    INSERT INTO marketplace_listings
                        (id, seller_id, category_id, title, price_vnd, original_price_vnd,
                         is_negotiable, status, district_id, ward_id, latitude, longitude)
                    VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
                    """,
                    (
                        listing_id,
                        SELLER_ID,
                        leaf_id,
                        title,
                        price,
                        original_price,
                        is_negotiable,
                        status,
                        district_id,
                        ward_id,
                        lat,
                        lng,
                    ),
                )
                cur.execute(
                    """
                    INSERT INTO marketplace_listing_images (id, listing_id, content_id, sort_order)
                    VALUES (%s, %s, %s, 0)
                    """,
                    (str(uuid.uuid4()), listing_id, content_id),
                )
                created += 1

        conn.commit()
        print(f"[완료] {created}건 더미 매물 생성 (ward {len(ward_rows)}개 x {args.per_ward}건)")

    except Exception:
        conn.rollback()
        raise
    finally:
        cur.close()
        conn.close()


if __name__ == "__main__":
    main()
