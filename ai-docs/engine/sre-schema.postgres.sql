-- ===========================================================
-- Saigon Rider Reward Engine (SRE) — DDL v1.0
-- Target: PostgreSQL 14+
-- Encoding: UTF8 (DB 생성 시 지정)
-- ===========================================================

-- ----------------------------------------------------------
-- 0. ENUM 타입 정의 (MySQL ENUM 대체)
-- ----------------------------------------------------------
CREATE TYPE account_type_enum     AS ENUM ('STANDARD','DRIVER','BUSINESS');
CREATE TYPE user_status_enum      AS ENUM ('ACTIVE','SUSPENDED','DELETED');
CREATE TYPE event_status_enum     AS ENUM ('PENDING','PROCESSED','REJECTED','REFUNDED');
CREATE TYPE mission_status_enum   AS ENUM ('ACTIVE','COMPLETED','EXPIRED','CANCELLED');
CREATE TYPE tx_type_enum          AS ENUM ('EARN','REDEEM','EXPIRE','ADJUST_PLUS','ADJUST_MINUS','REFUND');
CREATE TYPE expire_status_enum    AS ENUM ('PENDING','PARTIALLY_USED','EXPIRED','FULLY_USED');
CREATE TYPE integration_type_enum AS ENUM ('INTERNAL','GOTIT','URBOX','TELCO','MANUAL');
CREATE TYPE redemption_status_enum AS ENUM ('REQUESTED','FULFILLED','FAILED','REFUNDED','CANCELLED');
CREATE TYPE abuse_severity_enum   AS ENUM ('LOW','MEDIUM','HIGH','CRITICAL');
CREATE TYPE abuse_action_enum     AS ENUM ('LOG','REDUCE','REJECT','SUSPEND');

-- ----------------------------------------------------------
-- 공용 트리거 함수: updated_at 자동 갱신
-- (MySQL의 ON UPDATE CURRENT_TIMESTAMP 대체)
-- ----------------------------------------------------------
CREATE OR REPLACE FUNCTION set_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = CURRENT_TIMESTAMP;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------
-- 1. 사용자 식별
-- ----------------------------------------------------------
CREATE TABLE sre_user (
  user_id              BIGINT       GENERATED ALWAYS AS IDENTITY,
  external_user_uuid   VARCHAR(64)  NOT NULL,
  account_type         account_type_enum NOT NULL DEFAULT 'STANDARD',
  is_driver_verified   BOOLEAN      NOT NULL DEFAULT FALSE,
  status               user_status_enum  NOT NULL DEFAULT 'ACTIVE',
  created_at           TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT uq_external_uuid UNIQUE (external_user_uuid)
);

-- ----------------------------------------------------------
-- 2. 행동 정의 / 이벤트
-- ----------------------------------------------------------
CREATE TABLE action_definition (
  action_code          VARCHAR(40)  NOT NULL,
  category_code        VARCHAR(20)  NOT NULL,  -- RIDING / MAINT / MARKET / COMMUNITY / DELIVERY ...
  display_name         VARCHAR(80)  NOT NULL,
  base_xp              INT          NOT NULL DEFAULT 0,
  daily_count_limit    INT          NULL,
  is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
  metadata_schema      JSONB        NULL,
  updated_at           TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (action_code)
);
CREATE INDEX idx_action_def_category ON action_definition (category_code);

CREATE TRIGGER trg_action_definition_updated_at
BEFORE UPDATE ON action_definition
FOR EACH ROW EXECUTE FUNCTION set_updated_at();

CREATE TABLE action_event (
  event_id             BIGINT       GENERATED ALWAYS AS IDENTITY,
  user_id              BIGINT       NOT NULL,
  action_code          VARCHAR(40)  NOT NULL,
  occurred_at          TIMESTAMPTZ(3) NOT NULL,
  payload              JSONB        NULL,
  idempotency_key      VARCHAR(80)  NOT NULL,
  calculated_xp        NUMERIC(12,2) NOT NULL DEFAULT 0,
  applied_multiplier   NUMERIC(4,2) NOT NULL DEFAULT 1.00,
  process_status       event_status_enum NOT NULL DEFAULT 'PENDING',
  reject_reason_code   VARCHAR(40)  NULL,
  created_at           TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (event_id),
  CONSTRAINT uq_event_idem UNIQUE (idempotency_key),
  CONSTRAINT fk_event_user   FOREIGN KEY (user_id)     REFERENCES sre_user(user_id),
  CONSTRAINT fk_event_action FOREIGN KEY (action_code) REFERENCES action_definition(action_code)
);
CREATE INDEX idx_event_user_occurred   ON action_event (user_id, occurred_at);
CREATE INDEX idx_event_action_occurred ON action_event (action_code, occurred_at);

-- ----------------------------------------------------------
-- 3. 미션
-- ----------------------------------------------------------
CREATE TABLE mission_definition (
  mission_id           BIGINT       GENERATED ALWAYS AS IDENTITY,
  mission_code         VARCHAR(60)  NOT NULL,
  title                VARCHAR(120) NOT NULL,
  description          VARCHAR(500) NULL,
  category_code        VARCHAR(20)  NOT NULL,
  target_rule          JSONB        NOT NULL,    -- e.g. { "action_code":"RIDE_KM", "agg":"sum_field", "field":"distance_km", "target":5 }
  reward_xp            INT          NOT NULL,
  duration_hours       INT          NULL,         -- null = 만료 없음
  is_repeatable        BOOLEAN      NOT NULL DEFAULT FALSE,
  starts_at            TIMESTAMPTZ(3) NULL,
  ends_at              TIMESTAMPTZ(3) NULL,
  is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
  PRIMARY KEY (mission_id),
  CONSTRAINT uq_mission_code UNIQUE (mission_code)
);
CREATE INDEX idx_mission_def_category ON mission_definition (category_code);

CREATE TABLE user_mission_progress (
  progress_id          BIGINT       GENERATED ALWAYS AS IDENTITY,
  user_id              BIGINT       NOT NULL,
  mission_id           BIGINT       NOT NULL,
  current_value        INT          NOT NULL DEFAULT 0,
  target_value         INT          NOT NULL,
  status               mission_status_enum NOT NULL DEFAULT 'ACTIVE',
  started_at           TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at         TIMESTAMPTZ(3) NULL,
  expires_at           TIMESTAMPTZ(3) NULL,
  PRIMARY KEY (progress_id),
  CONSTRAINT fk_ump_user    FOREIGN KEY (user_id)    REFERENCES sre_user(user_id),
  CONSTRAINT fk_ump_mission FOREIGN KEY (mission_id) REFERENCES mission_definition(mission_id)
);
CREATE INDEX idx_ump_user_status ON user_mission_progress (user_id, status);
CREATE INDEX idx_ump_mission     ON user_mission_progress (mission_id);

CREATE TABLE mission_recommendation (
  rec_id               BIGINT       GENERATED ALWAYS AS IDENTITY,
  user_id              BIGINT       NOT NULL,
  mission_id           BIGINT       NOT NULL,
  score                NUMERIC(6,3) NOT NULL,
  reason_code          VARCHAR(40)  NOT NULL,
  recommended_at       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  consumed_at          TIMESTAMPTZ(3) NULL,
  PRIMARY KEY (rec_id),
  CONSTRAINT fk_rec_user    FOREIGN KEY (user_id)    REFERENCES sre_user(user_id),
  CONSTRAINT fk_rec_mission FOREIGN KEY (mission_id) REFERENCES mission_definition(mission_id)
);
CREATE INDEX idx_rec_user_recommended ON mission_recommendation (user_id, recommended_at);

-- ----------------------------------------------------------
-- 4. 포인트 원장 (Ledger)
-- ----------------------------------------------------------
CREATE TABLE xp_balance (
  user_id              BIGINT       NOT NULL,
  current_balance      BIGINT       NOT NULL DEFAULT 0,
  lifetime_earned      BIGINT       NOT NULL DEFAULT 0,
  lifetime_spent       BIGINT       NOT NULL DEFAULT 0,
  expiring_soon        BIGINT       NOT NULL DEFAULT 0,
  last_recalculated_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_balance_user FOREIGN KEY (user_id) REFERENCES sre_user(user_id)
);

CREATE TABLE xp_transaction (
  transaction_id       BIGINT       GENERATED ALWAYS AS IDENTITY,
  user_id              BIGINT       NOT NULL,
  tx_type              tx_type_enum NOT NULL,
  amount               BIGINT       NOT NULL,            -- 항상 양수, 부호는 tx_type으로 판단
  balance_after        BIGINT       NOT NULL,
  source_type          VARCHAR(40)  NOT NULL,            -- ACTION / MISSION / REDEMPTION / EXPIRY / ADMIN
  source_id            BIGINT       NULL,
  related_event_id     BIGINT       NULL,
  occurred_at          TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at           TIMESTAMPTZ(3) NULL,               -- 적립 트랜잭션의 만료 예정일
  memo                 VARCHAR(200) NULL,
  PRIMARY KEY (transaction_id),
  CONSTRAINT fk_tx_user  FOREIGN KEY (user_id)          REFERENCES sre_user(user_id),
  CONSTRAINT fk_tx_event FOREIGN KEY (related_event_id) REFERENCES action_event(event_id)
);
CREATE INDEX idx_tx_user_occurred ON xp_transaction (user_id, occurred_at);
CREATE INDEX idx_tx_user_type     ON xp_transaction (user_id, tx_type);
CREATE INDEX idx_tx_expires       ON xp_transaction (expires_at);

CREATE TABLE xp_expiration_schedule (
  expire_id            BIGINT       GENERATED ALWAYS AS IDENTITY,
  user_id              BIGINT       NOT NULL,
  source_transaction_id BIGINT      NOT NULL,
  remaining_amount     BIGINT       NOT NULL,
  expires_at           TIMESTAMPTZ(3) NOT NULL,
  status               expire_status_enum NOT NULL DEFAULT 'PENDING',
  PRIMARY KEY (expire_id),
  CONSTRAINT fk_exp_user FOREIGN KEY (user_id)               REFERENCES sre_user(user_id),
  CONSTRAINT fk_exp_tx   FOREIGN KEY (source_transaction_id) REFERENCES xp_transaction(transaction_id)
);
CREATE INDEX idx_exp_user_expires   ON xp_expiration_schedule (user_id, expires_at);
CREATE INDEX idx_exp_status_expires ON xp_expiration_schedule (status, expires_at);

-- ----------------------------------------------------------
-- 5. 다양성 / 등급
-- ----------------------------------------------------------
CREATE TABLE behavior_category_log (
  log_id               BIGINT       GENERATED ALWAYS AS IDENTITY,
  user_id              BIGINT       NOT NULL,
  category_code        VARCHAR(20)  NOT NULL,
  related_event_id     BIGINT       NULL,
  occurred_at          TIMESTAMPTZ(3) NOT NULL,
  month_key            INT          NOT NULL,           -- YYYYMM 형식
  PRIMARY KEY (log_id),
  CONSTRAINT fk_bcl_user FOREIGN KEY (user_id) REFERENCES sre_user(user_id)
);
CREATE INDEX idx_bcl_user_month     ON behavior_category_log (user_id, month_key);
CREATE INDEX idx_bcl_user_cat_month ON behavior_category_log (user_id, category_code, month_key);

CREATE TABLE user_diversity_score (
  user_id              BIGINT       NOT NULL,
  month_key            INT          NOT NULL,
  active_category_count INT         NOT NULL DEFAULT 0,
  multiplier           NUMERIC(4,2) NOT NULL DEFAULT 1.00,
  last_calculated_at   TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id, month_key),
  CONSTRAINT fk_uds_user FOREIGN KEY (user_id) REFERENCES sre_user(user_id)
);

CREATE TABLE tier_definition (
  tier_code            VARCHAR(20)  NOT NULL,
  tier_name            VARCHAR(40)  NOT NULL,
  min_lifetime_rp      BIGINT       NOT NULL DEFAULT 0,
  min_diversity_count  INT          NOT NULL DEFAULT 0,
  sort_order           INT          NOT NULL,
  PRIMARY KEY (tier_code)
);

CREATE TABLE user_tier (
  user_id              BIGINT       NOT NULL,
  current_tier_code    VARCHAR(20)  NOT NULL,
  progress_to_next     BIGINT       NOT NULL DEFAULT 0,
  achieved_at          TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (user_id),
  CONSTRAINT fk_ut_user FOREIGN KEY (user_id)           REFERENCES sre_user(user_id),
  CONSTRAINT fk_ut_tier FOREIGN KEY (current_tier_code) REFERENCES tier_definition(tier_code)
);

-- ----------------------------------------------------------
-- 6. 보상
-- ----------------------------------------------------------
CREATE TABLE reward_partner (
  partner_id           BIGINT       GENERATED ALWAYS AS IDENTITY,
  partner_code         VARCHAR(40)  NOT NULL,
  partner_name         VARCHAR(120) NOT NULL,
  integration_type     integration_type_enum NOT NULL,
  api_config           JSONB        NULL,
  is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at           TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (partner_id),
  CONSTRAINT uq_partner_code UNIQUE (partner_code)
);

CREATE TABLE reward_catalog (
  catalog_id           BIGINT       GENERATED ALWAYS AS IDENTITY,
  partner_id           BIGINT       NOT NULL,
  item_code            VARCHAR(60)  NOT NULL,
  item_name            VARCHAR(120) NOT NULL,
  category_code        VARCHAR(20)  NOT NULL,
  required_xp          INT          NOT NULL,
  face_value_vnd       INT          NULL,
  monthly_quota        INT          NULL,
  monthly_issued       INT          NOT NULL DEFAULT 0,
  is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
  visible_from         TIMESTAMPTZ(3) NULL,
  visible_until        TIMESTAMPTZ(3) NULL,
  PRIMARY KEY (catalog_id),
  CONSTRAINT uq_item_code UNIQUE (item_code),
  CONSTRAINT fk_cat_partner FOREIGN KEY (partner_id) REFERENCES reward_partner(partner_id)
);
CREATE INDEX idx_cat_active_visible ON reward_catalog (is_active, visible_from, visible_until);

CREATE TABLE reward_redemption (
  redemption_id        BIGINT       GENERATED ALWAYS AS IDENTITY,
  user_id              BIGINT       NOT NULL,
  catalog_id           BIGINT       NOT NULL,
  xp_transaction_id    BIGINT       NULL,
  status               redemption_status_enum NOT NULL DEFAULT 'REQUESTED',
  voucher_code         VARCHAR(120) NULL,
  external_response    JSONB        NULL,
  idempotency_key      VARCHAR(80)  NOT NULL,
  requested_at         TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  fulfilled_at         TIMESTAMPTZ(3) NULL,
  expires_at           TIMESTAMPTZ(3) NULL,
  PRIMARY KEY (redemption_id),
  CONSTRAINT uq_redeem_idem UNIQUE (idempotency_key),
  CONSTRAINT fk_red_user    FOREIGN KEY (user_id)           REFERENCES sre_user(user_id),
  CONSTRAINT fk_red_catalog FOREIGN KEY (catalog_id)        REFERENCES reward_catalog(catalog_id),
  CONSTRAINT fk_red_tx      FOREIGN KEY (xp_transaction_id) REFERENCES xp_transaction(transaction_id)
);
CREATE INDEX idx_red_user_status ON reward_redemption (user_id, status);

-- ----------------------------------------------------------
-- 7. 어뷰징
-- ----------------------------------------------------------
CREATE TABLE abuse_rule (
  rule_code            VARCHAR(40)  NOT NULL,
  rule_name            VARCHAR(120) NOT NULL,
  severity             abuse_severity_enum NOT NULL DEFAULT 'MEDIUM',
  condition_json       JSONB        NOT NULL,
  action               abuse_action_enum NOT NULL,
  is_active            BOOLEAN      NOT NULL DEFAULT TRUE,
  PRIMARY KEY (rule_code)
);

CREATE TABLE abuse_event (
  abuse_event_id       BIGINT       GENERATED ALWAYS AS IDENTITY,
  user_id              BIGINT       NOT NULL,
  rule_code            VARCHAR(40)  NOT NULL,
  related_event_id     BIGINT       NULL,
  detail               JSONB        NULL,
  action_taken         abuse_action_enum NOT NULL,
  detected_at          TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (abuse_event_id),
  CONSTRAINT fk_ae_user FOREIGN KEY (user_id)   REFERENCES sre_user(user_id),
  CONSTRAINT fk_ae_rule FOREIGN KEY (rule_code) REFERENCES abuse_rule(rule_code)
);
CREATE INDEX idx_ae_user_detected ON abuse_event (user_id, detected_at);

CREATE TABLE idempotency_key (
  idempotency_key      VARCHAR(80)  NOT NULL,
  resource_type        VARCHAR(40)  NOT NULL,    -- EVENT / REDEMPTION
  resource_id          BIGINT       NULL,
  created_at           TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  expires_at           TIMESTAMPTZ(3) NOT NULL,
  PRIMARY KEY (idempotency_key)
);
CREATE INDEX idx_idem_expires ON idempotency_key (expires_at);

-- ----------------------------------------------------------
-- 8. 감사
-- ----------------------------------------------------------
CREATE TABLE audit_log (
  audit_id             BIGINT       GENERATED ALWAYS AS IDENTITY,
  entity_type          VARCHAR(40)  NOT NULL,
  entity_id            BIGINT       NOT NULL,
  actor_user_id        BIGINT       NULL,
  action_code          VARCHAR(40)  NOT NULL,
  before_snapshot      JSONB        NULL,
  after_snapshot       JSONB        NULL,
  created_at           TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (audit_id)
);
CREATE INDEX idx_audit_entity  ON audit_log (entity_type, entity_id);
CREATE INDEX idx_audit_created ON audit_log (created_at);

-- ===========================================================
-- 시드 데이터: 기본 룰 / 등급 / 액션 / 보상
-- ===========================================================

INSERT INTO tier_definition (tier_code, tier_name, min_lifetime_rp, min_diversity_count, sort_order) VALUES
  ('ROOKIE',  'Rookie',  0,        0, 1),
  ('RIDER',   'Rider',   5000,     2, 2),
  ('VETERAN', 'Veteran', 25000,    3, 3),
  ('PRO',     'Pro',     100000,   4, 4),
  ('LEGEND',  'Legend',  500000,   5, 5);

INSERT INTO action_definition (action_code, category_code, display_name, base_xp, daily_count_limit) VALUES
  ('RIDE_KM',             'RIDING',    '주행 거리 1km',        1,    NULL),
  ('QUEST_COMPLETE',      'RIDING',    '퀘스트 완료',         50,   NULL),
  ('STREAK_7',            'RIDING',    '7일 연속 라이딩',    500,    1),
  ('GROUP_RIDE',          'RIDING',    '그룹 라이딩',         20,   NULL),
  ('MAINTENANCE_RECEIPT', 'MAINT',     '정비 영수증 인증',   200,    1),
  ('FUEL_RECEIPT',        'MAINT',     '주유 영수증 인증',    50,    1),
  ('MARKET_LISTING',      'MARKET',    '중고 부품 등록',      30,    3),
  ('MARKET_SUCCESS',      'MARKET',    '중고 거래 성공',     500,   NULL),
  ('REVIEW_PHOTO',        'COMMUNITY', '리뷰 사진 작성',     100,    3),
  ('REFERRAL',            'COMMUNITY', '친구 초대 성공',     250,   NULL),
  ('SHARE_SNS',           'COMMUNITY', 'SNS 공유',            30,    1),
  ('DELIVERY_RECEIPT',    'DELIVERY',  '배달 영수증 인증',     5,  100);

INSERT INTO abuse_rule (rule_code, rule_name, severity, condition_json, action) VALUES
  ('DAILY_RP_CAP',     '일일 RP 상한',        'MEDIUM', jsonb_build_object('max_per_day', 250),                  'REDUCE'),
  ('NEW_ACCOUNT_50',   '신규 3일 50% 적립',   'LOW',    jsonb_build_object('within_days', 3, 'multiplier', 0.5), 'REDUCE'),
  ('GPS_SPEED_RANGE',  'GPS 속도 5~80 km/h', 'HIGH',   jsonb_build_object('min_kmh', 5, 'max_kmh', 80),         'REJECT'),
  ('DUPLICATE_RECEIPT','영수증 중복 OCR',     'HIGH',   jsonb_build_object('hash_window_days', 30),              'REJECT');

INSERT INTO reward_partner (partner_code, partner_name, integration_type, is_active) VALUES
  ('INTERNAL', '자체 디지털 굿즈',      'INTERNAL', TRUE),
  ('VIETTEL',  'Viettel 데이터 충전',  'TELCO',    TRUE),
  ('GOTIT',    'Got It 베트남',        'GOTIT',    TRUE);

INSERT INTO reward_catalog (partner_id, item_code, item_name, category_code, required_xp, face_value_vnd, is_active) VALUES
  ((SELECT partner_id FROM reward_partner WHERE partner_code='INTERNAL'),
   'BADGE_FOUNDER', '창립 멤버 한정 뱃지', 'BADGE',  200,    NULL, TRUE),
  ((SELECT partner_id FROM reward_partner WHERE partner_code='VIETTEL'),
   'DATA_1GB',      'Viettel 데이터 1GB',  'TELCO',  300,  14000, TRUE),
  ((SELECT partner_id FROM reward_partner WHERE partner_code='INTERNAL'),
   'FRAME_NEON',    '네온 프로필 프레임',  'COSMETIC', 800,   NULL, TRUE),
  ((SELECT partner_id FROM reward_partner WHERE partner_code='GOTIT'),
   'GOTIT_50K',     'Got It 50K VND',       'GIFTCARD', 1200, 50000, TRUE),
  ((SELECT partner_id FROM reward_partner WHERE partner_code='GOTIT'),
   'GOTIT_100K',    'Got It 100K VND',      'GIFTCARD', 3000, 100000, TRUE),
  ((SELECT partner_id FROM reward_partner WHERE partner_code='INTERNAL'),
   'BADGE_LEGEND_FIRST100', 'Legend 1호~100호 한정 뱃지', 'BADGE', 7000, NULL, TRUE);

-- ===========================================================
-- 마일리지 & 보상 정책 엔진 (019_mileage_policy_tables)
-- ===========================================================

CREATE TYPE reward_action_type_enum AS ENUM (
  'GRANT_EXP','GRANT_BADGE','GRANT_XP','GRANT_GOLD'
);

ALTER TABLE sre_user
  ADD COLUMN total_distance_m BIGINT NOT NULL DEFAULT 0;

CREATE TABLE device_user_map (
  device_uuid  VARCHAR(128) PRIMARY KEY,
  user_id      BIGINT       NOT NULL REFERENCES sre_user(user_id),
  logged_in_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_device_user_map_user ON device_user_map (user_id);

CREATE TABLE user_mileage_log (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id     BIGINT        NOT NULL REFERENCES sre_user(user_id),
  distance_m  NUMERIC(12,2) NOT NULL,
  device_uuid TEXT,
  recorded_at TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_mileage_log_user_ts
  ON user_mileage_log (user_id, recorded_at DESC);

CREATE TABLE reward_policy (
  id              BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  policy_code     VARCHAR(60)  NOT NULL UNIQUE,
  name            VARCHAR(120) NOT NULL,
  description     TEXT,
  conditions      JSONB        NOT NULL DEFAULT '[]',
  is_repeatable   BOOLEAN      NOT NULL DEFAULT FALSE,
  repeat_interval BIGINT,
  is_active       BOOLEAN      NOT NULL DEFAULT TRUE,
  priority        SMALLINT     NOT NULL DEFAULT 0,
  created_at      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at      TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
-- conditions: [{"metric":"total_distance_m","op":">=","value":100000}] — AND 평가
-- repeat_interval: is_repeatable=true일 때 반복 주기 (metric 단위)
CREATE INDEX idx_reward_policy_active
  ON reward_policy (is_active, priority) WHERE is_active = TRUE;

CREATE TABLE reward_policy_action (
  id          BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  policy_id   BIGINT NOT NULL REFERENCES reward_policy(id) ON DELETE CASCADE,
  action_type reward_action_type_enum NOT NULL,
  value       INTEGER NOT NULL DEFAULT 0,
  ref_id      VARCHAR(64),
  sort_order  SMALLINT NOT NULL DEFAULT 0
);
CREATE INDEX idx_policy_action_policy
  ON reward_policy_action (policy_id, sort_order);

CREATE TABLE user_policy_log (
  id                BIGINT GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id           BIGINT NOT NULL REFERENCES sre_user(user_id),
  policy_id         BIGINT NOT NULL REFERENCES reward_policy(id),
  trigger_snapshot  JSONB,
  rewarded_at       TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX idx_policy_log_user_policy
  ON user_policy_log (user_id, policy_id, rewarded_at DESC);

CREATE TRIGGER trg_reward_policy_updated_at
  BEFORE UPDATE ON reward_policy
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();

-- ===========================================================
-- 끝
-- ===========================================================
