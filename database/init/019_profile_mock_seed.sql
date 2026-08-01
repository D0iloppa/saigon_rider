-- ================================================================
-- 019_profile_mock_seed.sql
-- 기본 프로필(아바타) 이미지 풀에 신규 5장 등록.
-- contents/system/profile-mock/ 하위 파일과 짝을 이룬다.
-- 풀 구성: 018 의 saigon-default.jpg + 본 5장 = 총 6장.
-- 프로필 사진이 없는 유저는 seed(user_id) 기반으로 이 풀에서 1장을 결정론적으로 받는다.
-- ================================================================

INSERT INTO contents (owner_type, file_path, mime_type, original_filename)
VALUES
    ('profile_mock', 'system/profile-mock/profile-mock-01.png', 'image/png', 'profile-mock-01.png'),
    ('profile_mock', 'system/profile-mock/profile-mock-02.png', 'image/png', 'profile-mock-02.png'),
    ('profile_mock', 'system/profile-mock/profile-mock-03.png', 'image/png', 'profile-mock-03.png'),
    ('profile_mock', 'system/profile-mock/profile-mock-04.png', 'image/png', 'profile-mock-04.png'),
    ('profile_mock', 'system/profile-mock/profile-mock-05.png', 'image/png', 'profile-mock-05.png')
ON CONFLICT DO NOTHING;
