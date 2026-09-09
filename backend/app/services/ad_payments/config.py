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
_PROD_ENV_VALUES = {"production", "prod"}


def _toss_key_environment(value: str, *, kind: Literal["client", "secret"]) -> Literal["test", "live"] | None:
    """키 역할과 test/live 접두를 함께 검증한다. 알 수 없는 형식은 배선으로 취급하지 않는다."""
    # 현재 프론트는 V2의 legacy payment-window `payment()`를 사용하므로 API 개별 연동 키
    # (ck/sk)만 받는다. gck/gsk는 widgets() 주문서형·결제창형 키라 서로 바꿔 쓸 수 없다.
    suffix = "ck_" if kind == "client" else "sk_"
    for environment in ("test", "live"):
        if value.startswith(f"{environment}_{suffix}"):
            return environment
    return None


def toss_mode() -> Literal["off", "stub", "live"]:
    """세 단(off/stub/live) 판정 (§5-1).

    실제 HTTP 키는 역할(ck/sk), test/live 쌍, APP_ENV 가 모두 일치해야 한다. 운영은 live 키만,
    개발 화이트리스트는 test 키만 허용하며 APP_ENV 미설정·오타는 fail-closed 한다.
    """
    client_key = os.getenv(_TOSS_CLIENT_KEY_ENV, "").strip()
    secret_key = os.getenv(_TOSS_SECRET_KEY_ENV, "").strip()
    app_env = os.getenv("APP_ENV", "").strip().lower()
    if client_key or secret_key:
        client_environment = _toss_key_environment(client_key, kind="client")
        secret_environment = _toss_key_environment(secret_key, kind="secret")
        if client_environment is None or client_environment != secret_environment:
            return "off"
        if app_env in _PROD_ENV_VALUES and client_environment == "live":
            return "live"
        if app_env in _DEV_ENV_VALUES and client_environment == "test":
            return "live"
        return "off"
    if os.getenv(_TOSS_STUB_ENV, "").strip() == "1" and app_env in _DEV_ENV_VALUES:
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
