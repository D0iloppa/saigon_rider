-- ================================================================
-- 230_ad_contracts_open_unique.sql
-- 광고 1건당 "열린(미종결) 계약"은 최대 1개 — draft 중복 생성 경쟁(check-then-act) 을 DB 레벨에서
-- 막는다. 애플리케이션(routers/ad_contract.py::create_contract_link)은 이 제약 위반(IntegrityError)
-- 을 잡아 먼저 커밋된 draft 를 재조회해 돌려준다.
--
-- 열린 상태 집합은 라우터의 `_UNCLOSED_NON_DRAFT_STATUSES` + 'draft' 와 동일하다
-- (종결 상태 active/cancelled/refunded 는 제외 — 갱신 계약을 새로 만들 수 있어야 한다).
--
-- 멱등/재실행 안전(agent-guidelines §10): bff_migrate 는 매 배포마다 이 파일을 재실행한다.
-- 이미 열린 계약이 2개 이상인 광고가 남아 있으면 인덱스 생성이 unique_violation 으로 실패하는데,
-- 그때 배포 전체가 막히지 않도록 WARNING 으로 내려앉힌다(앱 레벨 409 가드가 그대로 남아 있고,
-- 경고가 뜬 경우 중복 계약을 수동 정리한 뒤 다음 배포에서 인덱스가 만들어진다).
-- ================================================================

DO $$
BEGIN
    CREATE UNIQUE INDEX IF NOT EXISTS uq_ad_contracts_open_per_ad
        ON ad_contracts(ad_id)
        WHERE status IN ('draft', 'accepted', 'awaiting_payment', 'partially_paid', 'paid');
EXCEPTION
    WHEN unique_violation THEN
        RAISE WARNING 'uq_ad_contracts_open_per_ad 생성 실패 — 같은 광고에 열린 계약이 2건 이상 있다. 중복 계약을 정리한 뒤 재배포하면 생성된다.';
END $$;
