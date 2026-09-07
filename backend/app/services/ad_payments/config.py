"""seam-A/C 배선 여부 (260907_ad_payment_pipeline_design.md §2-2, 260907_toss_payment_rail_design.md §5-1).

`.env` 값을 읽기만 한다 — 파일 수정(.env/.env.example)은 별건. 계좌 3키는 비밀 아님(광고주에게
공개되는 정보)이라 값을 로그에 남겨도 무방하지만, 그래도 절대 하드코딩하지 않는다. **토스 2키
(클라이언트·시크릿)를 읽는 코드는 이 파일 하나뿐이어야 한다** — 절대 경계(design §5-4/§8 P2-8
grep 테스트). 시크릿 키는 이 모듈 밖으로 절대 반환하지 않는다(get_toss_client_key 만 공개).
"""

from __future__ import annotations

import os
from typing import Literal

_BANK_NAME_ENV = "AD_PAYMENT_BANK_NAME"
_BANK_ACCOUNT_NO_ENV = "AD_PAYMENT_BANK_ACCOUNT_NO"
_BANK_ACCOUNT_HOLDER_ENV = "AD_PAYMENT_BANK_ACCOUNT_HOLDER"

_ENV_KEYS = (_BANK_NAME_ENV, _BANK_ACCOUNT_NO_ENV, _BANK_ACCOUNT_HOLDER_ENV)

# 공개 별칭 — 배선 여부 배너(admin_api/biz_contracts.py)가 "값 없음, 키 이름만" 읽기용으로 import 한다.
BANK_ENV_KEYS = _ENV_KEYS


def bank_wiring_ready() -> bool:
    """세 값이 모두 있어야 True. 하나라도 비면 미배선."""
    return all(os.getenv(key, "").strip() for key in _ENV_KEYS)


def get_bank_info() -> dict[str, str] | None:
    """배선됐으면 `{name, account_no, holder}`, 미배선이면 None."""
    if not bank_wiring_ready():
        return None
    return {
        "name": os.environ[_BANK_NAME_ENV].strip(),
        "account_no": os.environ[_BANK_ACCOUNT_NO_ENV].strip(),
        "holder": os.environ[_BANK_ACCOUNT_HOLDER_ENV].strip(),
    }


# ── seam-C: 토스 카드 결제 레일 (260907_toss_payment_rail_design.md §5-1/§5-3) ──

_TOSS_CLIENT_KEY_ENV = "AD_PAYMENT_TOSS_CLIENT_KEY"
_TOSS_SECRET_KEY_ENV = "AD_PAYMENT_TOSS_SECRET_KEY"
_TOSS_STUB_ENV = "AD_PAYMENT_TOSS_STUB"

# 공개 별칭 — 배선 배너(admin_api, P2-6 범위)가 "값 없음, 키 이름만" 읽기용으로 import 한다.
TOSS_ENV_KEYS = (_TOSS_CLIENT_KEY_ENV, _TOSS_SECRET_KEY_ENV, _TOSS_STUB_ENV)

# main.py:_DOCS_ENABLED 와 같은 fail-safe 화이트리스트 값(같은 판정을 여기서도 재사용) — 순환
# import 를 피하기 위해 main.py 를 import 하지 않고 같은 리터럴 집합을 SoT 로 복제한다. 값이
# 바뀌면 양쪽 다 갱신할 것.
_DEV_ENV_VALUES = {"development", "dev", "local", "test"}


def toss_mode() -> Literal["off", "stub", "live"]:
    """세 단(off/stub/live) 판정 (§5-1). 클라·시크릿 키가 둘 다 있으면 live(테스트 키든 운영
    키든 '진짜 HTTP' — 구분은 토스가 키 접두로 한다). 아니면 dev 화이트리스트에서 STUB=1 일 때만 stub."""
    if os.getenv(_TOSS_CLIENT_KEY_ENV, "").strip() and os.getenv(_TOSS_SECRET_KEY_ENV, "").strip():
        return "live"
    if os.getenv(_TOSS_STUB_ENV, "").strip() == "1" and os.getenv("APP_ENV", "").strip().lower() in _DEV_ENV_VALUES:
        return "stub"
    return "off"


def toss_wiring_ready() -> bool:
    return toss_mode() != "off"


def get_toss_client_key() -> str | None:
    """공개 가능(브라우저 SDK 초기화용) — BFF 응답으로 내려준다. 미배선이면 None."""
    value = os.getenv(_TOSS_CLIENT_KEY_ENV, "").strip()
    return value or None


def get_toss_secret_key() -> str | None:
    """서버 전용 — 응답·로그·audit detail 에 절대 넣지 않는다. 이 함수를 호출하는 곳은
    HttpTossGateway 하나뿐이어야 한다."""
    value = os.getenv(_TOSS_SECRET_KEY_ENV, "").strip()
    return value or None
