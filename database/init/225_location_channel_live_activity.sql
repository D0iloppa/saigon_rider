-- ================================================================
-- 225_location_channel_live_activity.sql
-- 실시간 위치공유 채널 Phase 3 (ai-docs/task/active/260829_live_location_channel_task.md §8 Phase 3).
--
-- (A) live_activity_tokens 에 kind='location' 을 지원하기 위한 컬럼 확장.
--   - kind 는 이미 VARCHAR(16) 로 자유 문자열이라 값 확장에 스키마 변경이 필요 없다 — 여기서는
--     `kind='location'` 일 때 어느 채널의 어느 참가자 관점인지 구분하는 channel_id 만 추가한다.
--     subject_id 는 'deal' 에서 appointment_id 역할을 하던 컬럼을 'location' 에서는 channel_id 로
--     그대로 재사용한다(값 의미가 kind 에 따라 갈릴 뿐, 컬럼 자체는 그대로 둔다) — channel_id 는
--     노티워커가 조인 없이 바로 필터링할 수 있도록 별도로도 들고 있는다(subject_id 와 동일 값).
-- (B) `marketplace_location_shares` 폐기 — 채널 모델(location_channels)로 대체됐다. DROP 은 하지
--     않고 rename 으로 보관한다(다음 릴리즈에 DROP). 재실행 시 이미 rename 됐으면 스킵(멱등).
--     이 스크립트는 매 부트스트랩마다 전체 재실행되고(001~ 전부 -f 로 다시 흐른다), 211/222 는
--     `CREATE TABLE/INDEX IF NOT EXISTS` 로 `marketplace_location_shares` 를 다시 만들려 시도한다
--     — 이름만 바뀐 보관 테이블이 여전히 그 제약/인덱스 이름을 쥐고 있으면 211 의 인라인 UNIQUE
--     제약 생성이 이름 충돌로 에러난다(IF NOT EXISTS 는 제약 생성엔 적용되지 않음). 그래서 rename
--     과 함께 보관 테이블의 제약·인덱스 이름을 비워(DROP) 다음 부트스트랩이 새 이름으로 자유롭게
--     재생성할 수 있게 한다 — 보관 테이블은 조회 성능이 필요 없다(다음 릴리즈에 DROP TABLE 예정).
--
-- 재실행 멱등: ADD COLUMN IF NOT EXISTS, 조건부 DO 블록(전부 바깥 IF 하나에 종속)만 사용.
-- ================================================================

ALTER TABLE live_activity_tokens
    ADD COLUMN IF NOT EXISTS channel_id UUID NULL REFERENCES location_channels(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS live_activity_tokens_channel_idx ON live_activity_tokens (kind, channel_id);

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_tables
        WHERE schemaname = 'public' AND tablename = '_deprecated_marketplace_location_shares_260829'
    ) THEN
        IF EXISTS (SELECT 1 FROM pg_tables WHERE schemaname = 'public' AND tablename = 'marketplace_location_shares') THEN
            ALTER TABLE marketplace_location_shares RENAME TO _deprecated_marketplace_location_shares_260829;
            ALTER TABLE _deprecated_marketplace_location_shares_260829
                DROP CONSTRAINT IF EXISTS marketplace_location_shares_appointment_user_uq;
            DROP INDEX IF EXISTS idx_mkt_location_shares_appointment;
            DROP INDEX IF EXISTS idx_mkt_location_shares_conversation;
            DROP INDEX IF EXISTS ux_mkt_location_shares_standalone;
        END IF;
    ELSE
        -- 보관 테이블이 이미 있다 — 그 뒤로도 211/222 는 매 부트스트랩마다 `CREATE TABLE/INDEX
        -- IF NOT EXISTS` 로 빈 라이브 테이블을 다시 만든다(이름이 자유로워졌으므로). 이 테이블을
        -- 참조하는 코드는 전혀 없으므로(라우터는 전부 410 스텁) 안전하게 제거해 다음 재부팅에도
        -- 이름 충돌 없이 같은 상태로 수렴하게 한다.
        -- 방어 가드: 코드상 쓰기 경로가 없다는 불변식에만 의존하지 않고, 실행 시점에 행이 0 일 때만
        -- 제거한다. 만약 행이 있다면(예상 밖 쓰기) 그대로 두어 데이터를 보존하고 다음 릴리즈에서 사람이 판단한다.
        IF to_regclass('marketplace_location_shares') IS NOT NULL
           AND (SELECT count(*) FROM marketplace_location_shares) = 0 THEN
            DROP TABLE marketplace_location_shares;
        END IF;
    END IF;
END $$;
