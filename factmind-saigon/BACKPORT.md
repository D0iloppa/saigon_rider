# BACKPORT 원장

`core/`가 업스트림 FactMind(`site/*.py`)에서 바뀐 점을 기록하는 **append-only** 원장이다. 항목은 지우거나 고치지 않고 아래에 추가한다(상태 필드 `Forwarded`·`Verified`만 갱신 가능).
core를 바꾸는 커밋마다 항목 1개를 쓴다. 필드:
- `Kind`: `code`(코드 변경) | `learning`(측정에서 배운 것 — 증거 링크 필수) | `no-backport`(역이식 불필요)
- `Why`: 변경 이유와 증거 · `How-to-apply-upstream`: 업스트림에 적용하는 방법
- `Forwarded`: `pending` | `done <커밋>` | `declined <사유>` · `Verified`: `no` | `yes <패리티 run id>`

---

Id: BP-0001
Date: 2026-10-08
Kind: code
Files: core/fetch.py core/site_report.py core/access.py core/bundle.py core/verify.py core/indexnow.py core/bots.py core/locale/* ← site/public_delivery.py site/site_report.py site/self_service.py site/observation_collect.py site/observation_policy.json (upstream f6b1772)
Why: 초기 이식 — 시장·로캘 특이값(문구·BOTS·UA·국가·통화·요일·정책)을 기본값=업스트림인 파라미터로 분리. 동작 변경 없음.
How-to-apply-upstream: 로캘 파라미터화는 업스트림에 적용할 가치가 있음(ko-KR 기본값이라 업스트림 동작 불변) — 패리티 픽스처 생성 후(P2-B) 적용 여부 결정.
Forwarded: pending
Verified: no
