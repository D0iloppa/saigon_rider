-- =============================================================
-- 005_app_config.sql
-- APP_CONFIG — API 키 및 앱 설정 Key-Value 스토어
-- =============================================================

CREATE TABLE IF NOT EXISTS app_config (
    key         VARCHAR(200)  NOT NULL,
    value       TEXT          NOT NULL,
    group_name  VARCHAR(100)  NOT NULL DEFAULT 'default',
    description TEXT,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    PRIMARY KEY (group_name, key)
);

COMMENT ON TABLE  app_config               IS 'API 키 및 앱 런타임 설정 Key-Value 스토어';
COMMENT ON COLUMN app_config.key           IS '설정 키 (group_name 내 고유)';
COMMENT ON COLUMN app_config.value         IS '설정 값 (암호화 필요 시 애플리케이션 레이어에서 처리)';
COMMENT ON COLUMN app_config.group_name    IS '그룹 분류 (예: kakao_api, google_api, internal, feature_flag)';
COMMENT ON COLUMN app_config.description   IS '키 설명 및 용도';

CREATE INDEX IF NOT EXISTS idx_app_config_group ON app_config(group_name);
