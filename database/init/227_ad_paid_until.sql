-- ================================================================
-- 227_ad_paid_until.sql
-- 260907_biz_ad_payment_contract_adr.md §9 T-1 — 유료 만료일(paid_until) 도입.
--
-- 자동갱신 없는 선불 기간제(§0-1): 관리자가 입금 확인 시 이 값을 세팅한다(현재 활성화 화면
-- 반영은 다음 턴 T-3). ad_gating.py launching_ad_conditions 가 subscription_status/paid_until 을
-- 노출 조건에 반영해, 미입금(pending_payment) 광고가 무한정 노출되던 결함을 막는다.
-- ================================================================

ALTER TABLE marketplace_ads ADD COLUMN IF NOT EXISTS paid_until TIMESTAMPTZ NULL;

-- 백필: activate_subscription() 이 이 컬럼 추가 전부터 subscription_status 만 'active' 로
-- 세팅해왔기 때문에, 이 마이그레이션이 처음 실행되는 시점에 이미 active + paid_until IS NULL
-- 행이 존재할 수 있다(신규 게이트 조건에서는 이 조합이 비노출로 걸린다 — 회귀).
-- 값 선택 근거: 운영에는 아직 실제 유료 계약(입금 대사 레일)이 없다 — activate_subscription()
-- 이 입금 금액/기간을 전혀 기록하지 않는 것이 그 증거(260907_biz_ad_payment_contract_adr.md
-- §9 T-3 이 "입금 기록"을 아직 만들지 않은 후속 티켓으로 남아있음). 즉 이 조합의 행은 전부
-- "관리자가 승인 버튼만 눌러 노출을 켠" 레거시/개발 데이터이지 실제 만료일이 있는 계약이 아니다.
-- 그래서 임의의 실제 만료일을 역산하지 않고, 이 마이그레이션 적용 시점 기준 1개월 뒤로 세팅해
-- 최소한 지금 당장 게이트에 걸려 사라지지 않게만 한다. 멱등: WHERE 절이 이미 처리된 행을
-- 자동 제외한다(재실행 안전).
UPDATE marketplace_ads
   SET paid_until = now() + INTERVAL '1 month'
 WHERE subscription_status = 'active'
   AND paid_until IS NULL;
