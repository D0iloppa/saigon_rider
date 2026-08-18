"""이미지·텍스트 지문 산출 — 016 §4-3 #38.

D-34=(a): 지문은 **지금부터 산출·저장**하고, 판정(자동 경보·차단)은 L2로 미룬다(강제제약 #4 —
L2 시점에 비교할 과거가 없으면 판정이 무의미하다). 이 모듈은 산출 함수만 제공하고, 자동
차단·자동 판정 로직은 포함하지 않는다(M1, 016 §12 명시기각 — 자동 차단).

이미지: dHash(그레이스케일 그라디언트 해시) — Pillow 만으로 자체 계산한다. 외부 AI 이미지
판별 API 는 016 §12 명시기각(A1 + PDPL 이미지 국외 전송).
텍스트: search_norm.norm() 정규화 문자열의 word-shingle simhash(64bit) — 표준 라이브러리만 사용.
"""

import hashlib
import io

from PIL import Image

_HASH_SIZE = 8  # dHash 64bit (8x8 그라디언트)
_SIMHASH_BITS = 64


def compute_dhash(image_bytes: bytes) -> str | None:
    """dHash — 리사이즈/재압축/경미한 크롭에 강한 저비용 perceptual hash.
    디코딩 실패(손상 파일 등)는 None 을 반환한다 — 업로드 자체를 막지 않는다(부가 기능)."""
    try:
        img = Image.open(io.BytesIO(image_bytes)).convert("L").resize((_HASH_SIZE + 1, _HASH_SIZE), Image.LANCZOS)
        pixels = list(img.getdata())
    except Exception:
        return None
    value = 0
    for row in range(_HASH_SIZE):
        offset = row * (_HASH_SIZE + 1)
        for col in range(_HASH_SIZE):
            value = (value << 1) | (1 if pixels[offset + col] < pixels[offset + col + 1] else 0)
    return f"{value:016x}"


def compute_text_simhash(normalized_text: str) -> str | None:
    """simhash — search_norm.norm() 으로 이미 정규화된 문자열을 받는다(호출부 책임).
    빈 문자열은 None(지문 없음)."""
    tokens = normalized_text.split()
    if not tokens:
        return None
    shingles = {" ".join(tokens[i : i + 3]) for i in range(len(tokens) - 2)} if len(tokens) >= 3 else set(tokens)
    weights = [0] * _SIMHASH_BITS
    for shingle in shingles:
        digest = int(hashlib.sha256(shingle.encode("utf-8")).hexdigest(), 16)
        for bit in range(_SIMHASH_BITS):
            weights[bit] += 1 if (digest >> bit) & 1 else -1
    value = 0
    for bit in range(_SIMHASH_BITS):
        if weights[bit] > 0:
            value |= 1 << bit
    return f"{value:016x}"
