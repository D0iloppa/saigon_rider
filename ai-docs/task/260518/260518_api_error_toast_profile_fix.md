# API 에러 Toast 알림 + 프로필 500 수정

## 배경

회원가입(프로필 설정) 시 `PUT /api/bff/profile` 호출이 500 Internal Server Error를 반환하지만, 프론트엔드에 에러 알림이 표시되지 않는 문제.

## 작업 항목

### 1. API 클라이언트 에러 Toast (완료 ✅)

- `frontend/src/api/client.ts`의 `realFetch`, `realFetchForm` 함수에서 에러 응답 시 `toast.error(message)` 호출 후 re-throw
- 개별 API 호출 콜백마다 toast를 붙이는 방식 대신 단일 진입점에서 처리하여 누락 방지

### 2. 프로필 500 에러 수정 (완료 ✅)

- **원인**: `profile.py:145`에서 `user.rider_type = body.rider_type` — `rider_type`은 SQLAlchemy relationship인데 문자열을 직접 할당
- **수정**: `RiderType` 테이블에서 `code`로 조회 → `user.rider_type_id = rt.id`로 FK 할당
- **추가 수정**: commit 후 `db.refresh(user, ["rider_type"])`로 관계 재로드 (응답에 rider_type 객체 포함)

### 3. 인증 방식 구현 (미착수 — auth_todo 참조)

- 현재 회원가입/로그인 시 OTP 인증 미구현 (전화번호만으로 가입/로그인)
- Feature "프로필 초기 설정" (id=4)은 IN_PROGRESS 유지 — 인증 체계 완성 후 DONE 전환
- 상세: `task/active/260515_auth_todo.md` 참조

## 관련 파일

- `frontend/src/api/client.ts` — API 클라이언트 (에러 toast 추가됨)
- `frontend/src/components/ui/Toast.ts` — Toast 래퍼 (sonner)
- `frontend/src/api/profile.ts` — `apiSaveProfileSetup()` 함수
- `backend/app/routers/profile.py` — 프로필 PUT 엔드포인트 (추정)
