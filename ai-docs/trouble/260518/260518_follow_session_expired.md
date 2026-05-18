# 팔로우 시 Session Expired 토스트 (리다이렉트 미동작)

> **상태**: ✅ 해결 (2026-05-18)

## 현상

- 피드에서 다른 사용자 프로필 탭 → 프로필 카드(BottomSheet) → 팔로우 버튼 클릭
- "Session expired" 토스트 에러만 표시되고, `/splash`(로그인 화면)로 리다이렉트되지 않음
- 기존에 세션 만료 시 `/splash`로 이동하도록 구현했으나 해당 로직이 작동하지 않는 상태

## 원인 분석

### 문제 1: 클라이언트 사전 검증이 리다이렉트를 우회

세션 만료 처리 경로가 2개 존재했으며, 하나만 리다이렉트를 트리거함:

- **경로 A (HTTP 401 응답)**: `realFetch()` → 401 → `handleSessionError()` → 리다이렉트 O
- **경로 B (클라이언트 사전 검증)**: `requireSession()` → `SessionExpiredError` 직접 throw → 리다이렉트 X

`followUser()`는 경로 B를 탐 → catch 블록이 잡아서 `toast.error("Session expired")`만 표시

### 문제 2: 서버 사이드 세션 검증 부재

- 백엔드에 인증 미들웨어/디펜던시가 없음
- 모든 엔드포인트가 클라이언트가 보낸 `body.user_id`를 무조건 신뢰
- 세션 만료를 감지할 서버 로직 자체가 없었음

## 수정 내역

### 419 세션 만료 프로토콜 도입

**백엔드:**
- `backend/app/deps.py` 신설 — `verify_user_session` 디펜던시
  - `X-User-Id` 헤더 검증 → 헤더 없음/UUID 파싱 실패/유저 미존재 시 **HTTP 419** 반환
- 모든 mutation 엔드포인트에 `Depends(verify_user_session)` 적용:
  - follows: follow/unfollow
  - feed: create/update/delete/like/comment/comment-like
  - profile: avatar/nickname/save
  - quests: accept/complete/bookmark
  - ride: submit
  - dm: create-conversation/send-message/mark-read
  - notifications: update-settings

**프론트엔드:**
- `client.ts`:
  - `sessionHeaders()` 추가 — 모든 요청에 `X-User-Id` 헤더 자동 전송
  - `realFetch`/`realFetchForm`에서 **419 || 401** → `handleSessionError()` (logout + `/splash` 이동)
  - `requireSession()`도 `handleSessionError()` 경유하도록 수정 (직접 throw 제거)
- `ProfileCard.tsx`: catch 블록에서 `SessionExpiredError`는 토스트 생략 (이미 리다이렉트됨)

### 세션 만료 플로우 (수정 후)

```
[클라이언트 사전 검증]
requireSession() → 세션 없음 → handleSessionError() → logout + /splash

[서버 사이드 검증]
realFetch() → X-User-Id 헤더 전송 → 서버 419 → handleSessionError() → logout + /splash
```

## 관련 파일

| 구분 | 경로 |
|------|------|
| 세션 디펜던시 (신규) | `backend/app/deps.py` |
| API 클라이언트 | `frontend/src/api/client.ts` |
| 프로필 카드 UI | `frontend/src/components/ProfileCard.tsx` |
| 세션 만료 핸들러 등록 | `frontend/src/App.tsx:69-74` |
| 적용 라우터 | follows, feed, profile, quests, ride, dm, notifications |
