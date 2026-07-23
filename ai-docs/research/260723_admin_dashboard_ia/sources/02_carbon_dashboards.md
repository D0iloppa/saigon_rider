# Source 2 — Carbon Design System: Dashboards

- 발행자: IBM Carbon Design System
- 문서: Dashboards
- URL: https://carbondesignsystem.com/data-visualization/dashboards/
- 접근일: 2026-07-23
- 성격: 공식 디자인 시스템 가이드

## Raw evidence / notes

- 대시보드는 맥락에 따라 달라지므로 목적을 신중히 정해야 한다.
- presentation dashboard는 핵심 KPI의 현재 상태를 큰 그림으로 보여주며, 사용자가 더 집중·탐색할 영역을 고르게 안내한다.
- 중요도에 따라 데이터를 우선순위화하고 시각적 위계를 만든다. 가장 중요한 데이터는 가장 높은 대비와 가장 큰 면적을 갖는다.
- 좌→우, 상→하 F-pattern을 고려해 중요한 내용을 위쪽부터 둔다.
- 지표 수를 제한하고, 해석을 방해하는 비필수 정보는 필요할 때만 제공한다.
- 여백은 요소를 분리하거나 묶어 우선순위를 구별하고 시선 흐름을 만든다.
- exploration dashboard는 search/sort/filter, roll-up, drill-down으로 패턴을 찾게 한다.
- 차트 간 레이아웃·간격·범례 위치와 측정 단위를 일관되게 유지한다.
- annotation은 추세, 평균, 고점/저점을 해석하도록 돕되 데이터를 가리지 않아야 한다.

## 이 조사에 직접 쓰는 근거

1. 현재 같은 크기·대비의 카드 반복은 중요도 위계를 전달하지 못한다.
2. 상단에는 업무 위험/대기량처럼 “집중할 영역”을 크게 배치하고, 저우선순위 현황은 축약한다.
3. 관련 수치는 섹션과 여백으로 묶는다: 처리 대기 / 운영 흐름 / 생태계·콘텐츠 현황.
4. 추세를 넣을 때는 비교기간·단위·annotation이 있어야 하며, 단지 장식용 sparkline을 붙이지 않는다.

## 주의

- Carbon 문서도 presentation/exploration 유형을 포괄한다. 이 화면은 탐색형 BI가 아니라 업무 시작점이므로 필터·연동 차트는 최소화하고 상세 페이지 drill-down에 맡긴다.

