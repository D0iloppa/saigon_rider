-- =====================================================
-- 166: 침수 예측 잡의 구역별 "마지막 성공 실행 시각" 영속화 (F-11 잔여 갭)
--   158 은 이전에 성공한 적 있는 구역의 snapshot 을 stale 로 보존해 구분하지만,
--   한 번도 성공한 적 없는 구역은 보존할 snapshot 자체가 없어 "정상 저위험"과
--   "확인 불가"가 구별되지 않았다. district_code 단위로 마지막 성공 시각만 둔다
--   (감사 로그 아님 — predict_flood_risk 잡이 성공 시에만 UPSERT).
-- =====================================================

CREATE TABLE IF NOT EXISTS flood_prediction_status (
    district_code   varchar(20) PRIMARY KEY,
    last_success_at timestamptz NOT NULL
);

-- 배포 직후 첫 잡 실행 전까지의 오탐(이미 정상 운영 중인 구역이 일시적으로
-- "확인 불가"로 뜨는 것) 방지 — 현재 non-stale snapshot 이 있는 구역은 이미
-- 성공한 적이 있다는 뜻이므로 지금 시각으로 시드한다. 멱등(ON CONFLICT DO NOTHING).
INSERT INTO flood_prediction_status (district_code, last_success_at)
SELECT DISTINCT district_code, now()
FROM flood_risk_daily
WHERE is_stale = FALSE AND district_code IS NOT NULL
ON CONFLICT (district_code) DO NOTHING;
