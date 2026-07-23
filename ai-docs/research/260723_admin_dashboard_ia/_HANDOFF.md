# 관리자 운영 대시보드 IA 조사 — HANDOFF

## 조사 정의

- 표면 요청: 관리자 대시보드에 들어갈 요소를 조사·정리한다.
- 실제 의도: 평면 KPI 카드 스캔을 줄이고, 운영자가 긴급 업무·상태·추세/이상을 빠르게 파악해 행동으로 이동하게 한다.
- 대상: 첨부된 Saigon Rider Operations Console `운영 현황` 화면.
- 범위: 기존 화면과 현재 확보 가능한 지표를 우선 재구성한다. 신규 백엔드 지표 발명, 경영진용 BI, 장식성 차트는 제외한다.
- 성공 조건: 공식/권위 출처와 화면 증거가, 불필요한 신규 지표 없이 구현 가능한 정보구조를 지지한다.

## 진행 상태

- [x] 조사 골격 및 원장 생성
- [x] Source 1 — Grafana dashboard best practices
- [x] Source 2 — IBM Carbon dashboard / data visualization guidance
- [x] Source 3 — Google Material data visualization / layout guidance
- [x] Source 4 — Nielsen Norman Group dashboard/scanning guidance
- [x] 최종 종합

## 현재 판단

- Grafana 공식 문서는 목표/질문 중심, 일반→구체의 진행, 문제가 있는 항목 중심 노출, 계층/drill-down, 의미 있는 색 사용을 지지한다.
- Carbon 공식 가이드는 중요도 기반 크기·대비, F-pattern, 제한된 지표, 여백에 의한 그룹화, 일관된 단위/간격을 지지한다.
- Material 공식 가이드는 개별 업무의 스캔·비교·행동에는 의미 있게 정렬된 data table/list가 적합하고, 비대칭 카드는 특별한 중요도를 강조할 때 쓰도록 뒷받침한다.
- NN/g는 목록 항목의 최소 핵심 속성, 중요도 순 시각 경로, 강조 과용 금지, 관련 정보의 시각적 그룹화를 지지한다.
- 최종 IA는 `확인 필요 → 운영 흐름 → 운영 상태` 3단이다.
- 1차는 기존 데이터 재배치만 수행한다. 최장 대기/SLA 초과/시계열은 API에 실제 데이터가 있을 때 2차로 둔다.
- `0건` 업무는 진입점 안정성을 위해 숨기지 않되 면적·대비를 낮춘다.

## 다음 작업

1. 구현 워커가 현재 admin dashboard 컴포넌트와 API shape를 확인한다.
2. 기존 데이터만으로 1차 IA를 구현한다.
3. 구현 후 desktop/좁은 viewport, 링크 목적지, loading/error/empty 상태를 검증한다.
2. 저장 직후 이 원장을 갱신한다.

## 산출물

- `_HANDOFF.md` — 재개 원장
- `sources/` — 출처별 raw evidence/notes
- `관리자_운영_대시보드_조사.md` — 최종 판단서
