-- =====================================================
-- 054: 침수 데이터 3층 모델 ②층 — 날씨 기반 일일 예측 위험
--   상습 핫스팟(flood_hotspot_stats) × 당일 강수예보(OpenWeather pop) →
--   강수확률 임계 이상 구역의 핫스팟을 "예상 침수 위험"으로 당일 적재.
--   실제 침수(flood_report)와 분리 — 예측은 별도 테이블(가짜 실신고 금지).
--   매일 BFF APScheduler 잡(predict_flood_risk)이 재생성.
-- =====================================================

CREATE TABLE IF NOT EXISTS flood_risk_daily (
    risk_id        BIGSERIAL    PRIMARY KEY,
    hotspot_id     BIGINT       REFERENCES flood_hotspot_stats(hotspot_id) ON DELETE CASCADE,
    district_code  VARCHAR(20),
    street_name    VARCHAR(200),
    lat            DECIMAL(10, 7) NOT NULL,
    lng            DECIMAL(10, 7) NOT NULL,
    rain_prob      INT          NOT NULL,            -- 0..100 (예보 pop)
    risk_level     VARCHAR(10)  NOT NULL,            -- 'MEDIUM' | 'HIGH'
    depth_hint     VARCHAR(20),                      -- 핫스팟 평균 깊이 힌트
    predicted_date DATE         NOT NULL,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
    expires_at     TIMESTAMPTZ  NOT NULL,
    geom           GEOGRAPHY(POINT, 4326)
                   GENERATED ALWAYS AS (
                       ST_SetSRID(ST_MakePoint(lng::double precision, lat::double precision), 4326)::geography
                   ) STORED
);

CREATE INDEX IF NOT EXISTS idx_flood_risk_expires ON flood_risk_daily(expires_at);
CREATE INDEX IF NOT EXISTS idx_flood_risk_geom    ON flood_risk_daily USING GIST(geom);
