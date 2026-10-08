-- 253: FactMind 공개 레이어 — subject(공개 대상) / snapshot(불변 사실 스냅샷) / publication(공개본) / event(기록). 멱등.
-- fm_bot_* 는 P5. 시드 INSERT 없음(플랫폼 subject 는 어드민 sync 가 생성).
CREATE TABLE IF NOT EXISTS fm_subject (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    kind          TEXT NOT NULL CHECK (kind IN ('platform', 'business')),
    source_ref    UUID,
    slug          TEXT UNIQUE,
    status        TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'published', 'withdrawn')),
    locale_source TEXT NOT NULL DEFAULT 'vi' CHECK (locale_source IN ('vi', 'ko', 'en')),
    ward_id       SMALLINT REFERENCES wards(id) ON DELETE SET NULL,
    category_code TEXT,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fm_subject_platform ON fm_subject (kind) WHERE kind = 'platform';
CREATE UNIQUE INDEX IF NOT EXISTS uq_fm_subject_business_ref ON fm_subject (source_ref) WHERE kind = 'business';
CREATE INDEX IF NOT EXISTS ix_fm_subject_status ON fm_subject (kind, status);

CREATE TABLE IF NOT EXISTS fm_snapshot (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id    UUID NOT NULL REFERENCES fm_subject(id) ON DELETE CASCADE,
    version       INTEGER NOT NULL,
    facts         JSONB NOT NULL,
    jsonld        JSONB NOT NULL,
    source_digest TEXT NOT NULL,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (subject_id, version)
);

CREATE TABLE IF NOT EXISTS fm_publication (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    subject_id        UUID NOT NULL REFERENCES fm_subject(id) ON DELETE CASCADE,
    snapshot_id       UUID NOT NULL REFERENCES fm_snapshot(id),
    status            TEXT NOT NULL CHECK (status IN ('published', 'superseded', 'withdrawn')),
    files             JSONB NOT NULL,
    artifact_digest   TEXT NOT NULL,
    published_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    verified_at       TIMESTAMPTZ,
    verification      JSONB,
    index_notified_at TIMESTAMPTZ
);
CREATE UNIQUE INDEX IF NOT EXISTS uq_fm_publication_published ON fm_publication (subject_id) WHERE status = 'published';
CREATE INDEX IF NOT EXISTS ix_fm_publication_subject ON fm_publication (subject_id, published_at DESC);

CREATE TABLE IF NOT EXISTS fm_event (
    id         BIGSERIAL PRIMARY KEY,
    subject_id UUID REFERENCES fm_subject(id) ON DELETE SET NULL,
    kind       TEXT NOT NULL CHECK (kind IN ('publish', 'verify', 'withdraw', 'index_notified', 'site_report', 'diagnosis', 'console_coverage')),
    body       JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS ix_fm_event_kind_created ON fm_event (kind, created_at DESC);
CREATE INDEX IF NOT EXISTS ix_fm_event_subject ON fm_event (subject_id, created_at DESC);
