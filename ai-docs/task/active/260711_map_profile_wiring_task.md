# 동네지도 프로필 실기능 배선 (2026-07-11)

> **SoT**: 이 문서. 대상: `frontend/src/pages/map/NeighborhoodProfile.tsx` (이전 세션 프론트 목업, 커밋 `프로필 WIP 선행 커밋` 참조).
> 병행 패키지: [`260711_map_daangn_ux_task.md`](260711_map_daangn_ux_task.md). **Plane 등록 대기**(세션 MCP 부재).
> 운용: 분석(Sonnet) → 구현(백엔드 Sonnet / 프론트 Sonnet) 에이전트 분리, 레퍼런스 `_tmp/image copy 44·45.png`.

## 대표 확정 결정 (2026-07-11)

1. **포장·주문 퀵메뉴 제거** — 해당 도메인 없음(당근 전용 개념). 향후 주문 도메인 생기면 재추가.
2. **관심목록 = 통합 탭** — [매물(기존 /market/wishlist 데이터 재사용) | 업체(신규 user_favorite_business)]. 찜 토글 진입점: 업체 상세(/biz/:id)·포스트 패널 카드. 지도 플로팅 하트 버튼은 범위 외(목업 유지 — "찜 업체만 보기" 필터 여부 별도 결정 필요).
3. **장소 제안 = 경량 제보 큐 신설** — place_submission(주유소 제보 패턴 미러) + admin 승인 큐. 승인=상태 변경만(자동 업체 전환 없음).
4. **탐험가 배너 = 카피 교체** — 칭호 시스템 없음·게임요소 폐기 결정 정합. `common.more` 미스키 버그 동시 수정.
5. (오케스트레이터 판단) **단골 업체 버튼은 "준비 중" 안내 토스트** — P3(팔로우+소식 구독)와 묶어 후속. 죽은 버튼 방지, 자리 보존.
6. (오케스트레이터 판단) **나의 후기 스탯 = 평균 별점/후기 수/도움돼요** — "조회수"는 데이터 소스가 없어 교체(정직화).

## 작업 항목

| # | 내용 | 담당 | 상태 |
|---|---|---|---|
| P-BE | user_favorite_business(init/121)+/biz/favorites API / place_submission(init/122)+제안 API+admin 큐 / GET /info/repair/my-reviews 집계 | Sonnet | 진행중 |
| P-FE | 퀵메뉴 배선(쿠폰 navigate·관심목록 통합 탭 화면·단골 준비중), 나의 후기 실데이터(스탯+목록+후기작성 navigate), 장소 제안 폼+제출, 배너 카피·common.more 수정, /biz/:id 찜 토글 | Sonnet (W3-FE 완료 후 — i18n·App.tsx 충돌 방지) | 대기 |

## 분석 요지 (분석 에이전트, 2026-07-11)

- 아바타·닉네임은 이미 실데이터(useUserStore). `common.more`는 존재하지 않는 키 참조(L55) — i18next 폴백으로 raw 키 노출.
- 받은 쿠폰: `/coupons/mine` 완비 → navigate 한 줄. 매물 찜: `/market/wishlist` 완비. 업체 찜·단골·장소 제안 큐·내 리뷰 집계 API 는 부재 → P-BE 신설.
- repair_review 에 upvotes 존재(사용자별 추적·증가 API 는 없음 — 집계 표시만), 리뷰 조회수 개념 없음.

## 진행 기록

- 2026-07-11: 분석 완료, 대표 결정 4건+오케스트레이터 판단 2건 확정. P-BE 투입.
