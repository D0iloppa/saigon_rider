"""검색 정규화 헬퍼 — 다국어 search_blob 의 쓰기/읽기 양쪽에서 공유하는 단일 함수.

실측(260801_multilingual_search_design.md §4.2): DB `unaccent()` 를 쿼리에서 쓰면
Seq Scan 이 되어 pg_trgm GIN 인덱스가 무용해진다. 그래서 정규화는 Python(쓰기 시점)에서
미리 수행하고, 컬럼엔 이미 정규화된 문자열만 저장한다 — 쿼리 쪽 표현식 인덱스가 필요 없다.
"""

import re
import unicodedata

_WS = re.compile(r"\s+")


def norm(s: str | None) -> str:
    """검색 정규화: NFD 분해 → 결합기호(성조 등) 제거 → NFC → lower → 공백 압축.

    베트남어 성조 제거(unaccent 상당) + đ/Đ 는 d 로 별도 치환(NFD 로 분해되지 않음).
    한글은 결합기호가 없어 그대로 복원된다(무해).
    """
    s = unicodedata.normalize("NFD", s or "")
    s = "".join(c for c in s if unicodedata.category(c) != "Mn")
    s = unicodedata.normalize("NFC", s).replace("đ", "d").replace("Đ", "d")
    return _WS.sub(" ", s).strip().lower()
