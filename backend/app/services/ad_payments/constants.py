"""대표 결정 대기 항목의 기본값 (260907_ad_payment_pipeline_design.md §6). 값만 바꿀 수 있게 한 곳에 모은다."""

# D-A: 입금 안내 표시(payment_instructions_issued_at) 후 입금 기한(일). 초과해도 자동 취소는 없음(관리자 목록 표시만).
# 소비처: P1-4(관리자 목록 "입금기한 초과" 표시).
PAYMENT_DUE_DAYS = 7

# D-B: 초과 입금분을 다음 계약에 이월 허용할지 — 허용(미매칭 입금건 재배정으로 표현, 새 개념 불필요).
# 소비처: P1-4(관리자 미매칭 입금건 재배정 UI/로직).
ALLOW_OVERPAYMENT_CARRYOVER = True

# D-D: 부족 금액 승인(부분 승인) 허용 여부 — 허용하되 사유 필수(contracts.approve 가 강제).
ALLOW_PARTIAL_APPROVAL = True

# D-C: 최신이 아닌 active 계약의 환불 시 paid_until 자동 조정 — 불가(관리자 수동 조정).
# 소비처: P1-4(close_refunded 호출부의 paid_until 처리 분기).
AUTO_ADJUST_NON_LATEST_REFUND = False

# D-I: 자동 승인 대상 소스 (260907_toss_payment_rail_design.md §3-6). 카드(toss)는 금액이
# 구성상 정확 일치하므로 사람 판단의 가치가 없다 — ingest 직후 코어(checkout.py)가 즉시
# `contracts.approve(actor="system:toss")` 를 호출한다. bank_feed(은행 API, Stage 2 후순위)의
# 자동승인 여부(파이프라인 문서 D-E)는 여전히 미결 — 값을 하나 더 넣는 것이 그 결정의 구현 전부다.
AUTO_APPROVE_SOURCES = ("toss",)
