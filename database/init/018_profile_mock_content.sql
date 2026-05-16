-- ================================================================
-- 018_profile_mock_content.sql
-- content_owner_type enum 에 'profile_mock' 추가.
-- 프로필 사진 미설정 유저의 기본 아바타 풀(pool).
-- 프로필 사진이 없는 경우 seed(user_id) 기반으로 이 풀에서 하나를 결정론적으로 반환한다.
-- 기존 단일 폴백 saigon-default.jpg 를 profile-mock 풀의 일원으로 등록.
-- ================================================================

ALTER TYPE content_owner_type ADD VALUE IF NOT EXISTS 'profile_mock';

-- enum 변경은 같은 스크립트의 후속 INSERT 에서 참조 가능 (asyncpg 특성)
INSERT INTO contents (owner_type, file_path, mime_type, original_filename)
VALUES
    ('profile_mock', 'system/profile-mock/saigon-default.jpg', 'image/jpeg', 'saigon-default.jpg')
ON CONFLICT DO NOTHING;
