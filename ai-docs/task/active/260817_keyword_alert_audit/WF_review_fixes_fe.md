# WF — 코드리뷰 지적 3건 수정 (프론트)

범위: F-5, F-6, F-7 만. 인접 코드 개선·리팩토링 없음. 커밋/git add 없음(요청에 따라 워킹트리에만 반영).

## F-5 — PATCH 응답 id 불일치로 목록 깨짐

- 파일: `frontend/src/pages/market/MarketKeywordAlerts.tsx` `handleSaveEdit` (구 117행 부근)
- 백엔드 근거: `backend/app/routers/market.py:1287` `update_keyword_alert` — 수정 후 정규화 결과가 `alert_id != id` 인 다른 기존 row 와 겹치면 그 기존 row 를 그대로 반환(POST 의 idempotent 패턴과 동일, 1309행 주석 확인). 원래 편집 대상 row 는 서버에서 갱신되지 않은 채 그대로 남는다.
- 처리 로직: `updated.id !== id` 로 병합 여부(`mergedIntoExisting`)를 판별해 분기.
  - 병합 안 됨(`updated.id === id`): 기존과 동일하게 `prev.map(x => x.id===id ? updated : x)`.
  - 병합됨(`updated.id !== id`): `prev.filter(x => x.id !== id).map(x => x.id===updated.id ? updated : x)` — 편집 대상 row 를 목록에서 제거하고, 반환된 기존 row 를 최신값으로 갱신. 결과적으로 목록에 동일 id 가 두 번 나타나지 않는다.
  - 토스트: 병합됐을 때는 기존 중복 처리와 동일한 `market.keywordDuplicate`("이미 등록된 키워드예요") 를 재사용, 아니면 기존 `market.keywordUpdated`.
- 재현 시나리오 검증(diff 기준 추론): "mu"(id=A)·"xe"(id=B) 보유 상태에서 "xe"(B) → "Mũ" 로 수정 → 서버가 A 를 반환(`updated.id = A ≠ B`) → `mergedIntoExisting=true` → `prev.filter(x=>x.id!==B)` 로 B 제거 후 `x.id===A` 인 항목을 A(서버값)로 갱신 → 최종 목록엔 A 하나만, 중복 id 없음. B 는 화면에서 사라지고(사용자 의도대로 "Mũ" 로 병합됐다는 토스트 노출) A 계속 표시.
- 새 키 신설 없음(`market.keywordDuplicate` 재사용).

## F-6 — 에러 이중 노출

- 파일: `frontend/src/api/market.ts`
  - `fetchKeywordAlerts` (구 572행): `api.realFetch<KeywordAlert[]>(url)` → `api.realFetch<KeywordAlert[]>(url, undefined, 'bff', { rethrow: true })`
  - `removeKeywordAlert` (구 592행): 세 번째/네 번째 인자로 `'bff', { rethrow: true }` 추가
- `client.ts:realFetch` 시그니처(`165-169행`) 확인 후 기존 `addKeywordAlert`/`updateKeywordAlert` 가 쓰던 형태(`(endpoint, options, 'bff', { rethrow: true })`)를 그대로 미러링. `fetchKeywordAlerts` 는 body 없는 GET 이라 두 번째 인자로 `undefined` 전달(옵션 기본값 `{}` 사용, 타입 OK).
- 호출부(`MarketKeywordAlerts.tsx`)는 이미 두 함수 모두 `.catch(...)` / `try/catch` 로 자체 에러 UI(StateBlock 재시도, 토스트)를 갖고 있어 추가 수정 불필요 — `rethrow: true` 만 추가하면 `client.ts` 의 원시 문자열 토스트가 억제되고 페이지의 친절한 에러 UI만 남는다.

## F-7 — 링크 문구 정정 (ko/vi/en, 키 재사용: `settings.notiKeywordCaption`)

문맥: `frontend/src/pages/settings/NotiSettings.tsx:110-113` 에서 이 키는 이제 `/market/keyword-alerts` 전용 페이지로 이동하는 버튼 라벨이다(마켓 바텀시트는 삭제됨, D-4).

| 로케일 | 파일 | 최종 텍스트 |
|---|---|---|
| ko | `frontend/src/locales/ko/translation.json:703` | 탭하면 키워드 알림을 등록·관리할 수 있어요 |
| vi (기본) | `frontend/src/locales/vi/translation.json:703` | Nhấn để đăng ký và quản lý cảnh báo từ khóa |
| en | `frontend/src/locales/en/translation.json:703` | Tap to manage your keyword alerts |

## 검증 결과

- `npx tsc --noEmit` → 출력 없음, 0 error.
- `npx eslint src/` → `268 problems (0 errors, 268 warnings)`. 전부 기존 경고(RideResultSuccess, LangSettings, ProfileEdit, CouponShop, MyCoupons, useUserStore 등 — 이번 변경과 무관한 파일/라인). 이번 수정 파일만 재확인(`MarketKeywordAlerts.tsx`, `api/market.ts`): 신규 error 0, warning 은 기존에 있던 `no-explicit-any`(market.ts, 다른 함수들) 및 `MarketKeywordAlerts.tsx:51`(`set-state-in-effect`, 기존 useEffect, 이번 diff 라인 아님)뿐 — 이번 변경으로 인한 신규 경고 없음.
- 로케일 키 개수/집합 동일성 실측(Node 스크립트로 3개 JSON flatten 비교):
  ```
  ko 1973 vi 1973 en 1973
  done   ← 양방향 missing-key 없음
  ```
- `docker compose --env-file .env up --build -d frontend` → 빌드 성공(`✓ built in 13.94s`), `saigon_frontend` 컨테이너 재생성·기동 완료.

## 미완/제외 항목

- 없음. 3건 모두 처리 완료. 지시대로 backend, ListingCard.tsx/css, MarketSearch.module.css, ProfileMain.tsx 는 건드리지 않음.
- 참고(수정하지 않음, 언급만): F-5 관련 backend `update_keyword_alert` 자체는 원 편집 대상 row(id)를 DB 에서 갱신하지 않고 그대로 둔 채 기존 row 를 반환하는 설계라, 서버 관점에서는 두 row 가 모두 살아있다(B 는 "xe" 그대로). 프론트는 지시대로 클라이언트 표시 상에서 중복 없이 병합해 보여주는 방식으로 처리했고, 백엔드 변경(409 등)은 요청에 따라 채택하지 않았다.
