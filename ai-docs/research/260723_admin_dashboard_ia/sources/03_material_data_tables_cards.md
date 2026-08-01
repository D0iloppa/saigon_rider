# Source 3 — Material Design: Data tables and card collections

- 발행자: Google Material Design
- 문서 1: Data tables
- URL 1: https://m2.material.io/design/components/data-tables.html
- 문서 2: Cards / card collections
- URL 2: https://m2.material.io/develop/web/components/cards
- 접근일: 2026-07-23
- 성격: 공식 디자인 시스템 가이드

## Raw evidence / notes

### Data tables

- 행과 열로 정보를 조직하여 사용자가 패턴과 인사이트를 쉽게 스캔하도록 한다.
- 의미 있는 방식(예: 위계 또는 알파벳순)으로 조직해야 한다.
- 논리적 구조로 내용을 쉽게 이해하도록 해야 한다.
- 상호작용 요소, alert badge, sorting, pagination, query/manipulation 도구를 포함할 수 있다.
- 필터/페이지 제어는 표 바로 위나 아래에 둔다.

### Card collections

- 여러 주제와 기능을 한 화면에 표시할 때 dashboard-style card collection을 사용할 수 있다.
- 카드 컬렉션의 filter/sort는 컬렉션 밖에 두고 전체 카드에 일관되게 적용한다.
- 비대칭 그리드는 카드의 개별성/특수성을 강조할 때 쓰는 패턴이다.

## 이 조사에 직접 쓰는 근거

1. 카드의 숫자만으로 업무를 완료할 수 없는 신고·문의·심사 대기는 상위 몇 건을 행 단위 “업무 큐”로 보여주는 편이 더 행동 가능하다.
2. 행에는 유형, 경과시간/접수시각, 상태, 대상, 바로가기 같은 비교 가능한 필드를 둔다.
3. 중요 항목만 비대칭/큰 카드로 강조하고, 모든 주제를 동일 카드로 취급하지 않는다.
4. 상세 필터링·정렬은 각 업무 목록 페이지에서 수행하고 대시보드에는 최소한의 우선순위 정렬만 둔다.

## 주의

- 대시보드 전체를 표로 바꾸자는 근거가 아니다. 처리할 개별 건을 보여줄 때만 compact list/table이 카드 카운트보다 적합하다는 근거다.

