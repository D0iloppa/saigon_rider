-- District enum 타입 생성 및 quests.district 컬럼 타입 변경
-- 기존 VARCHAR(100) 값이 enum 값과 일치하지 않으면 마이그레이션 실패하므로
-- 데이터 정리 후 실행할 것

CREATE TYPE district_enum AS ENUM (
  'Quận 1',
  'Quận 3',
  'Quận 4',
  'Quận 5',
  'Quận 6',
  'Quận 7',
  'Quận 8',
  'Quận 10',
  'Quận 11',
  'Quận 12',
  'Bình Thạnh',
  'Bình Tân',
  'Gò Vấp',
  'Phú Nhuận',
  'Tân Bình',
  'Tân Phú',
  'Thủ Đức'
);

ALTER TABLE quests
  ALTER COLUMN district TYPE district_enum
  USING district::district_enum;
