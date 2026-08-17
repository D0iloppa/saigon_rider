-- ================================================================
-- 182_funnel_events.sql
--
-- 퍼널 계측 최소 스키마 (정본 §5 #5, D-18(a) — 자체 이벤트 테이블 채택,
-- ai-docs/task/active/260817_commercial_readiness_audit/010_COMMERCIAL_TARGET_SPEC.md).
-- ad_events(init/153)와 같은 패턴 — 원시 이벤트 + 일별 롤업 두 테이블.
--
-- event_type 값 카탈로그는 DB CHECK 가 아니라 백엔드 Enum(FunnelEventType)이 SoT다 —
-- 값 추가가 마이그레이션을 부르지 않게 하기 위함(ad_events.surface 의 D-19 처리와 동일 이유).
--
-- 개인정보 최소화(PDPL 대응이 D-18 채택 이유) — IP·User-Agent·자유 텍스트를 저장하지 않는다.
-- 식별자는 기존 UUID 참조(user_id/entity_id)로 충분하다.
--
-- 멱등(IF NOT EXISTS). fresh volume(docker-entrypoint-initdb.d) 자동적용 +
-- 기존 volume 수동 psql 적용 둘 다 안전.
-- ================================================================

CREATE TABLE IF NOT EXISTS funnel_events (
    id          BIGSERIAL PRIMARY KEY,
    event_type  VARCHAR(24) NOT NULL,
    user_id     UUID NULL REFERENCES users(id) ON DELETE SET NULL,
    entity_id   UUID NULL,
    occurred_at TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    stat_date   DATE NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_funnel_events_date_type ON funnel_events(stat_date, event_type);
CREATE INDEX IF NOT EXISTS idx_funnel_events_user_occurred
  ON funnel_events(user_id, occurred_at DESC) WHERE user_id IS NOT NULL;

-- 일별 단계 수 롤업 — 어드민 조회는 이 테이블만 읽는다(원시 funnel_events 스캔 금지).
CREATE TABLE IF NOT EXISTS funnel_daily_stats (
    stat_date   DATE NOT NULL,
    event_type  VARCHAR(24) NOT NULL,
    event_count INTEGER NOT NULL DEFAULT 0,
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (stat_date, event_type)
);
