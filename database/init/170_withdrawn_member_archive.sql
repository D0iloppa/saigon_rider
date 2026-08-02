-- ================================================================
-- 170_withdrawn_member_archive.sql
-- 탈퇴회원 식별자 해시 아카이브 (대표 결정 2026-08-02).
--
-- 배경: 탈퇴 시 delete_account(routers/users.py)가 phone/nickname 을 즉시 익명화하고,
-- 30일 파기 배치(purge_deleted_accounts.py)가 user_oauth_identities 를 삭제하면
-- ① 같은 OAuth 계정 재가입 ② 같은 전화번호 재가입을 감지할 수단이 사라진다.
-- 부정이용(재가입·제재회피) 방지 추적을 위해 **식별자의 HMAC-SHA256 해시만** 1년 보관한다.
-- 원본 식별자·개인 데이터는 보관하지 않는다. pepper 는 env WITHDRAWN_HASH_PEPPER.
--
-- user_id FK: users 행은 익명화 상태로 영구 보존되므로(파기 배치가 users 를 삭제하지 않음)
-- FK 가 안전하다. ON DELETE CASCADE — 만약 향후 users 행이 삭제되면 아카이브도 함께 소멸.
--
-- UNIQUE: 같은 유저가 탈퇴→복구→재탈퇴를 반복해도 중복 행이 쌓이지 않게
-- (user_id, kind, provider, value_hash) 를 유일하게 강제한다. provider 는 kind='phone' 일 때
-- NULL 인데 PG 기본 UNIQUE 는 NULL 을 서로 다른 값으로 취급하므로 NULLS NOT DISTINCT(PG15+) 사용.
-- 멱등: IF NOT EXISTS.
-- ================================================================

CREATE TABLE IF NOT EXISTS withdrawn_member_archive (
    id          BIGSERIAL PRIMARY KEY,
    user_id     UUID        NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind        TEXT        NOT NULL CHECK (kind IN ('phone', 'oauth')),
    provider    TEXT        NULL,
    value_hash  TEXT        NOT NULL,
    deleted_at  TIMESTAMPTZ NOT NULL,
    purge_after TIMESTAMPTZ NOT NULL,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE NULLS NOT DISTINCT (user_id, kind, provider, value_hash)
);

-- 운영 조회 (admin withdrawn-check): 해시값으로 매칭 여부 검색
CREATE INDEX IF NOT EXISTS idx_wma_kind_value_hash ON withdrawn_member_archive (kind, value_hash);
-- 1년 경과분 파기 배치 (purge_deleted_accounts.py)
CREATE INDEX IF NOT EXISTS idx_wma_purge_after ON withdrawn_member_archive (purge_after);
