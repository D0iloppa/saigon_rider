# WH — 키워드 알림 프론트 계약 테스트

## 신규 파일
- `frontend/src/pages/market/keywordAlerts.contract.test.mjs` (신규 1개, 기존 관례대로 파일 1개에 assert 다건)

프로덕션 코드(.tsx/.ts) diff = 0줄. 커밋/`git add` 하지 않음.

## 실행 방법 (기존 관례 그대로)
```
cd frontend && node --test src/pages/market/keywordAlerts.contract.test.mjs
cd frontend && node --test src/pages/market/*.contract.test.mjs   # 마켓 전체 스위트
```
`package.json` 에 전용 test 스크립트가 없어(기존 6개 파일도 마찬가지) 기존 6개 파일이 쓰던 것과 동일한 `node --test` 커맨드를 그대로 사용.

## 계약 7건 ↔ assert 대조표

| # | 계약 | 테스트 | 핵심 assert |
|---|---|---|---|
| 1 | F-5 회귀(PATCH id 불일치 idempotent 병합) | `F-5: PATCH response with a different id ...` | `mergedIntoExisting = updated.id !== id` 존재, 병합 시 `prev.filter(x.id!==id).map(...updated.id...)`, 비병합 시 `prev.map(x.id===id?updated:x)` |
| 2 | 에러 3종 분기 | `error 3-way branching: ...` | `describeError` 본문에 `keyword_too_short`/`banned_keyword`/`keyword_alert_limit` 코드 매칭 + 각각 `keywordTooShort`/`keywordBanned`/`keywordLimitReached` i18n 키, distinct key 개수 ≥3 |
| 3 | F-12(조회 실패=빈 목록 위장 금지) | `F-12: load failure renders an error state with retry ...` | `.catch(() => setLoadError(true))` 존재, `loadError ? (` 분기가 `keywords.length === 0` 분기보다 앞서 등장, 해당 블록에 `tone="error"` + `onAction={() => setRefreshKey` |
| 4 | `rethrow:true` 4함수 | `rethrow:true contract: ...` | `fetchKeywordAlerts`/`addKeywordAlert`/`updateKeywordAlert`/`removeKeywordAlert` 각 함수 본문에 `rethrow: true` |
| 5 | 진입점 4곳 배선 + 바텀시트 미부활 | `entry points: ...` / `MarketMain does not resurrect ...` | MarketMain 벨 버튼(aria-label=`market.keywordAlerts`)·매물0건 CTA(`emptyKeywordAlert` 주변)·`NotificationInbox.tsx`·`NotiSettings.tsx` caption 링크 모두 `navigate('/market/keyword-alerts')`, `App.tsx` 라우트에 `PrivateRoute` 래핑 확인. 별도 테스트로 `MarketMain.tsx` 에 `newKw` 부재 + `MarketMain.module.css` 에 `.alert*` 클래스 부재 |
| 6 | 정규화 프론트 재구현 금지 | `normalization stays backend-only: ...` | `MarketKeywordAlerts.tsx`/`api/market.ts` 에 `normalize(`, `NFD`/`NFKD`, 성조 결합기호 범위(`̀-ͯ`) 패턴 부재 확인 |
| 7 | i18n 3로케일 패리티 | `i18n parity: ...` | 신규 17개 키(`keywordAlerts`~`keywordDuplicate`) + `emptyKeywordAlert` 이 ko/vi/en 전부에서 non-empty 문자열임을 확인. 선례는 `outOfServiceGuidance.contract.test.mjs` 의 인라인 로케일 루프 — 별도 헬퍼 신설 없이 그대로 재사용 |

## 실행 명령·출력

### 신규 파일 단독
```
$ node --test src/pages/market/keywordAlerts.contract.test.mjs
...
1..8
# tests 8
# suites 0
# pass 8
# fail 0
```

### 마켓 계약 테스트 전체(7개 파일, 신규 포함)
```
$ node --test src/pages/market/*.contract.test.mjs
...
1..24
# tests 24
# suites 0
# pass 23
# fail 1
```

## 발견했지만 고치지 않은 문제 (프로덕션 코드 수정 금지 범위)

**기존(신규 아님) 실패 1건 — 신규 테스트와 무관, 변경 전후 동일:**
`publicBrowsing.contract.test.mjs` 의 `guest state changes save the full current route and enter the existing OAuth flow` 가 `openAlerts is missing` 로 실패한다. 이 테스트는 `MarketMain.tsx` 에 `openAlerts`/`handleAddKw`/`handleRemoveKw` 핸들러가 있고 각각 `if (!requireAuth()) return;` 로 게이트돼야 한다고 고정하고 있는데, 커밋 58bb3b9 이후(및 현재 미커밋 상태로 다른 세션이 편집 중인 `MarketMain.tsx`)에서 키워드 알림 바텀시트가 폐기되며 이 핸들러들이 사라졌다. **이 테스트 파일은 다른 세션이 소유한 미커밋 편집 범위(`MarketMain.tsx`)와 결합돼 있어 이번 작업 지시(해당 파일 읽기전용, 쓰기 금지)상 수정 대상이 아니다.** 이번 작업 착수 전부터 이미 실패 상태였음을 위에서 별도로 재현 확인(신규 테스트 추가 전: 16개 중 15 pass/1 fail, 동일 실패). 다른 세션이 `MarketMain.tsx` 커밋을 마무리할 때 `publicBrowsing.contract.test.mjs` 도 함께 갱신 필요 — 코드 오너에게 인지만 전달.

기타 발견된 진짜 버그: 없음.

## 미완 항목
없음 — 지시된 7개 계약 전부 커버, 목표 조건(신규 8 assert-test 전건 통과, 프로덕션 diff 0, 전체 스위트 baseline과 동일 실패 1건 외 회귀 없음) 충족.
