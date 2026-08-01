-- __DEV: 프로젝트 컨텍스트 관리 테이블
-- context (key-value), features (기능 목록), todos (할일 관리)

-- ENUMs
DO $$ BEGIN
  CREATE TYPE dev_feature_status AS ENUM ('PLANNED', 'IN_PROGRESS', 'DONE', 'DEFERRED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE dev_todo_priority AS ENUM ('LOW', 'MEDIUM', 'HIGH', 'URGENT');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE dev_todo_status AS ENUM ('TODO', 'IN_PROGRESS', 'DONE', 'BLOCKED');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Context: key-value 저장소 (현재 스프린트, 진행 상태 등)
CREATE TABLE IF NOT EXISTS "__DEV_context" (
  id          SERIAL PRIMARY KEY,
  key         VARCHAR(100) NOT NULL UNIQUE,
  value       TEXT,
  meta        JSONB,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Features: 전체 기능 리스트업
CREATE TABLE IF NOT EXISTS "__DEV_features" (
  id          SERIAL PRIMARY KEY,
  category    VARCHAR(50)  NOT NULL,
  name        VARCHAR(200) NOT NULL,
  description TEXT,
  status      dev_feature_status NOT NULL DEFAULT 'PLANNED',
  sort_order  INTEGER NOT NULL DEFAULT 0,
  meta        JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- Todos: TODO 관리
CREATE TABLE IF NOT EXISTS "__DEV_todos" (
  id          SERIAL PRIMARY KEY,
  title       VARCHAR(300) NOT NULL,
  description TEXT,
  priority    dev_todo_priority NOT NULL DEFAULT 'MEDIUM',
  status      dev_todo_status   NOT NULL DEFAULT 'TODO',
  feature_id  INTEGER REFERENCES "__DEV_features"(id) ON DELETE SET NULL,
  due_date    DATE,
  meta        JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_dev_features_status   ON "__DEV_features" (status);
CREATE INDEX IF NOT EXISTS idx_dev_features_category ON "__DEV_features" (category);
CREATE INDEX IF NOT EXISTS idx_dev_todos_status      ON "__DEV_todos" (status);
CREATE INDEX IF NOT EXISTS idx_dev_todos_priority    ON "__DEV_todos" (priority);
CREATE INDEX IF NOT EXISTS idx_dev_todos_feature     ON "__DEV_todos" (feature_id);
