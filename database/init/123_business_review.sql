-- ================================================================
-- 123_business_review.sql (업체 후기 — 동네지도 + 메뉴 "후기쓰기" 실배선)
-- 업체(business_profile)에 남기는 별점+텍스트 후기.
--   - RepairReview(방문 건별 기록형, UNIQUE 없음)와 달리 장소 평가형(당근 모델) —
--     유저당 업체 1건 UNIQUE + 재작성 시 갱신(upsert). 사진 첨부는 범위 밖.
--
-- dev 시드: 117 의 APPROVED 업체 중 2곳에 후기 3건 (시각검증용)
--   [DEV] Bình Thạnh Moto Care ← Test Buyer 5★ / Quận 1 owner 계정 4★
--   [DEV] Saigon Rider Shop    ← Test Buyer 5★
--   reviewer 는 phone 자연키로 조회 — 없으면 INSERT ... SELECT 가 0행 (fresh DB 안전).
-- 멱등성: UNIQUE(profile_id, user_id) + ON CONFLICT DO NOTHING.
-- ================================================================

CREATE TABLE IF NOT EXISTS business_review (
    id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    profile_id UUID NOT NULL REFERENCES business_profile(id) ON DELETE CASCADE,
    user_id    UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    rating     SMALLINT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    body       TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_business_review_profile_user UNIQUE (profile_id, user_id)
);

CREATE INDEX IF NOT EXISTS idx_biz_review_profile_created
    ON business_review (profile_id, created_at DESC);

-- ── dev 시드 (멱등: ON CONFLICT DO NOTHING) ─────────────────────

INSERT INTO business_review (profile_id, user_id, rating, body, created_at, updated_at)
SELECT p.id, u.id, 5,
       '체인 교체하러 갔는데 사장님이 꼼꼼하게 봐주셨어요. 작업도 빠르고 가격도 정직합니다.',
       now() - interval '3 days', now() - interval '3 days'
FROM business_profile p, users u
WHERE p.name LIKE '[DEV] Bình Thạnh%' AND u.phone = '+84-DEV-BUYER-01'
ON CONFLICT (profile_id, user_id) DO NOTHING;

INSERT INTO business_review (profile_id, user_id, rating, body, created_at, updated_at)
SELECT p.id, u.id, 4,
       '오일 교환 잘 받았습니다. 대기 공간이 좁은 것만 빼면 만족해요.',
       now() - interval '1 day', now() - interval '1 day'
FROM business_profile p, users u
WHERE p.name LIKE '[DEV] Bình Thạnh%' AND u.phone = '+84-ADV-002'
ON CONFLICT (profile_id, user_id) DO NOTHING;

INSERT INTO business_review (profile_id, user_id, rating, body, created_at, updated_at)
SELECT p.id, u.id, 5,
       '라이더 할인 받고 커피 마셨어요. 사장님이 친절하고 자리도 넓어서 자주 올 것 같아요.',
       now() - interval '5 hours', now() - interval '5 hours'
FROM business_profile p, users u
WHERE p.name LIKE '[DEV] Saigon Rider%' AND u.phone = '+84-DEV-BUYER-01'
ON CONFLICT (profile_id, user_id) DO NOTHING;
