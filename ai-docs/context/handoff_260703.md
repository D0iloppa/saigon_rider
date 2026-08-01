# 핸드오프 — 전체 시스템 점검 후속 (2026-07-03)

> 발견 결함의 **전체 목록·증거·수정안**은 [`TEST/inspection_260703.md`](../TEST/inspection_260703.md) (SoT). 이 문서는 다음 세션이 바로 착수할 수 있게 **순서와 맥락**만 담는다.

## 현재 상태 스냅샷

- 서비스 10종 전부 정상 기동, Engine 마이그 head `sre054` = DB 일치, `.env` 키셋 정합.
- 워킹트리에 동네지도 v5 전환 작업(dd3c80b 후속)이 **미커밋**으로 남아 있음 — ESLint error 1건이 pre-commit을 막고 있는 상태.
- codebase-memory 그래프 재인덱싱 + ADR 복구 완료 (2026-07-03).

## 착수 순서 (권장)

### ① 미커밋 작업 마무리 — ✅ 완료 (2026-07-04)
`/code-review` high 정독 리뷰 → 확정 결함 10건 + 정리 3건 수정 적용 완료 (내역: 보고서 §5).
ESLint error 0(pre-commit 차단 해소)·tsc 0·ruff 0, dev DB ward 백필, 프론트 재빌드까지 반영됨.
**잔여: 시각검증(동네지도 검색/지역선택/현위치, info 4페이지 ◎ 버튼) 후 커밋·push만 하면 됨.**

### ② P0 보안 패치 — ✅ 완료 (2026-07-04)
S-1~S-7 전부 적용·dev 반영·스모크 통과. SoT [`task/active/260704_p0_security_fixes_task.md`](../task/active/260704_p0_security_fixes_task.md).
부수 발견 2건도 수정: quest_status enum EXPIRED 누락(500 유발), export의 `earned_at` 비존재 속성.
- ⚠️ 잔여: 요청단 세션토큰 검증은 **SGR-B2**로 분리(sessionToken=bcrypt 대조라 세션테이블/JWT 선행 필요 — 조사로 확정). X-User-Id 자기신고 약점 자체는 남아 있음.
- 운영 배포 시: compose `:?` 두 키 필수 + nginx conf 반영.

### ③ P1 워커·머니경로 (2~3일)
- **E-1이 최우선**: 워커 per-message 격리 + DLQ. 과거 "거리 동결" 장애가 지금도 재현 가능한 상태이며, E-4(콜백 유실 재시도)는 E-1 수정을 전제로 함
- E-2 워커 heartbeat healthcheck, E-9 bff_client retry(실측 dispatch failed 5회/72h)
- B-1 `_earn_gp_safe` suppress 3파일 — 6월에 잡은 사고와 동일 패턴이 남아있는 것이므로 weather식 패턴으로 통일 + 헬퍼 추출
- E-5~E-8 멱등키/쿼터 락 — 가챠·상점·쿠폰 (운영 트래픽 늘기 전에)

### ④ P2 규약·부채 — 보고서 §3 P2 표에서 여유 시 소화
A-1(유일한 불변식1 위반 raw SQL), A-2(레거시 url 신규쓰기 + photo_url XSS 표면), A-5(.dockerignore — **이미지 push 전 필수**), 나머지는 표 참조.

## 주의사항 (다음 세션이 알아야 할 것)

- **⚠️ codebase-memory 재인덱싱 미완(2026-07-04)**: 리뷰 수정 적용 도중 MCP 서버 연결이 끊겨 코드 변경분(map/market/utils/master.py, SaigonMapV5, NeighborhoodMap, SearchBox, useInfiniteScroll, `_bak` 삭제)이 그래프에 반영되지 않았다. 다음 세션에서 MCP 재연결 확인 후 `index_repository(mode: moderate)` 실행 → `manage_adr(get)`으로 ADR 생존 확인(비면 복구, §9 절차). ADR 자체는 260703에 복구돼 있음.

- **SaigonMapV2 삭제 금지** — V3/V4/legacy는 데드지만 V2는 WorldMap/MarketMain/LocationPickerSheet에서 활성.
- 재인덱싱(`index_repository`)이 ADR을 초기화할 수 있음 — 재인덱싱 후 `manage_adr(get)` 확인, 비면 복구 (agent-guidelines §9 절차).
- 워커는 자동 reload 없음 — engine 모델/스키마 변경 시 `docker restart saigon_worker` 필수 (과거 장애 원인).
- 운영 배포 대기 중인 마이그: sre051/sre052 + BFF init/049·072 (current.md 활성 태스크 참조).

## 이번 점검에서 확인된 "건드리지 않아도 되는 것"

naive datetime·engine_client 시그니처·validator 레지스트리·native 브리지·i18n 3로케일·이벤트 멱등성·RP 일일캡 — 전부 클린 판정 (보고서 §4). 이 영역들 재점검에 시간 쓰지 말 것.
