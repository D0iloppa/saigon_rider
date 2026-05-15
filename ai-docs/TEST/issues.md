# 이슈 / 블로커 로그

> 체크리스트 상태가 ❌ Fail 또는 🟡 진행중(블로커 의심)으로 바뀐 항목 상세 기록.  
> 정상(Pass)인 항목은 본 로그에 적지 않는다.  
> 본문 체크리스트: [checklist/](checklist/) · 진척도: [progress.md](progress.md)

## 발견된 이슈

| 발견일 | 기능 ID / 항목 | 화면 · 엔드포인트 | 증상(실측) | 원인 (가설/확정) | 조치 / 후속 작업 | 상태 |
|---|---|---|---|---|---|---|
| 2026-05-14 | F-09-2 피드 카드 로드 (및 전체 mock 항목) | FEED-001 · `GET /api/bff/feed` | 프론트 피드 리스트가 DB 데이터 대신 dummy mock 3건 노출 | `frontend/Dockerfile`에 `VITE_USE_MOCK` 빌드 arg 미전달 → `USE_MOCK=true` 기본값 적용 | `frontend/Dockerfile`에 `ARG VITE_USE_MOCK=false` / `ENV VITE_USE_MOCK=$VITE_USE_MOCK` 추가 후 컨테이너 리빌드 → BFF 실 데이터 정상 반환 확인 | ✅ |
| 2026-05-14 | F-09-6a 댓글 닉네임 | FEED-COMMENT · `GET /api/bff/feed/{id}/comments` | 댓글 목록에 닉네임 대신 user_id(UUID) 그대로 노출 | BFF 댓글 응답 쿼리에 `users` 테이블 JOIN 없음 → `user_nickname` 필드 미포함. `transformComment()`에서 `raw.user_nickname ?? raw.user_id` fallback으로 user_id 노출 | `get_comments()` `outerjoin(User)` 추가, `CommentOut` 스키마에 `user_nickname` 포함, `_enrich_comment()` 헬퍼 신설. 상세: [trouble/260514/260514_comment_ux_troubleshooting.md](../trouble/260514/260514_comment_ux_troubleshooting.md) | ✅ |
| 2026-05-14 | F-09-6b 댓글 아바타 | FEED-COMMENT · `GET /api/bff/feed/{id}/comments` | 댓글 작성자 프로필 사진 미표시 (`<img src="undefined">`) | BFF 댓글 응답에 `user_avatar_url` 필드 누락 → 프론트 `transformComment()`에서 `undefined` 처리 | F-09-6a와 동일 수정으로 해결. `_enrich_comment()`에서 `default_avatar_url()` fallback 포함 | ✅ |
| 2026-05-14 | F-09-6c 댓글 좋아요 | FEED-COMMENT · `POST /api/bff/feed/{id}/comments/{comment_id}/like` | 댓글 ♥ 버튼 클릭 시 아무 반응 없음 | ① 프론트 onClick 핸들러 없음 ② BFF 엔드포인트 미존재 ③ DB `like_count` 컬럼·`post_comment_likes` 테이블 없음 | DB 마이그레이션(004_comment_likes.sql) + BFF `toggle_comment_like()` 신설 + 프론트 `handleCommentLike()` + `toggleCommentLike()` 구현. 상세: [trouble/260514/260514_comment_ux_troubleshooting.md](../trouble/260514/260514_comment_ux_troubleshooting.md) | ✅ |
| 2026-05-14 | F-AUTH-LOGIN | AUTH-002 · OtpInput | OtpInput이 BFF `/auth/login` 미호출. 더미 검증(`000000`=실패, 나머지=성공), `loginFromBackend`에 `id:''` 빈 user 전달 | PhoneInput에서 register 완료 시 이미 로그인 처리되어 OTP 화면 거치지 않음 — OtpInput 자체가 레거시/미연동 상태 | OtpInput `handleVerify`를 `apiLogin(phone, digits.join(''))` 호출로 교체 필요 | ❌ |
| 2026-05-14 | F-02-7 | AUTH-002 · 재전송 버튼 | 재전송 버튼이 타이머만 리셋(`setSeconds(180)`), BFF register 재호출 없음 → 새 passcode 미발급 | OtpInput 재전송 핸들러에 `apiRegister` 호출 없음 | 재전송 버튼 onClick에 `apiRegister(phone)` 추가 필요 | ❌ |
| 2026-05-14 | F-03-2 | PROFILE-SETUP · 닉네임 중복확인 | ProfileSetup에서 `GET /api/bff/profile/check-nickname` 미호출. BFF는 정상 동작 | 닉네임 입력 후 중복확인 로직 없음 | 닉네임 입력 debounce + check-nickname API 연동 필요 | ❌ |
| 2026-05-14 | F-03-4 | PROFILE-SETUP · 프로필 저장 | `setProfile(nickname, style)`로 Zustand만 업데이트, `PUT /api/bff/profile` 미호출. rider_type 소문자(`night_rider`) → BFF 400 | ProfileSetup `handleSubmit`에 API 호출 없음 + rider_type 대소문자 불일치 | ① `PUT /api/bff/profile` 호출 추가 ② `rider_type` 대문자 변환 (`toUpperCase()`) | ❌ |
| 2026-05-14 | F-03-1-b | PROFILE-SETUP · 라이더 타입 카드 아이콘 | 출퇴근러(1f3d9 🏙)·나이트라이더(1f319 🌙) Google Fonts noto emoji 404 → onError로 아이콘 숨겨짐 | 체크리스트 미등재 항목 — 휴먼 점검 중 발견 | ProfileSetup.tsx emoji 코드 교체: 1f3d9→1f3cd(🏍️), 1f319→1f31f(🌟). 리빌드 완료 | 🔧 수정됨 |
| 2026-05-14 | F-03-1 | PROFILE-SETUP · 닉네임 1자 제출 가능 여부 | 휴먼 점검 중 "한 글자 입력 시 버튼 활성화" 보고 | 코드상 `length >= 2` 조건 존재 — 한국어 IME 조합 중 length 계산 차이 가능성 | 재빌드 후 재점검 필요 | 🟡 |

## 미구현 / Mock 잔여 (⛔ 분류 모음)

> **2026-05-14 갱신**: BFF 완수 Task로 대부분 구현 완료.  
> 잔여 미구현은 프론트엔드 연동(mock → 실 API) 및 REFERRAL 뿐.

| 기능 ID / 함수 | 위치 | 우선순위 | 후속 작업 | 상태 |
|---|---|---|---|---|
| `getNotifications()` | HOME-001 알림 뱃지 | P2 | 프론트 연동 후 §2.5 재점검 | ✅ BFF 완료 |
| `getMonthlyStats()` | PROFILE-001 이번 달 통계 | P2 | 프론트 연동 후 §2.11 재점검 | ✅ BFF 완료 |
| `getBadgeDetail(id)` | BADGE-DETAIL 모달 | P3 | 프론트 연동 후 §2.11 재점검 | ✅ BFF 완료 |
| `saveNotificationSettings(prefs)` | SET-NOTI 토글 저장 | P3 | 프론트 연동 후 §2.13 재점검 | ✅ BFF 완료 |
| `requestDataExport()` | SET-ACCOUNT 데이터 다운로드 | P3 | 프론트 연동 후 §2.15 재점검 | ✅ BFF 완료 |
| `deleteAccount()` | SET-ACCOUNT 탈퇴 | P3 | 프론트 연동 후 §2.15 재점검 | ✅ BFF 완료 |
| `getStories()` 실 API | FEED-001 상단 스토리 | P2 | 프론트 연동 후 §2.10 재점검 | ✅ BFF 완료 |
| 친구 초대 / `REFERRAL` | (미정) BFF 라우터 | P3 | Engine 매핑은 있으나 BFF 트리거 부재 → §3.1 재점검 | ⛔ |
