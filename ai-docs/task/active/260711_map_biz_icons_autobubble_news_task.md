# 동네지도 업체 레이어 고도화 — 업종 아이콘 · 자동 말풍선 · 업체 소식 배선 (2026-07-11)

> **SoT**: 이 문서. 부모 맥락: [`260710_map_biz_pin_layer_task.md`](260710_map_biz_pin_layer_task.md) (P1 완료).
> P3 백로그 중 "업체 소식"의 **읽기 경로만 선행 인출**한다 (대표 지시, 2026-07-11).
> **Plane 등록 대기** — 이 세션에 Plane MCP 부재. 다음 Plane 가용 세션에서 Feature+서브 Todo 등록.

## 목적 (대표 요구, 2026-07-11 대화)

1. **줌·센터 자동 말풍선**: 업체 탭에서 충분히 줌인된 상태로 업체 핀이 화면 중앙 부근에 오면, 터치 없이 [새소식] 말풍선 자동 활성화. 말풍선 디자인은 현행 유지(결정 (a)).
2. **업종별 핀 아이콘**: 5개 카테고리(repair/wash/cafe/food/parts)에 맞는 아이콘을 지도 핀 + 카테고리 칩 + 업체 카드에 적용 (범위 결정: 전체).
3. **업체 소식 실데이터**: 말풍선의 mockup 카피("새소식 방금 전")를 실데이터로 전환. **신규 `business_news` 엔티티** (광고 BusinessAd와 별개 — 당근 비즈프로필 '소식' 모델). 이번엔 읽기 경로(테이블+시드+조회 API+말풍선 배선)까지. **업체측 등록 UI는 후속 태스크**(백로그).

## 확정된 해석·설계 결정

- 자동 활성화는 **탭 동작을 대체하지 않고 추가**. 판정은 뷰포트 bbox 디바운스(기존 500ms emit) 시점 = 제스처 idle.
- 발동 조건: `tab==='biz'` && 비검색 && 줌 게이트보다 깊은 줌(스팬 임계) && 중앙 근접(뷰포트 중앙 반경 내 최근접 1개).
- 중앙에서 벗어나면 자동 해제, 다른 핀이 오면 갈아탐. 임계 미만 줌에선 자동 로직 완전 비활성(탭 선택 보존).
- **시트는 움직이지 않는다** — 자동 활성화는 사용자 의도가 아니므로 snapToMid 없음 (바텀시트 원칙 준수). 카드 하이라이트·리스트 스크롤은 수행.
- 핀 아이콘: `MapMarkerV2.icon`(SVG path data, 24×24 기준) 확장 — 기존 BIZ_COLOR 원 + 흰 글리프. 칩·카드는 동일 path 를 쓰는 `<BizCatIcon>` 컴포넌트.
- 소식 폴백: 소식 있으면 eyebrow "새소식 · {timeAgo}" + 소식 제목, **없으면 "방금 전" 가짜 라벨 제거**하고 현행 소개 카피(업종·주소)만 표시 — 정직화.

## 서브태스크

| # | 내용 | 담당 모델 | 검증 |
|---|---|---|---|
| T1 | `business_news` 테이블 (init/118) + dev 시드(기존 117 시드 5개 업체 대상) | Sonnet 서브에이전트 | psql 적용·행 확인 |
| T2 | BFF `GET /biz/public/map` 응답에 `latest_news {title, created_at}` 포함 | Sonnet 서브에이전트 (T1과 동일 에이전트) | curl 응답 확인 |
| T3 | 업종 아이콘 5종 SVG path + `<BizCatIcon>` + MapMarkerV2.icon 렌더 (SaigonMapV5) | Fable (메인) | tsc/eslint/빌드 + 시각 |
| T4 | 카테고리 칩·업체 카드 아이콘 적용 | Fable (메인, T3 연속) | 상동 |
| T5 | 뷰포트 idle 자동 말풍선 활성/해제 로직 (NeighborhoodMap) | Fable (메인) | 시나리오: 줌인 센터→활성, 팬 아웃→해제, 저줌 탭→보존 |
| T6 | 말풍선 실데이터 배선 (api/biz.ts + timeAgo + i18n ko/en/vi) | Fable (메인) | tsc + 시드 데이터로 시각 |
| T7 | 재빌드·회귀(줌 게이트·GPS 컨텍스트 스모크)·qm-reviewer 독립 리뷰·커밋 | Fable + qm-reviewer | 리뷰 PASS |

**모델 라우팅 근거**: T1/T2 는 기존 biz.py·init 시드 패턴 미러링(기계적, 커버리지 관건) → Sonnet. T3~T6 은 커스텀 SVG 지도 제스처 fast-path·바텀시트 UX 원칙과 얽힌 로직 + 아이콘 시각 품질 판단 → Fable 메인.

## 후속 백로그 (이번 착수 금지)

- 업체측 소식 등록 UI (`/biz/manage` 하위) + admin 노출 (P3 잔여)
- 소식 목록 API (`GET /biz/public/:id/news`) + BizPublic 화면 소식 섹션
- 핀 뱃지(새 소식 있는 업체 강조 — 원 P3 "소식 핀 뱃지")

## 진행 기록

- 2026-07-11: 패키지 발행. 대표 결정 3건 확정(말풍선 (a) 현행 유지 / 신규 소식 엔티티 / 아이콘 전체 범위).
- 2026-07-11: **T1~T6 구현·검증 완료, 커밋됨.** T1/T2 Sonnet 서브에이전트(init/118 시드 4건·3업체, `/biz/public/map` latest_news DISTINCT ON, ruff 0, curl 검증). T3~T6 Fable 메인. 검증: tsc 0 / eslint 신규 경고 0 / 헤드리스 시각 3종 PASS — deep(자동 말풍선+실소식 "새소식 2시간 전") / nonews(폴백 카피, 가짜 라벨 없음) / wide(줌아웃 비활성). AUTO_BUBBLE_MAX_LAT_SPAN 은 세로 폰 종횡비 반영해 0.02→0.03 조정(검증 중 발견). **잔여**: T7 qm-reviewer 독립 리뷰(후속 패키지와 묶어 진행), codebase-memory 재인덱싱(이 세션 MCP 끊김), 운영 배포 시 init/118+BFF 재시작+프론트 재빌드.
- 후속 패키지로 확장 이관: [`260711_map_daangn_ux_task.md`](260711_map_daangn_ux_task.md) (포스트 패널·카테고리 DB화·읽음 뱃지 — 소식 사진 N장 포함).
