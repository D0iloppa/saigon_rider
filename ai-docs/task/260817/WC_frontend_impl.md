# 키워드 알림 프론트 구현 — WC (2026-08-17)

W2 감사(§⑥-B 권장안, 대표 결정 D-4) 이행. 전용 페이지 `/market/keyword-alerts` 신설 + 결함 4건 수정 + 진입점 3곳 배선 + 에러 3종 분기.

## 신규 파일
- `frontend/src/pages/market/MarketKeywordAlerts.tsx` — 목록·추가·수정·삭제 전용 페이지
- `frontend/src/pages/market/MarketKeywordAlerts.module.css` — 페이지 전용 스타일

## 수정 파일
- `frontend/src/App.tsx` — lazy import + `/market/keyword-alerts` 라우트(`PrivateRoute`, `MarketWishlist`와 동일 패턴)
- `frontend/src/pages/market/MarketMain.tsx` — 바텀시트(`alertOpen`/`alerts`/`newKw`/`openAlerts`/`handleAddKw`/`handleRemoveKw` 및 JSX) 완전 제거, 헤더 Bell 버튼·빈 상태 CTA 두 진입점을 `navigate('/market/keyword-alerts')`로 교체. 고아 import(`addKeywordAlert`/`fetchKeywordAlerts`/`removeKeywordAlert`/`KeywordAlert`/`Button`/`X`/`toast`) 정리
- `frontend/src/pages/market/MarketMain.module.css` — 죽은 `.alertSheet/.alertTitle/.alertDesc/.alertInputRow/.alertInput/.alertChips/.alertChip/.alertChipX/.alertEmpty` 제거
- `frontend/src/api/client.ts` — `extractErrorMessage`의 422 처리에 예외 추가(구조화 오류 `{code,...}`면 노출, pydantic 검증 배열이면 종전대로 은닉)
- `frontend/src/pages/settings/NotiSettings.tsx` — D-1: 키워드 섹션 캡션을 `/market/keyword-alerts` 링크 버튼으로 격상
- `frontend/src/pages/settings/Settings.module.css` — `.captionLink` 스타일 추가
- `frontend/src/pages/notifications/NotificationInbox.tsx` — TopBar `rightContent`에 키워드 알림 관리 진입 아이콘 추가(3번째 진입점)
- `frontend/src/pages/notifications/NotificationInbox.module.css` — `.iconBtn` 스타일 추가
- `frontend/src/locales/{ko,vi,en}/translation.json` — `market.*` 신규 키 3개(`keywordTooShort`/`keywordBanned`/`keywordDuplicate`) 전 로케일 추가, vi/en에 ko에만 있던 기존 8개 키(`keywordAdded`/`keywordUpdated`/`keywordRemoved`/`keywordCount`/`keywordLimitReached`/`keywordEdit`/`keywordEditTitle`/`keywordLoadError`) 이식해 패리티 복구

## D-1 / D-4 이행 방식
- **D-4**: `MarketMain.tsx` 바텀시트를 폐기하고 `MarketKeywordAlerts.tsx` 전용 페이지로 승격. 커밋 `4762726`(ProfileCard→UserProfile) 선례를 미러링 — `TopBar`(뒤로가기 자동, `SECTION_ROOTS`에 `/market` 이미 등록돼 있어 별도 처리 불필요) + `PrivateRoute` 래핑(`MarketWishlist`와 동일 패턴).
- **D-1**: `NotiSettings.tsx`의 `captionKey === 'settings.notiKeywordCaption'`인 섹션만 `<p>`가 아니라 `<button onClick={() => navigate('/market/keyword-alerts')}>`로 렌더링. 나머지 섹션 캡션은 기존 그대로.

## 결함 4건 수정 지점
1. **로딩 상태 없음** → `MarketKeywordAlerts.tsx` `loading` state, 스켈레톤 3행(`.skelRow` + `shimmer` 클래스, 기존 관용구 재사용)
2. **조회 실패를 빈 목록으로 위장(F-12 회귀)** → `MarketKeywordAlerts.tsx`의 `loadError` state를 `keywords.length===0`과 분리, `StateBlock tone="error"` + `common.retry` 재시도 버튼(`MarketWishlist.tsx`/`UserProfile.tsx`와 동일 패턴)
3. **성공 피드백 없음** → 추가/수정/삭제 각각 `toast.success(...)` 호출(`handleAdd`/`handleSaveEdit`/`handleRemove`)
4. **관리 도구 없음** → 전용 페이지 자체가 해소. 추가로 개수 카운터(`market.keywordCount`, `n/max`), 인라인 수정(연필 아이콘 → 입력 필드 전환 → 체크/취소), 리스트 행(칩 wrap 대신 세로 리스트 — 다건 스캔 개선, W2 §③ 대응)

## 진입점 3곳
1. `MarketMain.tsx` 헤더 Bell 아이콘 버튼 — `navigate('/market/keyword-alerts')`
2. `MarketMain.tsx` 빈 상태(비필터) "키워드 알림 받기" CTA — 동일 navigate
3. `NotiSettings.tsx` 키워드 섹션 캡션 링크(D-1)
4. (추가 배선) `NotificationInbox.tsx` TopBar 우측 Bell 아이콘 — W2 §① 진입점 지도의 "KEYWORD 알림 수신 표시" 위치에 관리 화면 진입 도선을 신설(감사 시점엔 없던 실제 코드 배선, 알림 받은 사용자의 관리 동선 확보)

> 요청은 "3곳"이었으나 MarketMain 안에 물리적으로 2개 버튼(Bell/CTA)이 있어 실질 배선 지점은 4개소가 됐다. 파일 단위로는 MarketMain/NotiSettings/NotificationInbox 3개 파일.

## 에러 3종 UI 분기
`api/client.ts`의 422 처리 수정으로 `addKeywordAlert`/`updateKeywordAlert`(둘 다 `rethrow:true`)가 던지는 `Error.message`에 `{code,...}` JSON이 실리도록 함. `MarketKeywordAlerts.tsx`의 `describeError()`가 `MarketDetail.tsx`의 `active_appointment` 정규식 판별과 동일한 패턴으로 분기:
- `"code":"keyword_too_short"` → `market.keywordTooShort`(`min_length` 값 보간)
- `"code":"banned_keyword"` → `market.keywordBanned`
- `"code":"keyword_alert_limit"` → `market.keywordLimitReached`(`max_count` 값 보간)
- 그 외(네트워크 오류 등) → `market.alertError`(기존 뭉뚱그린 문구, 최후 폴백만)
- **중복 등록(idempotent 200/201)**: 프론트가 응답 `id`가 이미 로컬 목록에 있는지로 판별해 `market.keywordDuplicate`("이미 등록된 키워드예요") 토스트 — 에러가 아니라 성공 토스트로 처리

## 로케일 패리티 실측
```
ko: 1984 keys, vi: 1984 keys, en: 1984 keys   (grep -c '": "' 기준)
python3 -c "json.load(...)" 3파일 모두 OK (유효 JSON)
```

## tsc/eslint 실제 출력
```
$ npx tsc --noEmit
(출력 없음 — 0 error)

$ npx eslint src/
✖ 268 problems (0 errors, 268 warnings)
  0 errors and 2 warnings potentially fixable with the `--fix` option.
```
경고 268건은 모두 기존 코드 패턴(react-hooks/set-state-in-effect, no-explicit-any 등)이며 이번 변경으로 새로 발생한 항목이 아님(변경 파일 한정 실행에서도 동일한 카테고리의 warning만 확인, error 0).

## 빌드 검증
```
docker compose --env-file .env up --build -d frontend   # 성공, saigon_frontend Up
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:18090/market/keyword-alerts   # 200
```

## 실기기 미검증 항목
- 실제 로그인 상태에서 추가/수정/삭제 API 왕복(백엔드는 이번 세션에서 수정하지 않음 — 다른 워커 담당분 그대로 사용, 코드 레벨 계약만 맞춤)
- 22자 이상 다건(10~30개) 등록 시 실제 스크롤 스캔 체감(레이아웃은 flex column list로 시각 확인만, 디바이스 실측 아님)
- 베트남어 성조 정규화 중복 판정(백엔드 위임 — 프론트는 재구현하지 않음, id 매칭으로만 대응)
- push 알림 수신 후 `NotificationInbox` 신규 아이콘 실제 노출 여부(웹뷰 렌더는 확인, 네이티브 푸시 실기기 미검증)
