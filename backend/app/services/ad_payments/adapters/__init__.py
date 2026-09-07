"""어댑터 registry (260907_ad_payment_pipeline_design.md §2-1, §2-4).

Stage 1 은 `manual` 뿐이다 — 관리자 폼이 그 자체로 어댑터라 별도 모듈이 필요 없다(admin API 가
직접 `DepositObservation(source="manual")` 을 만들어 `port.ingest_deposit()` 을 호출한다).

csv/bank_feed 는 이 registry 에 항목을 추가하고 어댑터 모듈 파일 하나(+ 필요 시 라우터)를 얹는
것만으로 확장된다(§2-4). 포트가 이를 수용 가능함을 문서로 증명해뒀을 뿐 — 지금 만들면 과설계라
Stage 2 로 미룬다(§8 S2-1/S2-2).
"""

from __future__ import annotations

PROVIDERS: dict[str, str] = {
    "manual": "관리자 수동 입력 — admin API 가 직접 ingest_deposit 호출",
}


def is_registered(source: str) -> bool:
    return source in PROVIDERS
