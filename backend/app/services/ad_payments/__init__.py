"""광고 계약·입금·대조 파이프라인 (260907_ad_payment_pipeline_design.md).

- `config` — seam-A: 계좌 배선 여부(`.env` 3키)
- `payment_code` — 입금 식별코드 생성·검증·정규화·적요 추출
- `port` — seam-B: 입금 관측 포트(`DepositObservation`, `ingest_deposit`)
- `reconcile` — 대조 규칙(순수함수)
- `contracts` — 계약건 상태 전이 5함수 + `compute_period`
- `constants` — 대표 결정 대기 항목 기본값
- `adapters` — 입금 소스 어댑터 registry
"""
