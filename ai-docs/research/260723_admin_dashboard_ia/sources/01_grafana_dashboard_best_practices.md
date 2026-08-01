# Source 1 — Grafana dashboard best practices

- 발행자: Grafana Labs
- 문서: Grafana dashboard best practices
- URL: https://grafana.com/docs/grafana/latest/visualizations/dashboards/build-dashboards/best-practices/
- 접근일: 2026-07-23
- 성격: 공식 제품 문서

## Raw evidence / notes

- 많은 항목을 모니터링할 때 먼저 “무엇이 모니터링할 만큼 중요한지”를 정하는 일관된 전략이 필요하다.
- 대시보드는 하나의 이야기 또는 질문에 답해야 하며, 큰 것→작은 것, 일반→구체의 논리적 진행을 권장한다.
- 질문이 “어떤 서버가 문제인가?”라면 모든 서버 데이터를 보여줄 필요 없이 문제가 있는 것만 보여주는 예를 든다.
- 대시보드는 인지부하를 줄여야 한다. 각 그래프가 무엇인지 즉시 알 수 있고 다른 사용자가 길을 잃지 않아야 한다.
- 계층형 대시보드와 다음 수준으로의 drill-down, 경보 및 링크가 유도하는 directed browsing을 권장한다.
- 비교 대상의 규모가 다르면 나누고, 집계값이 중요한 신호를 묻지 않도록 한다.
- 색은 의미 있게 사용한다. 예: 정상/이상 의미와 threshold 연결.
- 불필요한 새로고침, 오해를 부를 수 있는 그래프 stacking을 피한다.

## 이 조사에 직접 쓰는 근거

1. 첫 화면은 “오늘 무엇을 처리해야 하는가?”에 답하도록 긴급/대기 업무를 먼저 둔다.
2. 모든 KPI를 동등 카드로 펼치지 않고, 이상 또는 주의가 필요한 항목을 우선 노출한다.
3. 요약→업무 큐/상태→세부 페이지의 계층과 링크를 만든다.
4. 경고색은 장식이 아니라 임계치/상태가 있을 때만 사용한다.

## 주의

- Grafana는 관측성 제품이므로 RED/USE 같은 인프라 지표 체계를 Saigon Rider 운영업무에 그대로 이식하지 않는다.
- 적용 가능한 것은 목표 중심, 인지부하, 계층/drill-down, 의미 있는 색 사용 원칙이다.

