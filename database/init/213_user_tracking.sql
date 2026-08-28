-- ================================================================
-- 213_user_tracking.sql
--
-- 사용자 트래킹 파이프라인 배선 (C3/C5/C6) — funnel_events(init/182, 183)의
-- anon_id/session_id 컬럼은 이미 있었으나 채우는 로직이 없었다. 이 마이그레이션은
-- 그 배선이 필요로 하는 신규 테이블 2개만 추가한다(funnel_events 자체는 손대지 않음).
--
-- 1) user_identity_links — 익명ID→회원ID 소급 연결(C5).
--    같은 세션(session_id) 범위로만 연결해, 공유 기기(베트남 시장에서 흔함)에서 이전
--    사용자의 익명 활동이 다음 로그인 사용자에게 잘못 귀속되는 오염을 막는다. 한 익명ID가
--    여러 세션에 걸쳐 같은 계정으로 재로그인할 수 있으므로 PK 는 (anon_id, user_id, session_id)
--    3중이다(둘만으로는 재로그인 세션을 덮어써 유실한다).
--
-- 2) user_first_touch_attribution — 익명ID 단위 first-touch 유입채널(C6).
--    기존 users.acquisition_source(단일 문자열, 가입 시점 1회성)와 별개다 — 대체·충돌 없음.
--    first-touch 불변성은 로직이 아니라 스키마로 고정한다: PK=anon_id 이고 서비스 코드는
--    INSERT ... ON CONFLICT DO NOTHING 만 쓴다(UPDATE 경로 자체가 없다 — 나중에 누군가
--    실수로 덮어쓰는 사고를 원천 봉쇄).
--
-- PII 최소화 원칙(init/182 승계) — IP·User-Agent·전화번호·자유 텍스트를 저장하지 않는다.
-- UTM 값은 캠페인 태깅에 쓰이는 짧은 슬러그이지 개인식별정보가 아니다. referrer/landing_path
-- 처럼 임의 URL·쿼리스트링이 섞일 수 있는 자유형 필드는 의도적으로 두지 않는다.
--
-- 멱등(IF NOT EXISTS). fresh volume(docker-entrypoint-initdb.d) 자동적용 +
-- 기존 volume 수동 psql 적용 둘 다 안전.
-- ================================================================

CREATE TABLE IF NOT EXISTS user_identity_links (
    anon_id     UUID NOT NULL,
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    session_id  UUID NOT NULL,
    linked_at   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (anon_id, user_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_user_identity_links_user ON user_identity_links(user_id, linked_at DESC);

-- 익명ID 단위 first-touch 유입 어트리뷰션. UPDATE 경로 없음 — INSERT ... ON CONFLICT DO NOTHING 전용.
CREATE TABLE IF NOT EXISTS user_first_touch_attribution (
    anon_id       UUID PRIMARY KEY,
    utm_source    VARCHAR(60),
    utm_medium    VARCHAR(60),
    utm_campaign  VARCHAR(60),
    utm_content   VARCHAR(60),
    utm_term      VARCHAR(60),
    first_seen_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
