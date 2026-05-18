-- =============================================================
-- 029_app_versions.sql
-- APP_VERSIONS — 앱 버전 트리 관리 (primary → ios/android)
-- =============================================================

DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_platform') THEN
        CREATE TYPE app_platform AS ENUM ('primary', 'ios', 'android');
    END IF;
END $$;

CREATE TABLE IF NOT EXISTS app_versions (
    id          SERIAL        PRIMARY KEY,
    version     VARCHAR(50)   NOT NULL,
    platform    app_platform  NOT NULL DEFAULT 'primary',
    parent_id   INT           REFERENCES app_versions(id) ON DELETE CASCADE,
    build_number VARCHAR(50),
    release_note TEXT,
    is_force_update BOOLEAN   NOT NULL DEFAULT FALSE,
    is_active   BOOLEAN       NOT NULL DEFAULT TRUE,
    released_at TIMESTAMPTZ,
    created_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ   NOT NULL DEFAULT NOW(),

    CONSTRAINT uq_version_platform UNIQUE (version, platform),
    CONSTRAINT chk_parent_primary CHECK (
        (platform = 'primary' AND parent_id IS NULL) OR
        (platform != 'primary' AND parent_id IS NOT NULL)
    )
);

COMMENT ON TABLE  app_versions                  IS '앱 버전 트리 (primary=프론트엔드 공통, ios/android=네이티브)';
COMMENT ON COLUMN app_versions.version          IS '버전 문자열 (semver, e.g. 1.0.0)';
COMMENT ON COLUMN app_versions.platform         IS 'primary=프론트엔드, ios/android=네이티브 쉘';
COMMENT ON COLUMN app_versions.parent_id        IS 'ios/android → primary 버전 참조 (트리 관계)';
COMMENT ON COLUMN app_versions.build_number     IS '네이티브 빌드 번호 (optional)';
COMMENT ON COLUMN app_versions.release_note     IS '릴리스 노트 (Markdown)';
COMMENT ON COLUMN app_versions.is_force_update  IS '강제 업데이트 대상 여부';
COMMENT ON COLUMN app_versions.is_active        IS '현재 활성 버전 여부 (각 platform 당 1개만 권장)';
COMMENT ON COLUMN app_versions.released_at      IS '릴리스 일시 (NULL이면 미배포)';

CREATE INDEX IF NOT EXISTS idx_app_versions_platform ON app_versions(platform);
CREATE INDEX IF NOT EXISTS idx_app_versions_parent   ON app_versions(parent_id);
CREATE INDEX IF NOT EXISTS idx_app_versions_active   ON app_versions(is_active) WHERE is_active = TRUE;

-- 초기 시드: v1.0.0
INSERT INTO app_versions (version, platform, parent_id, release_note, is_active, released_at)
VALUES ('1.0.0', 'primary', NULL, '최초 릴리스', TRUE, NOW())
ON CONFLICT DO NOTHING;

INSERT INTO app_versions (version, platform, parent_id, build_number, release_note, is_active, released_at)
SELECT '1.0.0', 'ios', id, '1', '최초 릴리스', TRUE, NOW()
FROM app_versions WHERE version = '1.0.0' AND platform = 'primary'
ON CONFLICT DO NOTHING;

INSERT INTO app_versions (version, platform, parent_id, build_number, release_note, is_active, released_at)
SELECT '1.0.0', 'android', id, '1', '최초 릴리스', TRUE, NOW()
FROM app_versions WHERE version = '1.0.0' AND platform = 'primary'
ON CONFLICT DO NOTHING;
