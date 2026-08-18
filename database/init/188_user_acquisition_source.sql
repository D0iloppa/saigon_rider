-- ================================================================
-- 188_user_acquisition_source.sql
--
-- 유입 귀속(acquisition attribution) — 016_PLATFORM_MASTER_SUPPLEMENT.md §6-2 #30, D-30=(b).
--
-- users.acquisition_source 는 가입 시점에 단 1회 고정되는 first-touch 귀속 값이다
-- (§6-2 "가입 시 user.acquisition_source 고정(first-touch, 불변)"). 쓰기는
-- backend/app/routers/auth.py 의 신규가입(find-or-create) 분기 한 곳뿐이며, 기존
-- 사용자 로그인 경로에서는 절대 덮어쓰지 않는다 — 불변식은 코드로 강제한다(DB 제약 아님,
-- 소급 갱신이 필요할 일이 없어 트리거까지는 과설계).
--
-- 값 카탈로그(코드가 SoT, DB CHECK 없음 — ad_events.surface/funnel_events.event_type 과 동일 관례):
--   'organic'      — ref 파라미터 없이 가입(자연 유입, 앱스토어 등)
--   'agent:<code>' — 필드 에이전트 대면 등록
--   'u:<user_id>'  — 지인 소개·매물 공유 링크(초대자 = 다른 유저, #31)
--   'biz:<code>'   — 업체 매장 QR·포스터(B2B 연계)
-- normalize 는 backend/app/routers/auth.py:_normalize_acq_source() 가 담당 —
-- 화이트리스트 문자([A-Za-z0-9_:.-]) 이외/64자 초과는 'organic' 으로 강제해 자유 텍스트나
-- PII 가 이 컬럼에 섞이는 걸 막는다(개인정보 최소화, §6-8).
--
-- 멱등(IF NOT EXISTS).
-- ================================================================

ALTER TABLE users
    ADD COLUMN IF NOT EXISTS acquisition_source VARCHAR(64) NULL;

-- 채널별 집계(#31 초대자별 가입 수, #32 세그먼트 퍼널)가 이 컬럼으로 GROUP BY 하므로 색인.
CREATE INDEX IF NOT EXISTS idx_users_acquisition_source
    ON users(acquisition_source)
    WHERE acquisition_source IS NOT NULL;
