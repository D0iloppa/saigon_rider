-- ================================================================
-- 013_mock_content_type.sql
-- content_owner_type enum에 'mock' 추가
-- contents/system/mock/ 하위 이미지 5개 시드 등록
-- ================================================================

ALTER TYPE content_owner_type ADD VALUE IF NOT EXISTS 'mock';

-- enum 변경은 트랜잭션 커밋 후 반영되므로 별도 실행 필요
-- 아래 INSERT는 동일 스크립트에서 처리 가능 (asyncpg 드라이버 특성상 OK)

INSERT INTO contents (owner_type, file_path, mime_type, original_filename)
VALUES
    ('mock', 'system/mock/mock-01.jpg', 'image/jpeg', 'mock-01.jpg'),
    ('mock', 'system/mock/mock-02.jpg', 'image/jpeg', 'mock-02.jpg'),
    ('mock', 'system/mock/mock-03.jpg', 'image/jpeg', 'mock-03.jpg'),
    ('mock', 'system/mock/mock-04.jpg', 'image/jpeg', 'mock-04.jpg'),
    ('mock', 'system/mock/mock-05.jpg', 'image/jpeg', 'mock-05.jpg')
ON CONFLICT DO NOTHING;
