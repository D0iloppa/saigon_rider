# 가챠 시네마틱 뽑기 연출 (charging → flash → reveal + SKIP)

> 260602 · 상태: ✅ 완료 (배포·시각검증 완료, Plane SGR-211 DONE)
> 발단: SGR-205(가차 hang) 후속 — "화면이 순식간에 지나가 도파민이 없다" 피드백
> 콘셉트: '다마키 신이치로(닌텐도)'라면 어떻게 만들지 — 긴장의 리듬·떡밥·스쿼시&스트레치·주스·플레이어 존중

## 목적

가챠 뽑기를 단순 로딩→결과 점프에서, **차징 긴장 → 플래시 → 순차 카드 리빌**의 게임필 연출로 전환. 반복 피로를 막는 SKIP 포함.

## 연출 상태 머신 (`GachaPull.tsx`)

`charging → flash → reveal → result` (+ 어느 단계서든 SKIP → result)

| 페이즈 | 연출 | 비고 |
|---|---|---|
| charging | 오브 맥동(심장박동) + 회전 링 2겹 + 외곽 글로우 + 빛기둥. 결과 도착 시 레어도색으로 글로우 전환(**골드=L/M 고레어 떡밥**) | `MIN_CHARGE_MS=1900`, 응답 빠르면 `TEASE_AFTER_RESULT_MS=750` 만큼 떡밥 유지 |
| flash | 화이트 방사 플래시 | `FLASH_MS=340` |
| reveal | 카드 스쿼시&스트레치 오버슈트 등장(0→1.14→1), `CARD_STAGGER_MS=140` 순차. best 카드 스포트라이트. 고레어 시 회전 광선(`bgRays`)+컨페티, M등급 풀스크린 신화 오버레이 | `revealDur = n*stagger + REVEAL_BUFFER_MS(650)` |
| result | 기존 결과 시트 슬라이드업(브레이크다운·인용구·천장바·액션) | |

**주스**: `native.haptic()` — 차징 시작 light / 터지는 순간 medium(일반)·heavy(L·M). 브라우저·미설치 환경 noop(try-catch).

**SKIP**: `skipRef` + 전 타이머 정리. 결과 도착 전 SKIP 시 도착 즉시 result로 점프(`then`의 skipRef 분기).

## 제약/주의

- 타이머는 `timersRef`(배열) 일괄 관리, 언마운트·재호출·SKIP 시 `clearTimers()`.
- 레어도색은 `data-tease` 속성 → CSS `--tease` var (C/R/E/L/M). 전역 `.rarity-card[data-r]` 와 충돌 없도록 `data-tease` 사용.
- SGR-205의 재진입 가드(`pulledKey`)·hang 수정 유지.

## 검증

1. tsc/eslint → 검증: 0 errors (기존 `any` warning 1건 unchanged) ✅
2. 프론트 docker 재빌드(vite build) → 검증: 빌드 성공 ✅
3. 브라우저 시각검증 → 검증: charging 맥동·골드 떡밥·플래시·순차 등장·M 풀스크린·SKIP 즉시 점프·"다시 뽑기" 재연출 (대기)

## 튜닝 포인트 (상수)

`MIN_CHARGE_MS / TEASE_AFTER_RESULT_MS / FLASH_MS / CARD_STAGGER_MS / REVEAL_BUFFER_MS` — `GachaPull.tsx` 상단. 길이·간격 한 곳에서 조정.
