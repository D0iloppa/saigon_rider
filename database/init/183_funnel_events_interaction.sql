-- ================================================================
-- 183_funnel_events_interaction.sql
--
-- funnel_events 를 퍼널 카운터 스키마에서 상호작용 로그로 확장
-- (016_PLATFORM_MASTER_SUPPLEMENT.md §3-2 #16, D-23=(b) 상호작용 로그 채택).
--
-- 016 §3-1 이 경고한 문제: 기존(init/182) 스키마는 event_type/user_id/entity_id/occurred_at
-- 만 있어 매물별 조회 수 집계, 최근 본 매물, 랭킹 입력, 채널별 퍼널, 검색 0건 분석이
-- 불가능하다. 기존 테이블을 드롭하지 않고 ALTER 로 확장해 파일럿 기간 누적 데이터를 보존한다.
--
-- 016 §3-2 초안과의 차이 2건:
-- 1) 초안은 `subject_id BIGINT` 신설을 제안하지만, 이 레포는 UUID PK 체계이고 기존
--    `entity_id UUID` 가 이미 그 역할을 한다. 새 컬럼을 만들지 않고 `subject_type` 만 추가해
--    (subject_type, entity_id) 쌍으로 쓴다. 인덱스도 그 쌍 기준으로 만든다.
-- 2) `surface` 는 ad_events.surface(D-19, init/153+174)와 동일한 카탈로그 방식을 재사용한다 —
--    DB CHECK 없음, 값 추가가 마이그레이션을 부르지 않게 백엔드 Enum/코드가 SoT.
--
-- init/182 의 규약을 그대로 승계한다:
-- - event_type 값 카탈로그는 DB CHECK 가 아니라 백엔드 Enum(FunnelEventType)이 SoT.
-- - 개인정보 최소화(PDPL) — IP·User-Agent·전화번호 등 개인식별정보를 저장하지 않는다.
--   `props`(JSONB)에도 동일 원칙 적용: dwell_ms·position·query(정규화)·result_count·ward 등
--   집계용 값만 넣고, IP·UA·전화번호·자유 텍스트 원문 같은 PII 를 넣지 않는다.
-- - 멱등(IF NOT EXISTS). fresh volume 자동적용 + 기존 volume 수동 psql 적용 둘 다 안전.
--
-- init/182 파일 자체는 수정하지 않는다(신규 파일로만 확장).
-- ================================================================

ALTER TABLE funnel_events
    ADD COLUMN IF NOT EXISTS anon_id      UUID NULL,
    ADD COLUMN IF NOT EXISTS subject_type VARCHAR(20) NULL,
    ADD COLUMN IF NOT EXISTS surface      VARCHAR(30) NULL,
    ADD COLUMN IF NOT EXISTS session_id   UUID NULL,
    ADD COLUMN IF NOT EXISTS acq_source   VARCHAR(40) NULL,
    ADD COLUMN IF NOT EXISTS props        JSONB NOT NULL DEFAULT '{}';

-- 매물/광고/업체/유저/검색 등 대상별 조회(랭킹 v1·최근 본 매물·매물별 조회 수 집계 입력).
-- (subject_type, entity_id) 가 016 초안의 subject_id 대체 — 기존 UUID PK 체계 유지.
CREATE INDEX IF NOT EXISTS idx_funnel_events_subject
  ON funnel_events(subject_type, entity_id, occurred_at);

-- event_type 별 최신순 조회(예: 검색 이벤트 시계열) — 기존 idx_funnel_events_date_type 는
-- (stat_date, event_type) 이라 occurred_at 정렬에는 못 쓰여 별도로 만든다.
CREATE INDEX IF NOT EXISTS idx_funnel_events_type_at
  ON funnel_events(event_type, occurred_at);

-- idx_funnel_events_user 는 만들지 않는다 — 기존 idx_funnel_events_user_occurred
-- (user_id, occurred_at DESC) WHERE user_id IS NOT NULL 이 이미 동일 컬럼 조합을 커버한다.
