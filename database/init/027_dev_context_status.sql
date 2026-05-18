-- __DEV_context: status 이모지 컬럼 추가
-- 외부 사용자가 진행 상태를 시각적으로 추적할 수 있도록 이모지 기반 상태 표시
ALTER TABLE "__DEV_context" ADD COLUMN IF NOT EXISTS status VARCHAR(10) DEFAULT '⏸';
