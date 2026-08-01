"""퀘스트 메인(카드) 이미지에서 썸네일·배너 파생 파일을 생성한다.

원본:  contents/system/quest-cards/card-{CODE}.png   (메인, 047 시드)
출력:  contents/system/quest-cards/thumb-{CODE}.png   (리스트 썸네일, 480x300)
       contents/system/quest-cards/banner-{CODE}.png  (홈/이벤트 배너, 1200x400 중앙 crop)

crop 은 imgproxy 로 처리(별도 이미지 라이브러리 불필요). 생성된 파일은 repo 에 커밋하고,
contents 행 등록 + 퀘스트 슬롯 매핑은 database/init/058_quest_derived_image_seed.sql 가 담당한다.

실행:  docker compose exec bff python -m scripts.generate_quest_derived_images
"""

import base64
import os
from pathlib import Path

import httpx

CONTENTS_BASE_PATH = Path(os.getenv("CONTENTS_BASE_PATH", "/data"))
IMGPROXY_INTERNAL_URL = os.getenv("IMGPROXY_INTERNAL_URL", "http://imgproxy:8080")
CARD_DIR = "system/quest-cards"

# 파생 정의: (출력 prefix, imgproxy 처리 옵션)
DERIVATIVES = [
    ("thumb", "rs:fill:480:300:1"),
    ("banner", "rs:fill:1200:400:1/g:ce"),
]


def _imgproxy_fetch(file_path: str, options: str) -> bytes:
    source = f"local:///{file_path}"
    encoded = base64.urlsafe_b64encode(source.encode()).rstrip(b"=").decode()
    url = f"{IMGPROXY_INTERNAL_URL}/insecure/{options}/{encoded}"
    resp = httpx.get(url, timeout=30)
    resp.raise_for_status()
    return resp.content


def main() -> None:
    card_dir = CONTENTS_BASE_PATH / CARD_DIR
    cards = sorted(card_dir.glob("card-*.png"))
    if not cards:
        raise SystemExit(f"카드 원본을 찾을 수 없음: {card_dir}/card-*.png")

    made = 0
    for card in cards:
        code = card.stem[len("card-") :]
        for prefix, options in DERIVATIVES:
            out_path = card_dir / f"{prefix}-{code}.png"
            data = _imgproxy_fetch(f"{CARD_DIR}/card-{code}.png", options)
            out_path.write_bytes(data)
            made += 1
            print(f"  {prefix}-{code}.png  ({len(data):,} bytes)")
    print(f"완료: {len(cards)} 카드 × {len(DERIVATIVES)} 파생 = {made} 파일")


if __name__ == "__main__":
    main()
