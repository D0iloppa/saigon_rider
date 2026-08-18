# 인계 — 키워드 알림 세션에 전달할 코드리뷰 지적 6건

> 작성: 2026-08-17 심야, 상용 준비도 구현 스레드(티켓 `2026-08-17-commercial-readiness-4persona`)
> **이 문서는 다른 스레드(키워드 알림 / 마켓 리스트 밀도 개편 작업)의 소유 영역에 대한 지적이다.**
> 우리 스레드는 그 파일들을 **건드리지 않았다** — 동시 편집 충돌을 피하기 위해 발견 사실만 넘긴다.

## 배경

우리 스레드가 `/code-review` 를 두 번 돌렸다:
- `high 728031b..HEAD -- backend/app` → 지적 12건
- `medium 728031b..HEAD -- frontend/src` → 지적 9건

리뷰 범위가 커밋 레인지였기 때문에 **그 세션의 커밋(`58bb3b9`·`45652ef`·`ae4064d`)도 함께 검토됐다.** 아래 6건이 그 결과다. 우리 것 15건은 이미 전부 수정 완료했다.

## 지적 목록

### 1. `PATCH /market/keyword-alerts/{id}` 가 정규화 충돌 시 조용히 no-op (MEDIUM)
**위치**: `backend/app/routers/market.py:1384` 부근

같은 사용자의 다른 행이 이미 대상 `keyword_norm` 을 가지고 있으면, 핸들러가 **그 다른 행을 반환하고 대상 `alert` 은 손대지 않는다.**

재현: 알림 A="honda", B="yamaha" 인 상태에서 `PATCH B {keyword: "Honda"}` → **200 + A 의 본문**. B 는 여전히 "yamaha" 이고 삭제된 것도 없다. 클라이언트는 이름 변경 성공으로 보는데 목록은 그대로다.

**리뷰 권고**: `POST` 의 멱등 반환 의미가 `PATCH` 에 그대로 이전되지 않는다 — **409 를 내거나, B 를 제거**해야 한다.

### 2. 정규화 백필 이전 행에 대해 중복 탐지가 실패 (LOW)
**위치**: `backend/app/routers/market.py:1321` 부근

`keyword_norm == keyword_norm` 비교는 `keyword_norm IS NULL` 인 행에 절대 매칭되지 않는다. 마이그레이션 `180` 은 기존 행의 `keyword_norm` 을 NULL 로 두고 **수동 백필 스크립트(`backend/scripts/backfill_keyword_alert_norm.py`)가 돌기 전까지 NULL 이다.** `uq_mp_kw_alert` 는 `(user_id, keyword_norm)` 이고 NULL 은 충돌하지 않는다.

결과: 레거시 "Honda" 알림을 가진 사용자가 "honda" 를 추가하면 **두 번째 행이 생긴다** — 목록에 중복으로 보이고 새 상한 슬롯을 하나 먹는다.

**주의**: 백필 스크립트 실행이 배포 절차에 포함돼 있는지 확인이 필요하다.

### 3. `MarketKeywordAlerts.tsx` 삭제 버튼에 in-flight 가드가 없다 (LOW)
**위치**: `frontend/src/pages/market/MarketKeywordAlerts.tsx:138` (`handleRemove`)

`handleAdd`(`adding`)·`handleSaveEdit`(`savingEdit`)와 달리 가드가 없고 X 버튼이 비활성화되지 않는다. 두 번 탭하면 DELETE 가 두 번 나가고, 첫 건은 204, 두 번째는 404 `Alert not found` → **삭제가 실제로 성공했는데 사용자는 "알림 처리 실패" 를 본다.**

### 4. 추가·수정 성공이 `loadError` 를 해제하지 않는다 (LOW)
**위치**: `frontend/src/pages/market/MarketKeywordAlerts.tsx:78` 부근

초기 GET 이 실패해 에러 `StateBlock` + 재시도 UI 가 떠 있는 상태에서, 사용자가 키워드를 입력해 추가하면 **POST 는 성공하고 "키워드를 추가했어요" 토스트까지 뜬다.** 그런데 렌더는 여전히 `loadError` 분기라 목록과 `count` 줄이 숨겨진 채다 — 방금 만든 키워드가 화면 어디에도 없다.

### 5. `client.ts` 의 422 예외 처리가 주석은 엔드포인트 한정인데 실제로는 전역 정책 (LOW)
**위치**: `frontend/src/api/client.ts:120`

`rethrow: true` 를 넘기지 않는 호출부에서 `HTTPException(422, detail={"code": ...})` 를 내는 **아무 엔드포인트나** 사용자에게 원문 `HTTP 422 | {"code":"…","max_count":20}` 토스트를 보여준다(종전에는 불투명한 `HTTP 422 | POST /api/bff/…`).

지금은 dict-detail 422 를 쓰는 곳이 키워드 알림 2개뿐이고 두 호출부가 모두 `rethrow` 를 쓰므로 **아직 유출되지 않는다.** 다만 "호출부가 `code` 로 분기해야 한다"는 계약이 강제되지 않은 상태로 가드가 전역 완화됐다.

### 6. `ProfileMain.tsx` 카드 클릭이 ⋮ 드롭다운을 닫을 수 없게 만든다 (LOW)
**위치**: `frontend/src/pages/profile/ProfileMain.tsx:682` — **이 파일은 아직 미커밋 상태다(작성 시점)**

새로 추가된 카드 레벨 `onClick={() => navigate('/feed/post/…')}` 때문에, ⋮ 메뉴가 열린 상태에서 **"바깥을 탭해 닫기" 제스처가 카드 내비게이션으로 먹힌다.** 백드롭도 outside-click 핸들러도 없다(`menuPostId` 는 ⋮ 버튼만 설정한다).

## 우리 스레드가 같은 파일에 남긴 것 (참고)

- `frontend/src/locales/{ko,en,vi}/translation.json` — `market.likeCount` 키 추가(커밋 `329f3e8`). 그 커밋에 **그쪽 세션의 ko 정렬 라벨 변경 2줄**(`가격 낮은순`→`저가순`, `가격 높은순`→`고가순`)이 함께 들어갔다. 값은 그쪽 의도와 같아 되돌리지 않았다.
- `frontend/src/pages/auth/Suspended.tsx`·`Suspended.module.css` — 고객센터 진입점 추가(커밋 `f7f0b9f`). 기존 키 `settings.support` 재사용으로 로케일 무수정.
- `backend/app/routers/market.py` — 금칙어 검사 순서 변경(`update_listing`), `_banned_keywords_norm` 빈-키워드 방어, 광고 이벤트 수집 API 추가. 키워드 알림 로직은 건드리지 않았다.

## 교훈 (양쪽 세션 공통)

로케일 JSON 을 두 세션이 동시 편집해 **오늘 두 번 사고가 났다**: ① 우리 키가 그쪽 커밋 과정에서 유실 ② 그쪽 변경 2줄이 우리 커밋에 포함. `git add <경로>` pathspec 은 **다른 파일**은 막지만 **같은 파일의 동시 편집**은 막지 못한다. 공유 파일(로케일·페이지맵)은 한쪽이 커밋을 마친 뒤 다른 쪽이 만지는 편이 안전하다.
