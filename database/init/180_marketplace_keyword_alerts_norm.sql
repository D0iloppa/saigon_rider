-- ================================================================
-- 180_marketplace_keyword_alerts_norm.sql
-- 🔔 키워드 알림 정규화 컬럼 (W1 감사 260817_keyword_alert_audit §③-4, §④)
--   keyword_norm: search_norm.norm() 과 동일 규약(NFD 분해→결합기호 제거→NFC→
--   đ/Đ→d→lower→공백압축)으로 백필한다(scripts/backfill_keyword_alert_norm.py,
--   Python 스크립트 — SQL 로 같은 로직을 다시 구현하지 않는다, 두 벌이 되면 어긋난다).
--   기존 UNIQUE(user_id, lower(keyword)) 를 UNIQUE(user_id, keyword_norm) 으로 이관해
--   대소문자뿐 아니라 베트남어 성조 차이도 같은 키워드로 취급한다.
--   원본 keyword 컬럼은 표시용 원문으로 유지 — 매칭/중복판정만 keyword_norm 기준.
--
--   NOT NULL 은 이 마이그레이션에서 강제하지 않는다: 기존 볼륨의 행은 백필 전엔
--   전부 NULL 이고, 백필은 별도 Python 스크립트(수동 실행)이므로 이 SQL 실행 시점엔
--   아직 채워지지 않았다 — 여기서 NOT NULL 을 걸면 기존 행 전체가 즉시 위반돼
--   bff_migrate 가 실패한다. (NULL 은 UNIQUE 인덱스에서 서로 다른 값으로 취급되므로
--   백필 전 과도기에도 유니크 위반은 없다.)
-- ================================================================

ALTER TABLE marketplace_keyword_alerts ADD COLUMN IF NOT EXISTS keyword_norm TEXT;

-- 사장(死藏) 인덱스 정리: noti_worker 매칭 쿼리가 keyword_norm 기준 strpos() 로 전환되며
-- lower(keyword) 표현식 인덱스는 어떤 쿼리에서도 더 이상 쓰이지 않는다(W1 §③-1 과 동일 근거).
DROP INDEX IF EXISTS idx_mp_kw_alert_kw;

-- lower(keyword) 유니크 → keyword_norm 유니크로 이관.
DROP INDEX IF EXISTS uq_mp_kw_alert;
CREATE UNIQUE INDEX IF NOT EXISTS uq_mp_kw_alert ON marketplace_keyword_alerts (user_id, keyword_norm);
