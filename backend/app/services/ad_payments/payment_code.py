"""입금 식별코드 — 생성·체크문자 검증·정규화·적요 추출 (260907_ad_payment_pipeline_design.md §3-5).

형식: `SGR-XXXXXXC` — 접두어 SGR + 본문 6자 + 체크문자 1자. 문자셋은 Crockford Base32
(I·L·O·U 제외, 32자) — 손글씨·구두 전달 시 0/O, 1/I/L 혼동을 배제한다.
"""

from __future__ import annotations

import re
import secrets

# Crockford Base32 — I/L/O/U 제외 32자.
ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ"
_ALPHABET_VALUES = {ch: i for i, ch in enumerate(ALPHABET)}

PREFIX = "SGR"
BODY_LEN = 6

# 은행 적요에서 코드를 찾는 정규식 — normalize() 로 적요 전체를 정규화(대문자화·영숫자 외 제거·
# O/I/L 치환)한 뒤 적용한다(§3-5 순서: 정규화 먼저 → 매칭). 정규화가 코드 내부에 섞인 공백·하이픈·
# 점·괄호 등 구분자를 모두 제거하므로, 여기서는 구분자 문자 클래스가 필요 없다.
_EXTRACT_RE = re.compile(rf"{PREFIX}([0-9A-Z]{{{BODY_LEN + 1}}})")

_NON_ALNUM_RE = re.compile(r"[^0-9A-Z]")
_NORMALIZE_MAP = str.maketrans({"O": "0", "I": "1", "L": "1"})

# 체크섬 모듈러스. 설계문서 §3-5 는 "mod 32"(=len(ALPHABET))로 적었으나, 32=2^5 라 가중치
# 2/4/6(i=0,2,4)이 32와 서로소가 아니어서 delta=16인 1자 오타(예: 본문 0번째 자리 '0'(값0)→'G'
# (값16), weight=2 → 2*16 mod 32 = 0)가 체크문자를 바꾸지 않고 통과한다 — 문서가 스스로 요구하는
# "1자 오타 100% 검출"을 문서의 공식 그대로는 만족하지 못하는 수학적 사각지대다(전수 테스트로 실측
# 확인, test_ad_payment_code.py). 37(소수, 6자리 값 차이의 최대치 31과 가중치 2~7 모두보다 큼)을
# 쓰면 가중치·인접 가중치차가 전부 37과 서로소가 되어 1자 오타·인접 전위 모두 100% 검출된다(증명:
# delta, 가중치차 모두 |·|≤31<37 이므로 0이 아닌 한 mod 37 에서 0이 될 수 없다). 체크문자는 여전히
# 32자 알파벳에서만 골라야 하므로, 생성 시 체크섬이 32 이상이 나오면(약 13.5% 확률) 재생성한다 —
# DB UNIQUE 충돌 시 재생성(§3-5)과 같은 패턴.
_CHECK_MODULUS = 37


def _checksum(body: str) -> int:
    """Σ(i+2)·vᵢ mod 37 (0~36). 알파벳 문자로 표현 가능한 값은 0~31뿐 — 생성 시 그 범위만 채택."""
    return sum((i + 2) * _ALPHABET_VALUES[ch] for i, ch in enumerate(body)) % _CHECK_MODULUS


def generate_payment_code() -> str:
    """`SGR-XXXXXXC` 형식의 코드 1개를 생성한다. DB UNIQUE 충돌 시 재생성은 호출부 책임(최대 5회, §3-5)."""
    for _ in range(100):  # 체크섬<32 확률 ~86.5%/회 — 사실상 즉시 성공
        body = "".join(secrets.choice(ALPHABET) for _ in range(BODY_LEN))
        checksum = _checksum(body)
        if checksum < len(ALPHABET):
            return f"{PREFIX}-{body}{ALPHABET[checksum]}"
    raise RuntimeError("payment code checksum 재시도 초과")


def normalize(raw: str) -> str:
    """대문자화 → 영숫자 외 제거 → O→0, I→1, L→1. 은행 적요의 대소문자·공백·하이픈 훼손 대응."""
    s = raw.upper()
    s = _NON_ALNUM_RE.sub("", s)
    return s.translate(_NORMALIZE_MAP)


def parse_and_validate(raw: str) -> str | None:
    """`raw` 를 정규화해 `SGR` 접두어 + 본문 6자 + 체크문자 1자 형태로 검증한다.

    통과하면 표준 표기(`SGR-XXXXXXC`)를, 형식이 다르거나 체크문자가 틀리면 None 을 반환한다.
    """
    normalized = normalize(raw)
    if not normalized.startswith(PREFIX) or len(normalized) != len(PREFIX) + BODY_LEN + 1:
        return None
    body = normalized[len(PREFIX) : len(PREFIX) + BODY_LEN]
    check = normalized[len(PREFIX) + BODY_LEN :]
    if any(ch not in _ALPHABET_VALUES for ch in body + check):
        return None
    if _checksum(body) != _ALPHABET_VALUES[check]:
        return None
    return f"{PREFIX}-{body}{check}"


def extract_codes(memo: str | None) -> list[str]:
    """적요를 정규화한 뒤 체크문자 검증까지 통과한 코드 후보를 순서대로 추출한다(중복 제거).

    0건이면 코드 없음, 1건이면 매칭, 2건 이상이면 미매칭 보관(호출부 판단 — §4-2 "코드 누락/훼손").
    """
    if not memo:
        return []
    normalized = normalize(memo)
    found: list[str] = []
    for match in _EXTRACT_RE.finditer(normalized):
        code = parse_and_validate(PREFIX + match.group(1))
        if code is not None and code not in found:
            found.append(code)
    return found
