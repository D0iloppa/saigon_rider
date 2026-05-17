# Saigon Rider — 화면 & 기능 명세서

> **정적 디자인 참조**: 모든 화면의 레이아웃·색상·컴포넌트 스타일은 **`/scene.html`** 을 유일한 디자인 기준으로 삼습니다.  
> scene.html 은 브라우저에서 직접 열어 확인하고, 구현 시 해당 파일의 CSS 토큰(`--brand-*`, `--ink-*` 등) 및 컴포넌트 클래스를 그대로 참고하세요.

> **API 구현 정책**: 백엔드가 미구현된 기능은 `api/` 디렉터리에 dummy 함수로 선 작성합니다.  
> 실제 백엔드 구현 후 해당 함수 내부만 교체하면 나머지 코드는 변경 없이 동작해야 합니다.

---

## 1. 화면 목록 (27 Screens)

### 그룹 A — 온보딩 / 인증 (Auth Flow)

| # | ID | 화면명 | 경로 | scene.html 라벨 |
|---|-----|--------|------|-----------------|
| 01 | ONB-001 | 스플래시 | `/` | `01 · ONB-001 · 스플래시` |
| 02 | AUTH-001 | 번호입력 | `/auth/phone` | `02 · AUTH-001 · 번호입력` |
| 03 | AUTH-001-E | 번호오류 (에러 상태) | `/auth/phone` (상태 분기) | `03 · AUTH-001-E · 번호오류` |
| 04 | AUTH-002 | OTP 코드 입력 | `/auth/otp` | `04 · AUTH-002 · 코드입력` |
| 05 | AUTH-002-E | OTP 코드 오류 (에러 상태) | `/auth/otp` (상태 분기) | `05 · AUTH-002-E · 코드오류` |
| 06 | PROFILE-SETUP | 라이더 프로필 설정 | `/auth/profile-setup` | `06 · PROFILE-SETUP · 라이더 설정` |

### 그룹 B — 홈 & 월드맵 (Home)

| # | ID | 화면명 | 경로 | scene.html 라벨 |
|---|-----|--------|------|-----------------|
| 07 | HOME-001 | 월드맵 홈 (데이터 있음) | `/home` | `07 · HOME-001 · 월드맵 홈 ⭐` |
| 08 | HOME-001-EMPTY | 월드맵 홈 (빈 상태) | `/home` (상태 분기) | `08 · HOME-001-EMPTY` |
| 09 | HOME-001-LOADING | 월드맵 홈 (로딩 스켈레톤) | `/home` (상태 분기) | `09 · HOME-001-LOADING` |

### 그룹 C — 퀘스트 (Quest)

| # | ID | 화면명 | 경로 | scene.html 라벨 |
|---|-----|--------|------|-----------------|
| 10 | QUEST-LIST | 퀘스트 목록 | `/quests` | `10 · QUEST-LIST · 퀘스트 목록` |
| 11 | QUEST-LIST-EMPTY | 퀘스트 목록 (빈 상태) | `/quests` (상태 분기) | `11 · QUEST-LIST-EMPTY` |
| 12 | QUEST-DETAIL | 퀘스트 상세 | `/quests/:id` | `12 · QUEST-DETAIL ⭐` |
| 13 | QUEST-DETAIL-LOCK | 퀘스트 잠금 모달 | `/quests/:id` (상태 분기) | `13 · QUEST-DETAIL-LOCK` |

### 그룹 D — 라이딩 (Ride)

| # | ID | 화면명 | 경로 | scene.html 라벨 |
|---|-----|--------|------|-----------------|
| 14 | RIDE-ACTIVE | 주행 HUD | `/ride/active` | `14 · RIDE-ACTIVE ⭐ HUD` |
| 15 | RIDE-PAUSE | 일시정지 Bottom Sheet | `/ride/active` (오버레이) | `15 · RIDE-PAUSE` |
| 16 | RIDE-GPS-ERROR | GPS 오류 화면 | `/ride/active` (오버레이) | `16 · RIDE-GPS-ERROR` |
| 17 | RIDE-RESULT-S | 라이딩 결과 — 성공 | `/ride/result/success` | `17 · RIDE-RESULT-S ⭐ CLEARED` |
| 18 | RIDE-RESULT-F | 라이딩 결과 — 실패 | `/ride/result/fail` | `18 · RIDE-RESULT-F · FAILED` |

### 그룹 E — 소셜 피드 (Feed)

| # | ID | 화면명 | 경로 | scene.html 라벨 |
|---|-----|--------|------|-----------------|
| 19 | FEED-001 | 피드 목록 | `/feed` | `19 · FEED-001 · 피드` |
| 20 | FEED-EMPTY | 피드 빈 상태 | `/feed` (상태 분기) | `20 · FEED-EMPTY` |
| 21 | FEED-COMMENT | 댓글 Bottom Sheet | `/feed` (오버레이) | `21 · FEED-COMMENT · 댓글` |
| — | FEED-CREATE | 피드 작성 | `/feed/new` | (신규) |
| — | DM-LIST | DM 목록 | `/dm` | (신규) |
| — | DM-DETAIL | DM 채팅방 | `/dm/:id` | (신규) |

### 그룹 F — 프로필 (Profile)

| # | ID | 화면명 | 경로 | scene.html 라벨 |
|---|-----|--------|------|-----------------|
| 22 | PROFILE-001 | 내 프로필 | `/profile` | `22 · PROFILE-001 · 프로필` |
| 23 | BADGE-DETAIL | 배지 상세 모달 | `/profile` (오버레이) | `23 · BADGE-DETAIL · 배지` |
| — | FOLLOWER-LIST | 팔로워 목록 | `/followers/:userId` | (신규) |
| — | FOLLOWING-LIST | 팔로잉 목록 | `/following/:userId` | (신규) |

### 그룹 G — 설정 (Settings)

| # | ID | 화면명 | 경로 | scene.html 라벨 |
|---|-----|--------|------|-----------------|
| 24 | SETTINGS | 설정 메인 | `/settings` | `24 · SETTINGS · 설정` |
| 25 | SET-NOTI | 알림 설정 | `/settings/notifications` | `25 · SET-NOTI · 알림 설정` |
| 26 | SET-LANG | 언어 설정 | `/settings/language` | `26 · SET-LANG · 언어` |
| 27 | SET-ACCOUNT | 계정 관리 | `/settings/account` | `27 · SET-ACCOUNT · 계정` |

---

## 2. 기능 목록 (Feature List)

> **범례**  
> - `[STATIC]` — 로컬 상태만으로 구현 (API 불필요)  
> - `[API-DUMMY]` — 현재 dummy 함수로 구현, 백엔드 완성 시 교체 대상  
> - `[DEVICE]` — 기기 기능 (GPS, 카메라 등) 직접 접근

---

### F-01. 앱 진입 & 언어 선택

| 기능 ID | 기능명 | 관련 화면 | 구현 방식 |
|---------|--------|-----------|-----------|
| F-01-1 | 스플래시 로고 & 그라디언트 애니메이션 노출 | ONB-001 | `[STATIC]` |
| F-01-2 | 로컬 토큰 유무 확인 후 자동 라우팅 | ONB-001 | `[STATIC]` — localStorage 검사 |
| F-01-3 | 상단 언어 선택 Chip (기본: KO) | ONB-001 | `[STATIC]` — i18n locale 전환 |
| F-01-4 | "시작하기" → 번호입력, "로그인" → 번호입력 | ONB-001 | `[STATIC]` |

---

### F-02. 휴대폰 인증 (OTP)

| 기능 ID | 기능명 | 관련 화면 | 구현 방식 |
|---------|--------|-----------|-----------|
| F-02-1 | 국가 코드 표시 (+84 고정 또는 선택) | AUTH-001 | `[STATIC]` |
| F-02-2 | 번호 실시간 입력 & 포맷팅 (10-11자리 정규식) | AUTH-001, AUTH-001-E | `[STATIC]` |
| F-02-3 | 번호 유효성 실패 시 에러 테두리 & 메시지 표시 | AUTH-001-E | `[STATIC]` |
| F-02-4 | 인증번호 발송 요청 | AUTH-001 | `[API-DUMMY]` `sendOtp(phone)` |
| F-02-5 | 6자리 OTP 박스 자동 포커스 이동 입력 | AUTH-002 | `[STATIC]` |
| F-02-6 | 남은 시간 카운트다운 타이머 (mm:ss) | AUTH-002 | `[STATIC]` |
| F-02-7 | 재전송 버튼 (타이머 만료 후 활성화) | AUTH-002 | `[API-DUMMY]` `sendOtp(phone)` 재호출 |
| F-02-8 | OTP 검증 요청 | AUTH-002 | `[API-DUMMY]` `verifyOtp(phone, code)` |
| F-02-9 | 검증 실패 시 OTP 박스 흔들림(Shake) 애니메이션 & 에러 표시 | AUTH-002-E | `[STATIC]` |

---

### F-03. 프로필 초기 설정

| 기능 ID | 기능명 | 관련 화면 | 구현 방식 |
|---------|--------|-----------|-----------|
| F-03-1 | 닉네임 입력 필드 & 유효성 검사 | PROFILE-SETUP | `[STATIC]` |
| F-03-2 | 닉네임 중복 확인 | PROFILE-SETUP | `[API-DUMMY]` `checkNickname(nickname)` |
| F-03-3 | 라이더 타입 선택 (출퇴근러 / 카페 헌터 / 나이트 라이더) | PROFILE-SETUP | `[STATIC]` |
| F-03-4 | 설정 완료 후 프로필 저장 & 홈으로 이동 | PROFILE-SETUP | `[API-DUMMY]` `saveProfile(data)` |
| F-03-5 | 진행 단계 Dot Indicator (3단계) | PROFILE-SETUP | `[STATIC]` |
| F-03-6 | 기본 프로필 사진 노출 (saigon-default.jpg) | PROFILE-SETUP | `[API-IMPL]` — UserOut.avatar_url 기본값 자동 반환 |

---

### F-04. 홈 & 월드맵

| 기능 ID | 기능명 | 관련 화면 | 구현 방식 |
|---------|--------|-----------|-----------|
| F-04-1 | 사용자 정보 로드 (아바타, 닉네임, 레벨) | HOME-001 | `[API-DUMMY]` `getMe()` |
| F-04-2 | 레벨 진행도 Progress Bar 퍼센트 계산 | HOME-001 | `[STATIC]` — getMe() 데이터 기반 |
| F-04-3 | 재화(XP / Gold / Skill Pt) 카드 숫자 카운팅 애니메이션 | HOME-001 | `[STATIC]` |
| F-04-4 | 알림 뱃지 (읽지 않은 알림 수) | HOME-001 | `[API-IMPL]` `GET /api/notifications?user_id=…` → `{unread_count}` |
| F-04-5 | SVG 인터랙티브 월드맵 렌더링 (구역 폴리곤, 강) | HOME-001 | `[STATIC]` — 정적 SVG |
| F-04-6 | 퀘스트 핀 배치 및 클릭 시 상세 이동 | HOME-001 | `[API-DUMMY]` `getQuestPins()` |
| F-04-7 | 추천 퀘스트(Tonight's Pick) 로드 | HOME-001 | `[API-DUMMY]` `getRecommendedQuest()` |
| F-04-8 | 로딩 중 스켈레톤 UI 표시 | HOME-001-LOADING | `[STATIC]` |
| F-04-9 | 추천 퀘스트 없을 때 빈 상태 UI | HOME-001-EMPTY | `[STATIC]` |
| F-04-10 | 하단 탭바 (월드 / 퀘스트 / FAB / 피드 / 프로필) | 전체 메인 탭 화면 | `[STATIC]` |

---

### F-05. 퀘스트 목록

| 기능 ID | 기능명 | 관련 화면 | 구현 방식 |
|---------|--------|-----------|-----------|
| F-05-1 | 세그먼트 탭 전환 (오늘 / 주간 / 이벤트) | QUEST-LIST | `[STATIC]` |
| F-05-2 | 필터 Chip 선택 (구역, 타입, 안전등급 등) | QUEST-LIST | `[STATIC]` |
| F-05-3 | 퀘스트 카드 리스트 로드 (HOT/NEW/LIMITED 뱃지 포함) | QUEST-LIST | `[API-DUMMY]` `getQuests(filters)` |
| F-05-4 | 필터 조건에 해당 퀘스트 없을 때 빈 상태 | QUEST-LIST-EMPTY | `[STATIC]` |
| F-05-5 | 필터 초기화 버튼 | QUEST-LIST-EMPTY | `[STATIC]` |
| F-05-6 | 카드 클릭 시 퀘스트 상세 이동 | QUEST-LIST | `[STATIC]` |

---

### F-06. 퀘스트 상세

| 기능 ID | 기능명 | 관련 화면 | 구현 방식 |
|---------|--------|-----------|-----------|
| F-06-1 | 퀘스트 상세 정보 로드 (히어로 이미지, 설명, 조건, 보상) | QUEST-DETAIL | `[API-DUMMY]` `getQuestDetail(id)` |
| F-06-2 | 북마크 토글 | QUEST-DETAIL | `[API-DUMMY]` `toggleBookmark(id)` |
| F-06-3 | 공유 버튼 (딥링크 복사) | QUEST-DETAIL | `[STATIC]` — navigator.share |
| F-06-4 | 도전 중인 친구 아바타 표시 | QUEST-DETAIL | `[API-DUMMY]` `getQuestParticipants(id)` |
| F-06-5 | "퀘스트 시작" 클릭 → 라이딩 HUD 진입 | QUEST-DETAIL | `[API-DUMMY]` `acceptQuest(id)` |
| F-06-6 | 레벨 미달 시 잠금 모달 표시 | QUEST-DETAIL-LOCK | `[STATIC]` — 레벨 비교 로직 |

---

### F-07. 라이딩 HUD

| 기능 ID | 기능명 | 관련 화면 | 구현 방식 |
|---------|--------|-----------|-----------|
| F-07-1 | GPS 위치 추적 시작 (Geolocation API) | RIDE-ACTIVE | `[DEVICE]` |
| F-07-2 | 실시간 이동 거리 계산 (Haversine) | RIDE-ACTIVE | `[STATIC]` — GPS 좌표 연산 |
| F-07-3 | SVG 링 게이지 진행률 애니메이션 (목표 대비 %) | RIDE-ACTIVE | `[STATIC]` |
| F-07-4 | 주행 시간 타이머 (mm:ss 카운트업) | RIDE-ACTIVE | `[STATIC]` |
| F-07-5 | 평균 속도 계산 (거리 / 시간) | RIDE-ACTIVE | `[STATIC]` |
| F-07-6 | 안전 등급 실시간 표시 (A/B/C) | RIDE-ACTIVE | `[API-DUMMY]` `calcSafetyGrade(rideData)` |
| F-07-7 | GPS 신호 강도 아이콘 (3단계 바) | RIDE-ACTIVE | `[DEVICE]` — accuracy 값 기반 |
| F-07-8 | 연속 라이딩 스트릭 표시 | RIDE-ACTIVE | `[API-DUMMY]` `getRideStreak()` |
| F-07-9 | 일시정지 Bottom Sheet 표시 (현재 통계, 미니 지도) | RIDE-PAUSE | `[STATIC]` |
| F-07-10 | 계속 진행 / 퀘스트 종료 분기 처리 | RIDE-PAUSE | `[STATIC]` |
| F-07-11 | GPS 신호 없을 때 에러 오버레이 표시 | RIDE-GPS-ERROR | `[STATIC]` |
| F-07-12 | 설정 열기 (OS 위치 권한 설정 딥링크) | RIDE-GPS-ERROR | `[DEVICE]` |

---

### F-08. 라이딩 결과

| 기능 ID | 기능명 | 관련 화면 | 구현 방식 |
|---------|--------|-----------|-----------|
| F-08-1 | 성공 결과 화면 — 보상 정산 (EXP/XP/Gold/아이템) | RIDE-RESULT-S | `[API-DUMMY]` `submitRideResult(rideData)` |
| F-08-2 | 완료 축하 Confetti 애니메이션 | RIDE-RESULT-S | `[STATIC]` |
| F-08-3 | 첫 클리어 보너스 배너 표시 | RIDE-RESULT-S | `[STATIC]` — firstClear 플래그 기반 |
| F-08-4 | 피드에 공유 버튼 | RIDE-RESULT-S | `[API-DUMMY]` `createFeedPost(rideResult)` |
| F-08-5 | 실패 결과 화면 — 실패 사유 & 달성 거리 Progress | RIDE-RESULT-F | `[STATIC]` |
| F-08-6 | 위로 보상 EXP 표시 (기본 +20 EXP) | RIDE-RESULT-F | `[API-DUMMY]` `submitRideResult(rideData)` |
| F-08-7 | 다시 도전 / 다른 퀘스트 분기 | RIDE-RESULT-F | `[STATIC]` |

---

### F-09. 소셜 피드

| 기능 ID | 기능명 | 관련 화면 | 구현 방식 |
|---------|--------|-----------|-----------|
| F-09-1 | 스토리 아바타 목록 로드 | FEED-001 | `[API-DUMMY]` `getStories()` |
| F-09-2 | 피드 카드 목록 로드 (이미지, EXP 뱃지, 거리/안전도) | FEED-001 | `[API-DUMMY]` `getFeed(filter)` |
| F-09-3 | 필터 Chip 전환 (전체 / 내 동네 / 친구 / 핫) | FEED-001 | `[STATIC]` |
| F-09-4 | 응원(Like) 토글 | FEED-001 | `[API-DUMMY]` `toggleLike(postId)` |
| F-09-5 | 댓글 Bottom Sheet 열기 | FEED-001 | `[STATIC]` |
| F-09-6 | 댓글 목록 로드 (텍스트, 이미지 댓글, 대댓글) | FEED-COMMENT | `[API-DUMMY]` `getComments(postId)` |
| F-09-7 | 댓글 작성 & 전송 | FEED-COMMENT | `[API-DUMMY]` `postComment(postId, content)` |
| F-09-8 | 사진 댓글 첨부 (카메라/갤러리) | FEED-COMMENT | `[DEVICE]` + `[API-DUMMY]` `uploadImage(file)` |
| F-09-9 | 공유 버튼 (시스템 Share Sheet) | FEED-001 | `[STATIC]` — navigator.share |
| F-09-10 | 피드 없을 때 빈 상태 UI | FEED-EMPTY | `[STATIC]` |

---

### F-10. 프로필

| 기능 ID | 기능명 | 관련 화면 | 구현 방식 |
|---------|--------|-----------|-----------|
| F-10-1 | 내 프로필 정보 로드 (아바타, 닉네임, 레벨, 라이더타입) | PROFILE-001 | `[API-DUMMY]` `getMe()` |
| F-10-2 | 레벨 진행도 바 & EXP to next level | PROFILE-001 | `[STATIC]` |
| F-10-3 | 재화(XP/Gold/Skill Pt) 카드 | PROFILE-001 | `[STATIC]` — getMe() 데이터 기반 |
| F-10-4 | 이번 달 통계 (누적 km, 퀘스트 수, 평균 안전도) | PROFILE-001 | `[API-IMPL]` `GET /api/users/me/stats?user_id=…` |
| F-10-5 | 월별 주행 Mini 차트 SVG | PROFILE-001 | `[API-DUMMY]` `getRideHistory()` |
| F-10-6 | 탭 전환 (기록 / 배지 / 장비) | PROFILE-001 | `[STATIC]` |
| F-10-7 | 최근 라이딩 기록 목록 | PROFILE-001 | `[API-DUMMY]` `getRideHistory()` |
| F-10-8 | 배지 상세 모달 (획득 조건, 공유 버튼) | BADGE-DETAIL | `[API-IMPL]` `GET /api/badges/{id}` |
| F-10-9 | 프로필 사진 변경 (갤러리/카메라 선택 → 업로드) | PROFILE-001 | `[API-IMPL]` `POST /api/profile/avatar` |
| F-10-10 | 닉네임 변경 (중복 확인 포함) | PROFILE-001 | `[API-IMPL]` `PUT /api/profile/nickname` |

---

### F-11. 설정

| 기능 ID | 기능명 | 관련 화면 | 구현 방식 |
|---------|--------|-----------|-----------|
| F-11-1 | 미니 프로필 카드 & 프로필 편집 이동 | SETTINGS | `[STATIC]` |
| F-11-2 | 다크 모드 토글 (앱 테마 전환) | SETTINGS | `[STATIC]` — CSS class 전환 |
| F-11-3 | 위치 권한 상태 표시 | SETTINGS | `[DEVICE]` — Geolocation.permission |
| F-11-4 | 로그아웃 (토큰 삭제 & 초기화) | SETTINGS | `[STATIC]` |
| F-11-5 | 알림 토글 저장 (추천퀘스트 / 만료임박 / 이벤트 / 결과 / 소셜) | SET-NOTI | `[API-IMPL]` `PUT /api/notifications/settings` |
| F-11-6 | 언어 선택 (한국어 / Tiếng Việt / English) | SET-LANG | `[STATIC]` — i18n locale 즉시 적용 |
| F-11-7 | 계정 정보 조회 (휴대폰, 가입일, 계정ID) | SET-ACCOUNT | `[API-DUMMY]` `getMe()` |
| F-11-8 | 계정 ID 복사 | SET-ACCOUNT | `[STATIC]` — clipboard API |
| F-11-9 | 내 데이터 다운로드 요청 | SET-ACCOUNT | `[API-IMPL]` `POST /api/users/export` |
| F-11-10 | 계정 탈퇴 (위험 모달 → 확인) | SET-ACCOUNT | `[API-IMPL]` `DELETE /api/users/me` |

---

### F-12. 이미지 컨텐츠 서빙 (백엔드 구현 완료)

> **구현일**: 2026-05-13  
> 컨텐츠(이미지)를 DB에 등록하고, 컨텐츠 ID로 imgproxy를 통해 이미지를 서빙하는 기능.

#### 아키텍처

```
Client  →  Nginx(:18090)  →  /api/contents/...  →  Backend (FastAPI)
                          →  /img/...            →  imgproxy  →  ./contents/ (볼륨)
```

#### 파일 저장 경로 규칙

| owner_type | 저장 경로 | 비고 |
|---|---|---|
| `user` | `contents/user-contents/yyyy/mm/{uuid}.{ext}` | 사용자 업로드, git 추적 안 됨 |
| `system` | `contents/system/{filename}` | 정적 리소스, git 추적됨 |

#### API

| 기능 ID | 엔드포인트 | 설명 | 구현 방식 |
|---------|-----------|------|-----------|
| F-12-1 | `POST /api/contents/upload` | 이미지 업로드 (multipart) → 디스크 저장 + DB 등록 → imgproxy URL 반환 | **[API-IMPL]** |
| F-12-2 | `GET /api/contents/{id}` | 컨텐츠 ID로 메타데이터 + imgproxy URL 조회 | **[API-IMPL]** |
| F-12-3 | `POST /api/profile/avatar` | 프로필 사진 업로드 → contents 등록 + users 업데이트 | **[API-IMPL]** |
| F-12-4 | `PUT /api/profile/nickname` | 닉네임 변경 (중복 검사 포함) | **[API-IMPL]** |

#### imgproxy URL 생성 규칙

- `IMGPROXY_KEY` / `IMGPROXY_SALT` 미설정 (개발): `/img/insecure/plain/local:///{file_path}`
- 설정 시 (운영): HMAC-SHA256 서명 URL 자동 생성

#### 응답 예시 (`POST /api/contents/upload`)

```json
{
  "id": "uuid",
  "owner_type": "user",
  "owner_id": "user-uuid",
  "file_path": "user-contents/2026/05/uuid.jpg",
  "mime_type": "image/jpeg",
  "original_filename": "photo.jpg",
  "file_size": 102400,
  "imgproxy_url": "http://192.168.0.43:18090/img/insecure/plain/local:///user-contents/2026/05/uuid.jpg",
  "created_at": "2026-05-13T..."
}
```

#### 관련 파일

| 파일 | 역할 |
|---|---|
| `database/init/002_contents_schema.sql` | `contents` 테이블 + `content_owner_type` ENUM |
| `database/init/003_profile_avatar.sql` | `users.avatar_content_id` 컬럼 추가 |
| `backend/app/utils.py` | imgproxy URL 빌더 (`build_imgproxy_url`), 기본 아바타 URL |
| `backend/app/models.py` | `Content` SQLAlchemy 모델, `User.avatar_content_id` 필드 |
| `backend/app/routers/contents.py` | 이미지 업로드·조회 라우터 |
| `backend/app/routers/profile.py` | 프로필 사진 업로드, 닉네임 변경 라우터 |
| `contents/user-contents/` | 사용자 업로드 저장소 (git 추적 제외) |
| `contents/system/saigon-default.jpg` | 기본 프로필 사진 (git 추적) |

---

## 3. API Dummy 함수 목록

> **파일 위치**: `src/api/index.ts` (또는 기능 도메인별 `src/api/auth.ts`, `src/api/quest.ts` 등으로 분리)  
> 각 함수는 Promise를 리턴하며, 실제 API 연동 전까지 하드코딩된 더미 데이터를 반환합니다.

```
// ── Auth ──────────────────────────────────────────
sendOtp(phone: string): Promise<void>
verifyOtp(phone: string, code: string): Promise<{ token: string }>
checkNickname(nickname: string): Promise<{ available: boolean }>
saveProfile(data: ProfileData): Promise<User>

// ── User ──────────────────────────────────────────
getMe(): Promise<User>
getNotifications(): Promise<Notification[]>
getRideStreak(): Promise<{ streak: number }>
getMonthlyStats(): Promise<MonthlyStats>
getRideHistory(): Promise<RideRecord[]>
getBadgeDetail(id: string): Promise<Badge>
saveNotificationSettings(prefs: NotifPrefs): Promise<void>
requestDataExport(): Promise<void>
deleteAccount(): Promise<void>

// ── Quest ─────────────────────────────────────────
getQuestPins(): Promise<QuestPin[]>
getRecommendedQuest(): Promise<Quest | null>
getQuests(filters: QuestFilter): Promise<Quest[]>
getQuestDetail(id: string): Promise<QuestDetail>
toggleBookmark(id: string): Promise<{ bookmarked: boolean }>
getQuestParticipants(id: string): Promise<User[]>
acceptQuest(id: string): Promise<{ sessionId: string }>

// ── Ride ──────────────────────────────────────────
calcSafetyGrade(rideData: RideSnapshot): Promise<{ grade: 'A' | 'B' | 'C' }>
submitRideResult(rideData: RideResult): Promise<RideReward>

// ── Feed ──────────────────────────────────────────
getStories(): Promise<Story[]>
getFeed(filter: FeedFilter): Promise<FeedPost[]>
toggleLike(postId: string): Promise<{ liked: boolean; count: number }>
getComments(postId: string): Promise<Comment[]>
postComment(postId: string, content: string | File): Promise<Comment>
uploadImage(file: File): Promise<{ url: string }>   // → 실제 구현: POST /api/contents/upload (F-12-1)
createFeedPost(rideResult: RideReward): Promise<FeedPost>
```

---

## 4. NativeInterface (WebView ↔ Native 브릿지)

> **파일 위치**: `src/lib/native.ts`  
> WebView 위에 올라가는 웹 레이어가 Android / iOS 네이티브 레이어와 통신하기 위한 공통 모듈.  
> 플랫폼별 postMessage 차이를 내부에서 처리하고, 외부에는 단일 Promise 기반 API를 노출한다.

### 브릿지 약속 (Protocol)

| 방향 | 포맷 |
|------|------|
| 웹 → 네이티브 | `JSON.stringify({ key, callbackId?, params? })` |
| 네이티브 → 웹 | `window.nativeInterface.onMessage(jsonString)` 호출 |
| 응답 포맷 | `{ callbackId, result? }` 또는 `{ callbackId, error }` |
| Push 포맷 | `{ key, data? }` (callbackId 없음) |

### 플랫폼별 postMessage 발신

| 플랫폼 | 호출 |
|--------|------|
| Android | `window.native.postMessage(payload)` |
| iOS | `window.webkit.messageHandlers.native.postMessage(payload)` |
| Browser(dev) | 콘솔 경고 + 100ms 후 자동 null resolve |

### API

```ts
import { nativeInterface, NATIVE_KEYS } from '@/lib/native'

// 단방향 전송
nativeInterface.send(NATIVE_KEYS.HAPTIC, { style: 'light' })

// 응답 기대 (Promise)
const loc = await nativeInterface.request<{ lat: number; lng: number }>(NATIVE_KEYS.GET_LOCATION)

// Push 구독 (실시간 위치 스트리밍 등)
const unsub = nativeInterface.on<{ lat: number; lng: number }>(NATIVE_KEYS.LOCATION_UPDATE, (d) => {
  console.log(d.lat, d.lng)
})
unsub() // 컴포넌트 unmount 시 해제
```

### 지원 커맨드 키 (`NATIVE_KEYS`)

| 키 | 방향 | 설명 |
|----|------|------|
| `getLocation` | Request/Response | 현재 GPS 위치 1회 조회 |
| `openCamera` | Request/Response | 카메라 오픈 후 이미지 반환 |
| `share` | Send | OS 공유 시트 오픈 |
| `haptic` | Send | 햅틱 피드백 트리거 |
| `getDeviceInfo` | Request/Response | OS / 앱 버전 정보 조회 |
| `requestPermission` | Request/Response | 런타임 권한 요청 |
| `locationUpdate` | Push (Native→Web) | 실시간 위치 스트리밍 |
| `appForeground` | Push (Native→Web) | 앱이 포그라운드로 복귀 |
| `deepLink` | Push (Native→Web) | 딥링크 URL 수신 |

---

## 5. 구현 우선순위 가이드

| 우선순위 | 그룹 | 이유 |
|----------|------|------|
| P0 | 인증 플로우 (F-01 ~ F-03) | 앱 진입 필수 경로 |
| P0 | 홈 & 퀘스트 목록 (F-04 ~ F-06) | 핵심 콘텐츠 노출 |
| P1 | 라이딩 HUD & 결과 (F-07 ~ F-08) | 핵심 게임플레이 루프 |
| P2 | 피드 & 프로필 (F-09 ~ F-10) | 소셜 & 리텐션 |
| P3 | 설정 (F-11) | 보조 기능 |
