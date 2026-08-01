-- 155: 광고 티어 플랜 설명(features_json) 정의 (2026-07-26)
-- 배경: 플랜 선택 화면이 이름/가격만 보여줘 선택 기준이 없다는 대표 지적.
-- 카피 근거(가짜 수치 금지 — 전부 코드에서 확인된 값만):
--   * 순번 3배   : ad_tiers.exposure_weight 프리미엄 3 / 일반 1,
--                  backend/app/services/ad_exposure.py:18 compute_weights(weight × ad_fee, ad_fee 는 전건 1)
--   * 6개마다    : frontend/src/lib/adPlacement.ts:8 AD_EVERY = 6
--   * 고른 분산  : ad_exposure.py:21 build_exposure_sequence — 결정적 smooth weighted round-robin (랜덤 아님)
--   * 노출면 2곳 : frontend/src/pages/market/MarketMain.tsx:353 (마켓 탭 /market),
--                  frontend/src/pages/home/WorldMapV2.tsx:434 (홈 탭 /home)
--                  ※ 동네지도 탭(/map, NeighborhoodMap.tsx)에는 광고 렌더가 없다 — 화면 이름 혼동 금지.
-- 주의: 노출 자체는 adPlacement.ts:18 ADS_ENABLED=false 로 아직 개시 전 — 현재시제 노출 보장 표현을 쓰지 않는다.
-- idempotent: id 고정 UPDATE (150_ad_tier_prices.sql 패턴). 재실행해도 같은 값으로 덮어쓴다.

UPDATE ad_tiers SET features_json = jsonb_build_array(
  '적극적으로 알려서 부가가치를 만들고 싶은 가게용 플랜',
  '광고 자리 순번을 일반 플랜의 3배로 배정하는 설계 (노출 가중치 3 : 1)',
  '목록 6개마다 열리는 광고 자리에, 한쪽으로 몰리지 않게 고르게 분산 배치',
  '홈 탭과 마켓 탭 목록 두 곳에 함께 실리는 구성'
), updated_at = NOW()
WHERE id = '00000000-0000-4000-8000-000000000001';  -- 프리미엄 (weight 3)

UPDATE ad_tiers SET features_json = jsonb_build_array(
  '가게가 있다는 것만 간단히 알리고 싶은 곳용 기본 플랜',
  '프리미엄과 같은 광고 자리에 실리고, 순번 배정만 1배 (노출 가중치 1)',
  '무작위 추첨이 아니라 정해진 순서로 도는 방식 — 노출이 한쪽에 쏠리지 않음',
  '홈 탭과 마켓 탭 목록 두 곳에 함께 실리는 구성'
), updated_at = NOW()
WHERE id = '00000000-0000-4000-8000-000000000002';  -- 일반 (weight 1)
