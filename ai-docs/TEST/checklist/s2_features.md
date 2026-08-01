# §2 화면별 기능 점검 항목 (Feature × Endpoint × 점검)

> 진척도: [../progress.md](../progress.md) · 이슈 로그: [../issues.md](../issues.md)

## 범례

- `[STATIC]` 로컬 상태만 (API 불필요)
- `[DEVICE]` 디바이스 API (GPS·카메라·Clipboard·navigator.share)
- `[BFF]` BFF API 호출 — `/api/bff/...`
- `[SRE]` Engine API 호출 — BFF가 내부에서 `engine_client`로 호출 (앱에서 직접 호출 불가)
- `[MOCK]` 현재 프론트가 mock 응답(`VITE_USE_MOCK=true`)을 사용 — 실 API 연동 미완

## 2.1 ONB-001 · 스플래시

| 기능 ID | 기능명 | 분류 | 엔드포인트 / 동작 | 점검 방법 | 상태 |
|---|---|---|---|---|---|
| F-01-1 | 그라디언트/로고 애니메이션 | `[STATIC]` | — | `/splash` 진입 시 brand 그라디언트 + 로고 fade-in 표시 확인 | ✅ 휴먼 확인 |
| F-01-2 | 자동 라우팅 (토큰 검사) | `[STATIC]` | `isAuthenticated` → `navigate('/home')` | 코드 확인: `useEffect` + `isAuthenticated` 감지 구현 ✅ | ✅ |
| F-01-3 | 언어 선택 Chip | `[STATIC]` | i18n locale 전환 | VI/EN/KO 드롭다운 + 텍스트 즉시 변경 ✅ 휴먼 확인 | ✅ 휴먼 확인 |
| F-01-4 | 시작/로그인 CTA | `[STATIC]` | navigate(`/auth/phone`) | 시작하기·로그인 버튼 모두 `/auth/phone` 이동 ✅ 휴먼 확인 | ✅ 휴먼 확인 |

## 2.2 AUTH-001 / AUTH-001-E · 번호 입력

| 기능 ID | 기능명 | 분류 | 엔드포인트 / 동작 | 점검 방법 | 상태 |
|---|---|---|---|---|---|
| F-02-1 | 국가코드(+84) 표시 | `[STATIC]` | — | 좌측 prefix `+84` 노출 | ✅ 휴먼 확인 |
| F-02-2 | 번호 실시간 포맷팅 | `[STATIC]` | 정규식(6~12자리) | 유효하지 않은 입력 시 버튼 비활성화로 처리 (에러 메시지 대신). 명세와 UX 패턴 다르나 동작 안전 | ✅ 휴먼 확인 |
| F-02-3 | 유효성 실패 시 에러 표시 | `[STATIC]` | — | 짧은 번호 입력 시 버튼 비활성화로 처리 (에러 메시지 미노출) — 명세는 에러 메시지 명시, 실제는 버튼 disable | ✅ 휴먼 확인 (패턴 상이) |
| F-AUTH-REG | 회원 등록(passcode 발급) | `[BFF]` | `POST /api/bff/auth/register` (body `{phone}`) | Network탭 200 확인 ✅ 휴먼 확인; 신규→profile-setup, 기존→home 분기 정상 | ✅ 휴먼 확인 |
| F-AUTH-PROXY | nginx 라우팅 정상 | infra | — | nginx → BFF 200 확인 ✅ | ✅ |

## 2.3 AUTH-002 / AUTH-002-E · OTP / Passcode 입력

| 기능 ID | 기능명 | 분류 | 엔드포인트 / 동작 | 점검 방법 | 상태 |
|---|---|---|---|---|---|
| F-02-5 | 6자리 박스 자동 포커스 이동 | `[STATIC]` | — | `inputsRef` + `focus()` 이동 구현 ✅ | ✅ |
| F-02-6 | 카운트다운 타이머(mm:ss) | `[STATIC]` | — | 180초 `setInterval` 구현 ✅ | ✅ |
| F-02-7 | 재전송 활성화 | `[BFF]` | `POST /api/bff/auth/register` 재호출 | ❌ **결함**: 재전송 버튼이 `setSeconds(180)` 타이머 리셋만 하고 BFF register 재호출 없음 | ❌ |
| F-AUTH-LOGIN | 코드 검증(로그인) | `[BFF]` | `POST /api/bff/auth/login` (body `{phone, passcode}`) | ❌ **결함**: OtpInput이 BFF login 미호출 — 더미 검증, `loginFromBackend`에 빈 user 객체 전달 | ❌ |
| F-02-9 | 검증 실패 — Shake 애니메이션 | `[STATIC]` | — | `error` state + `styles.otpCellError` 구현 ✅ | ✅ |

## 2.4 PROFILE-SETUP · 라이더 프로필 설정

| 기능 ID | 기능명 | 분류 | 엔드포인트 / 동작 | 점검 방법 | 상태 |
|---|---|---|---|---|---|
| F-03-1 | 닉네임 입력 / 유효성 | `[STATIC]` | — | 2~12자 제한 구현. ⚠️ 한국어 IME 조합 이슈 가능성, 재확인 필요 | 🟡 |
| F-03-1-b | 라이더 타입 카드 아이콘 | `[STATIC]` | — | ~~❌ 출퇴근러·나이트라이더 404~~ → 🔧 emoji 코드 교체(1f3cd·1f31f) 후 ✅ 휴먼 확인 완료 | ✅ 수정 확인 |
| F-03-2 | 닉네임 중복 확인 | `[BFF]` | `GET /api/bff/profile/check-nickname?nickname=...` | ❌ **결함**: ProfileSetup에 check-nickname 호출 없음 | ❌ |
| F-03-3 | 라이더 타입 선택 | `[STATIC]` | 3개 라디오(COMMUTER/CAFE_HUNTER/NIGHT_RIDER) | 클릭 시 `selected` CSS + state 반영 ✅ | ✅ |
| F-03-4 | 프로필 저장 → 홈 | `[BFF]` | `PUT /api/bff/profile` (body `{user_id, nickname, rider_type}`) | ❌ **결함 2건**: Zustand만 업데이트 + rider_type 대소문자 불일치 | ❌ |
| F-03-5 | 진행 단계 Dot Indicator | `[STATIC]` | — | 3단계 중 2번째 dot active ✅ | ✅ |
| F-03-6 | 기본 프로필 사진 | `[BFF]` | `UserOut.avatar_url` 기본값(`saigon-default.jpg`) | register 응답 `avatar_url` = imgproxy URL 확인 ✅ | ✅ |

## 2.5 HOME-001 (LOADING / EMPTY 포함) · 월드맵 홈

| 기능 ID | 기능명 | 분류 | 엔드포인트 / 동작 | 점검 방법 | 상태 |
|---|---|---|---|---|---|
| F-04-1 | 사용자 정보 로드 | `[BFF]` | `GET /api/bff/auth/me?phone=...` | 응답: `{id, nickname, level, exp, xp, gold, skill_pt, avatar_url, rider_type}` | ✅ 휴먼 확인 |
| F-04-2 | 레벨 진행도 Progress Bar | `[STATIC]` | getMe 데이터 기반 % 계산 | 시각적 % 일치 확인 | ✅ 휴먼 확인 |
| F-04-3 | 재화 카운팅 애니메이션 | `[STATIC]` | — | 카드 진입 시 0→실제값 카운트업 | ✅ 휴먼 확인 |
| F-04-4 | 알림 뱃지 (미읽음 수) | `[BFF]` | `GET /api/bff/notifications?user_id=…` → `{unread_count}` | 응답의 `unread_count` 값이 뱃지에 반영되는지 확인 | ⬜ |
| F-04-5 | SVG 월드맵 렌더 | `[STATIC]` | 정적 SVG | 구역 폴리곤·강 표시, 줌/팬 동작 확인 | ✅ 휴먼 확인 |
| F-04-6 | 퀘스트 핀 로드 / 클릭 이동 | `[BFF]` | `GET /api/bff/quests/pins` | 응답: `[{id, lat, lng, ...}]`; 핀 클릭 → `/quests/{id}` | ✅ 휴먼 확인 |
| F-04-7 | 추천 퀘스트(Tonight's Pick) | `[BFF]` | `GET /api/bff/quests/recommended` | 200 응답의 퀘스트 카드가 우측 하단 패널 노출; null이면 EMPTY 상태 | ✅ 휴먼 확인 |
| F-04-8 | 로딩 스켈레톤 | `[STATIC]` | — | 네트워크 throttle 후 진입 시 스켈레톤 표시 | ⬜ |
| F-04-9 | 빈 상태 UI | `[STATIC]` | — | DB에서 quests 행 없는 상태 진입 시 안내 메시지 | ⬜ |
| F-04-10 | 하단 탭바 | `[STATIC]` | — | 월드 / 퀘스트 / FAB / 피드 / 프로필 5개 노출 + 라우팅 | ✅ 휴먼 확인 |

## 2.6 QUEST-LIST / QUEST-LIST-EMPTY · 퀘스트 목록

| 기능 ID | 기능명 | 분류 | 엔드포인트 / 동작 | 점검 방법 | 상태 |
|---|---|---|---|---|---|
| F-05-1 | 세그먼트 탭 (오늘/주간/이벤트) | `[STATIC]` | — | 클릭 시 active 표시 + 필터 파라미터 변경 | ✅ 휴먼 확인 |
| F-05-2 | 필터 Chip (구역/타입/안전등급) | `[STATIC]` | — | Chip 선택 상태 유지 + API 호출 시 쿼리 반영 | ❌ 수정 완료: useEffect deps에 activeFilter 누락 → FILTER_DISTRICT 맵 추가 + deps 수정 |
| F-05-3 | 퀘스트 카드 로드 | `[BFF]` | `GET /api/bff/quests?period=DAILY&district=...&safety_grade=...` | 200 응답의 카드 리스트 렌더, HOT/NEW/LIMITED 뱃지 표시 | ✅ 휴먼 확인 |
| F-05-4 | 결과 0건 빈 상태 | `[STATIC]` | — | 매칭 없는 필터 조합 → 일러스트 + 안내 표시 | ⛔ N/A: 필터 버그로 0건 재현 불가 (수정 후 재점검 가능) |
| F-05-5 | 필터 초기화 | `[STATIC]` | — | Chip 모두 해제, 리스트 재호출 | ⬜ |
| F-05-6 | 카드 → 상세 이동 | `[STATIC]` | navigate(`/quests/{id}`) | 정상 진입 확인 | ✅ 휴먼 확인 |

> **현재 mock 상태**: `frontend/src/api/quests.ts` 의 `fetchQuests`는 mock 응답을 우선 반환. `VITE_USE_MOCK=false` 빌드로 실 API 점검 필요.

> **⚠️ 아키텍처 개선 필요 (추후 태스크)**
> 1. **District Chip 동적화**: 현재 "Quận 1" 하드코딩 → `GET /api/bff/quests/districts` 엔드포인트 추가 후 동적 로드 필요.
> 2. **출퇴근/야간 Chip BFF 미지원**: `💼 출퇴근` · `🌙 야간` 칩은 현재 BFF에 대응 파라미터 없음 (전체 조회).
> 3. **안전A Chip**: BFF `safety_grade` 파라미터 지원 확인 → 프론트 연결 완료 (260514). DB 퀘스트에 `min_safety_grade='A'` 데이터 추가 필요.
> 4. **Test Quest district 업데이트**: `district = 'Quận 1'` 로 직접 UPDATE 완료 (260514). 실 시드 SQL에도 반영 필요.

## 2.7 QUEST-DETAIL / QUEST-DETAIL-LOCK · 퀘스트 상세

| 기능 ID | 기능명 | 분류 | 엔드포인트 / 동작 | 점검 방법 | 상태 |
|---|---|---|---|---|---|
| F-06-1 | 상세 정보 로드 | `[BFF]` | `GET /api/bff/quests/{id}` | 응답에 히어로 이미지·설명·조건·보상 포함 | ⬜ |
| F-06-2 | 북마크 토글 | `[BFF]` | `POST /api/bff/quests/{id}/bookmark` | 200 `{bookmarked: bool}` + 아이콘 상태 반전; DB `user_quests` 갱신 | ⬜ |
| F-06-3 | 공유(딥링크 복사) | `[DEVICE]` | navigator.share or clipboard | 모바일/PWA에서 공유 시트 노출 | ⬜ |
| F-06-4 | 참여중 친구 아바타 | `[BFF]` | `GET /api/bff/quests/{id}/participants` | 상위 50명 아바타 표시 | ⬜ |
| F-06-5 | 퀘스트 시작 → HUD | `[BFF]` | `POST /api/bff/quests/{id}/accept` → navigate(`/ride/active`) | 200 응답 후 HUD 진입; DB `user_quests` insert | ⬜ |
| F-06-6 | 잠금 모달(레벨 미달) | `[STATIC]` | 클라이언트 비교 | 사용자 level < quest.min_level 시 잠금 모달 + "시작" 버튼 비활성 | ⬜ |

## 2.8 RIDE-ACTIVE / RIDE-PAUSE / RIDE-GPS-ERROR · 주행 HUD

| 기능 ID | 기능명 | 분류 | 엔드포인트 / 동작 | 점검 방법 | 상태 |
|---|---|---|---|---|---|
| F-07-1 | GPS 추적 시작 | `[DEVICE]` | `navigator.geolocation.watchPosition` | 권한 허용 후 위치 갱신 로그 | ⬜ |
| F-07-2 | 실시간 이동거리(Haversine) | `[STATIC]` | — | 좌표 변화에 따라 거리 누적 | ⬜ |
| F-07-3 | SVG 링 게이지 | `[STATIC]` | — | 진행률 % 시각화 | ⬜ |
| F-07-4 | 주행 시간 카운트업 | `[STATIC]` | — | mm:ss 1초마다 증가 | ⬜ |
| F-07-5 | 평균 속도 | `[STATIC]` | distance / time | km/h 표시 | ⬜ |
| F-07-6 | 안전 등급 실시간 | `[BFF]` | `POST /api/bff/ride/safety-grade` (body 텔레메트리) | A/B/C 응답을 주기적으로 받음 | ⬜ |
| F-07-7 | GPS 신호 강도 아이콘 | `[DEVICE]` | `position.coords.accuracy` 활용 | 3단계 바 표시 | ⬜ |
| F-07-8 | 라이딩 스트릭 | `[BFF]` | `GET /api/bff/ride/streak` | 200 `{current, longest}` | ⬜ |
| F-07-9 | 일시정지 BottomSheet | `[STATIC]` | — | 정지 버튼 → 미니맵·현재 통계 표시 | ⬜ |
| F-07-10 | 계속/종료 분기 | `[STATIC]` | — | 종료 시 결과 화면으로 이동 | ⬜ |
| F-07-11 | GPS 에러 오버레이 | `[STATIC]` | — | watchPosition 에러 코드 1/2 발생 시 표시 | ⬜ |
| F-07-12 | OS 위치 설정 딥링크 | `[DEVICE]` | — | iOS/Android에서 설정 앱 호출 | ⬜ |

## 2.9 RIDE-RESULT-S / RIDE-RESULT-F · 라이딩 결과

| 기능 ID | 기능명 | 분류 | 엔드포인트 / 동작 | 점검 방법 | 상태 |
|---|---|---|---|---|---|
| F-08-1 | 보상 정산(성공) | `[BFF]`+`[SRE]` | `POST /api/bff/ride/submit` → BFF 내부에서 `engine_client.post_event(action_code="RIDE_KM")`, 퀘스트 완료 시 `"QUEST_COMPLETE"` | 응답에 reward 포함; DB `rp_transaction` `tx_type=EARN` 행 추가; `sre_user.lifetime_earned` 증가 | ⬜ |
| F-08-2 | Confetti 애니메이션 | `[STATIC]` | — | 성공 결과 진입 시 confetti 표시 | ⬜ |
| F-08-3 | 첫 클리어 보너스 배너 | `[STATIC]` | firstClear 플래그 | 응답에 firstClear=true 일 때만 배너 | ⬜ |
| F-08-4 | 피드에 공유 | `[BFF]`+`[SRE]` | `POST /api/bff/feed` → engine `SHARE_SNS` 이벤트 | 200 응답; DB `feed_posts` insert; Engine `action_event` insert 확인 | ⬜ |
| F-08-5 | 실패 결과 표시 | `[STATIC]` | — | 사유 + 달성거리 Progress | ⬜ |
| F-08-6 | 위로 보상(+20 EXP) | `[BFF]` | `POST /api/bff/ride/submit` (failed flag) | 응답 reward.exp=20 | ⬜ |
| F-08-7 | 재도전 분기 | `[STATIC]` | navigate | 다시 도전 / 다른 퀘스트 버튼 라우팅 | ⬜ |

## 2.10 FEED-001 / FEED-EMPTY / FEED-COMMENT · 소셜 피드

| 기능 ID | 기능명 | 분류 | 엔드포인트 / 동작 | 점검 방법 | 상태 |
|---|---|---|---|---|---|
| F-09-1 | 스토리 아바타 목록 | `[BFF]` | `GET /api/bff/feed/stories` | 상단 가로 스크롤 아바타 | ❌ 수정 완료: 하드코딩 mock → `fetchStories()` 실 API 연결. DB에 is_story=true 게시물 없어 현재 빈 상태 정상 |
| F-09-2 | 피드 카드 로드 | `[BFF]` | `GET /api/bff/feed?filter=all&page=1&limit=20` | 카드 이미지/EXP/거리/안전도 표시; `filter=hot` 정렬 검증 | ✅ 휴먼 확인 (실 DB 데이터 노출) |
| F-09-3 | 필터 Chip 전환 | `[STATIC]` + 쿼리파라미터 | filter ∈ all / neighborhood / friends / hot | 클릭 시 쿼리 갱신 + 재호출 | 🟡 파라미터 전달은 ✅. 단 BFF가 neighborhood/friends에 WHERE 미적용 → 모든 필터에 전체 게시물 노출 (BFF 미구현) |
| F-09-4 | 응원(Like) 토글 | `[BFF]` | `POST /api/bff/feed/{post_id}/like` | 200 응답 `{liked, count}`; DB `feed_likes` 토글 | ✅ 휴먼 확인 |
| F-09-5 | 댓글 BottomSheet 열기 | `[STATIC]` | — | 댓글 아이콘 → 시트 오픈 | ✅ 휴먼 확인 |
| F-09-6 | 댓글 목록 로드 | `[BFF]` | `GET /api/bff/feed/{post_id}/comments` | 텍스트/이미지/대댓글 트리 표시 | ✅ 수정 완료 |
| F-09-6a | 댓글 닉네임 표시 | `[BFF]` | `GET /api/bff/feed/{post_id}/comments` → `user_nickname` 필드 포함 | 댓글 목록 내 작성자 닉네임 노출 여부 | ✅ 수정 완료 |
| F-09-6b | 댓글 아바타 표시 | `[BFF]` | `GET /api/bff/feed/{post_id}/comments` → `user_avatar_url` 필드 포함 | 피드 카드 아바타와 동일 방식 표시 여부 | ✅ 수정 완료 |
| F-09-6c | 댓글 좋아요 기능 | `[BFF]` | `POST /api/bff/feed/{post_id}/comments/{comment_id}/like` | ♥ 클릭 → BFF 호출 + 카운트 반영 | ✅ 수정 완료 |
| F-09-7 | 댓글 작성 | `[BFF]` | `POST /api/bff/feed/{post_id}/comments` (body `{content, parent_id?}`) | 200 후 즉시 리스트 갱신 | ❌ 수정 완료 |
| F-09-8 | 사진 댓글 첨부 | `[DEVICE]`+`[BFF]` | `POST /api/bff/contents/upload` (multipart) → content_id 로 댓글 작성 | 업로드 후 imgproxy URL 미리보기 | ⬜ |
| F-09-9 | 공유 버튼 | `[DEVICE]` | navigator.share | 시스템 시트 노출 | ⬜ |
| F-09-10 | 빈 상태 | `[STATIC]` | — | 피드 0건 시 안내 표시 | ⛔ N/A: 현재 게시물 존재로 재현 어려움 |
| F-09-11 | 피드 이미지 스켈레톤 로딩 | `[STATIC]` | — | 이미지 다운로드 중 shimmer 스켈레톤 → onLoad 시 fade-in 전환 | ✅ 260515 신규 구현 |
| F-09-12 | 피드 이미지 라이트박스 뷰어 | `[STATIC]` | — | 이미지 클릭 → 전체화면 뷰어. 핀치줌(1x~5x), 더블탭 토글, 팬, 스와이프다운 닫기 | ✅ 260515 신규 구현 |

> **⚠️ 아키텍처/이슈 메모 (추후 태스크)**
> 1. **피드 이미지 미표시 → 수정 완료 (260514)**: 시드 데이터의 `image_url`이 `local:///official/grand-opening.jpg`를 참조했으나 imgproxy `/data/official/` 디렉토리 비어 있어 404. 피드 시드 SQL 추가 필요.
> 2. **neighborhood/friends 필터 BFF 미구현**: 팔로우 테이블 설계 후 WHERE 추가 필요.
> 3. **스토리 등록 기능 미구현** ⛔ 후속 태스크 필요.
> 4. **피드 게시물 등록 기능 미구현** ⛔ 후속 태스크 필요.

> **현재 mock 상태 (260515 기준)**: `frontend/src/api/feed.ts` — `fetchFeed`, `toggleCheer` 여전히 mock 분기. `fetchComments`, `postComment`, `fetchStories`, `toggleCommentLike`는 실 API 연결 완료.

## 2.11 PROFILE-001 / BADGE-DETAIL · 프로필

| 기능 ID | 기능명 | 분류 | 엔드포인트 / 동작 | 점검 방법 | 상태 |
|---|---|---|---|---|---|
| F-10-1 | 프로필 정보 로드 | `[BFF]` | `GET /api/bff/auth/me?phone=...` | 응답: 닉네임/레벨/타입/avatar_url | ⬜ |
| F-10-2 | 레벨 진행도 바 | `[STATIC]` | — | exp / next_level_exp % | ⬜ |
| F-10-3 | 재화 카드 | `[STATIC]` | getMe 데이터 | XP/Gold/Skill Pt 카드 | ⬜ |
| F-RP | RP 잔액 표시 | `[BFF]`+`[SRE]` | `GET /api/bff/profile/{user_id}/rp-balance` → 내부 `engine_client.get_balance()` | 응답: `{current_balance, lifetime_earned, lifetime_spent, expiring_in_30d, tier}` | ⬜ |
| F-10-4 | 이번 달 통계 | `[BFF]` | `GET /api/bff/users/me/stats?user_id=…` → `{month, total_km, quest_count, avg_safety_grade}` | 응답값이 통계 카드에 표시되는지 확인 | ⬜ |
| F-10-5 | 월별 주행 미니 차트 | `[BFF]` | `GET /api/bff/ride/history?page=1&limit=N` | SVG 차트 데이터 시각화 | ⬜ |
| F-10-6 | 탭 전환(기록/배지/장비) | `[STATIC]` | — | active 상태 전환 | ⬜ |
| F-10-7 | 최근 라이딩 기록 | `[BFF]` | `GET /api/bff/ride/history` | 목록 렌더링 | ⬜ |
| F-10-8 | 배지 상세 모달 | `[BFF]` | `GET /api/bff/badges/{id}` → `{name, description, icon_url, condition_type, condition_value}` | 배지 상세 모달에 정보 표시 확인 | ⬜ |
| F-10-9 | 프로필 사진 변경 | `[DEVICE]`+`[BFF]` | `POST /api/bff/profile/avatar` (multipart `file`, `user_id`) | 200 응답 `{user, content_id}`; DB `users.avatar_content_id` 갱신; 이미지 변경 즉시 반영 | ⬜ |
| F-10-10 | 닉네임 변경 | `[BFF]` | `PUT /api/bff/profile/nickname` (body `{user_id, nickname}`) | 중복 시 409; 정상 시 200 + 프로필 갱신 | ⬜ |

## 2.12 SETTINGS · 설정 메인

| 기능 ID | 기능명 | 분류 | 엔드포인트 / 동작 | 점검 방법 | 상태 |
|---|---|---|---|---|---|
| F-11-1 | 미니 프로필 카드 → 편집 이동 | `[STATIC]` | navigate(`/profile`) | 카드 클릭 시 프로필 화면 진입 | ⬜ |
| F-11-2 | 다크 모드 토글 | `[STATIC]` | body class 토글 + localStorage | 토글 후 새로고침 시에도 유지 | ⬜ |
| F-11-3 | 위치 권한 상태 | `[DEVICE]` | `navigator.permissions.query({name:'geolocation'})` | granted/prompt/denied 표시 | ⬜ |
| F-11-4 | 로그아웃 | `[STATIC]` | localStorage 삭제 + navigate(`/splash`) | 새로고침 시에도 미로그인 유지 | ⬜ |

## 2.13 SET-NOTI · 알림 설정

| 기능 ID | 기능명 | 분류 | 엔드포인트 / 동작 | 점검 방법 | 상태 |
|---|---|---|---|---|---|
| F-11-5 | 알림 토글 저장 | `[BFF]` | `PUT /api/bff/notifications/settings` body `{user_id, quest_recommend, quest_expire, event, ride_result, social}` | 토글 변경 후 재조회 시 값 일치 확인 | ⬜ |

## 2.14 SET-LANG · 언어 설정

| 기능 ID | 기능명 | 분류 | 엔드포인트 / 동작 | 점검 방법 | 상태 |
|---|---|---|---|---|---|
| F-11-6 | 언어 선택 (KO/VI/EN) | `[STATIC]` | i18n locale 즉시 적용 | 선택 시 모든 화면 텍스트 변환, localStorage 영속 | ⬜ |

## 2.15 SET-ACCOUNT · 계정 관리

| 기능 ID | 기능명 | 분류 | 엔드포인트 / 동작 | 점검 방법 | 상태 |
|---|---|---|---|---|---|
| F-11-7 | 계정 정보 조회 | `[BFF]` | `GET /api/bff/auth/me?phone=...` | 휴대폰/가입일/계정ID 표시 | ⬜ |
| F-11-8 | 계정 ID 복사 | `[DEVICE]` | `navigator.clipboard.writeText` | 복사 후 토스트 표시 | ⬜ |
| F-11-9 | 데이터 다운로드 요청 | `[BFF]` | `POST /api/bff/users/export?user_id=…` → `{request_id, status:"QUEUED", estimated_ready_at}` | 200 응답 + toast 표시 확인 | ⬜ |
| F-11-10 | 계정 탈퇴 | `[BFF]` | `DELETE /api/bff/users/me?user_id=…` → 204 + CASCADE 삭제 | 위험 모달 → 확인 → 204 응답 → 로그인 화면 이동 확인 | ⬜ |
