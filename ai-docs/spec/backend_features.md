# 백엔드 구현 필요 기능 목록

> 작성일: 2026-05-13  
> 최종 갱신: 2026-05-16 (컨텐츠 이미지 서빙 섹션 추가)  
> 기준: `/docs/spec.md` `[API-DUMMY]` 항목 전수 분석  
> 상태 범례: `⬜ 미구현` · `✅ 완료` · `🚧 진행중`

---

## 현재 구현 완료 엔드포인트

| 엔드포인트 | 설명 |
|---|---|
| `POST /api/auth/register` | 전화번호 가입 / passcode 재발급 |
| `POST /api/auth/login` | passcode 로그인 |
| `GET /api/auth/me` | 전화번호로 유저 조회 |
| `POST /api/contents/upload` | 이미지 업로드 → imgproxy URL 반환 (파일명 = content_id UUID) |
| `GET /api/contents/{id}` | 컨텐츠 메타데이터 조회 |
| `GET /api/contents/{id}/img` | content_id → imgproxy 302 redirect (`?w=800&h=450`) |
| `GET /api/contents/mock-img` | owner_type='mock' 이미지 서빙 (`?seed={uuid}` → 결정론적, 미지정 → 랜덤) |
| `POST /api/profile/avatar` | 프로필 사진 업로드 |
| `PUT /api/profile/nickname` | 닉네임 변경 |
| `GET /api/profile/check-nickname` | 닉네임 중복 확인 |
| `PUT /api/profile` | 닉네임 + rider_type 동시 저장 |
| `GET /api/profile/{user_id}/rp-balance` | RP 잔액 조회 (Engine 위임) |
| `GET /api/quests` | 퀘스트 목록 (필터 지원) |
| `GET /api/quests/pins` | 월드맵 핀 좌표 목록 |
| `GET /api/quests/recommended` | Tonight's Pick 추천 퀘스트 |
| `GET /api/quests/{id}` | 퀘스트 상세 |
| `POST /api/quests/{id}/accept` | 퀘스트 수락 → session_id 반환 |
| `POST /api/quests/{id}/bookmark` | 북마크 토글 |
| `GET /api/quests/{id}/participants` | 같은 퀘스트 ACTIVE 유저 목록 |
| `POST /api/ride/submit` | 라이딩 결과 제출 + Engine 이벤트 발행 |
| `GET /api/ride/streak` | 연속 라이딩 스트릭 조회 |
| `GET /api/ride/history` | 라이딩 이력 (페이지네이션) |
| `POST /api/ride/safety-grade` | 안전등급 계산 (A/B/C) |
| `GET /api/feed` | 피드 목록 |
| `GET /api/feed/stories` | 스토리 목록 |
| `POST /api/feed` | 피드 게시 |
| `POST /api/feed/{id}/like` | 좋아요 토글 |
| `GET /api/feed/{id}/comments` | 댓글 목록 |
| `POST /api/feed/{id}/comments` | 댓글 작성 |
| `GET /api/notifications` | 알림 목록 + 미읽음 수 |
| `GET /api/notifications/settings` | 알림 설정 조회 |
| `PUT /api/notifications/settings` | 알림 설정 저장 |
| `GET /api/users/me/stats` | 이번 달 누적 통계 |
| `GET /api/users/me/badges` | 내 배지 목록 |
| `DELETE /api/users/me` | 계정 탈퇴 (CASCADE) |
| `POST /api/users/export` | 데이터 내보내기 요청 (stub) |
| `GET /api/badges/{id}` | 배지 단건 조회 |
| `GET /admin/` | 관리자 콘솔 루트 → `/admin/login` 리다이렉트 |
| `GET /admin/login` | 관리자 로그인 페이지 |
| `POST /admin/login` | 관리자 인증 (bcrypt + JWT 쿠키 발급) |
| `POST /admin/logout` | 관리자 로그아웃 (쿠키 삭제) |
| `GET /admin/dashboard` | 관리자 대시보드 (유저/퀘스트/라이딩/피드 통계 HTML) |
| `GET /admin/quests` | 퀘스트 리스트 (검색·필터·페이지네이션) |
| `GET /admin/quests/new` · `POST /admin/quests/new` | 퀘스트 신규 등록 (썸네일 multipart) |
| `GET /admin/quests/{id}/edit` · `POST /admin/quests/{id}/edit` | 퀘스트 수정 (보상 정보 포함) |
| `POST /admin/quests/{id}/delete` | 퀘스트 삭제 |
| `GET /admin/feed` | 피드 리스트 (인스타그램 카드형, 해시태그 강조, 페이지네이션) |
| `GET /admin/feed/new` · `POST /admin/feed/new` | 관리자 피드 게시 (이미지 → contents 중개) |
| `GET /admin/feed/{id}/edit` · `POST /admin/feed/{id}/edit` | 피드 수정 (본문·이미지·스토리) |
| `POST /admin/feed/{id}/delete` | 피드 삭제 |
| `GET /admin/users` | 유저 리스트 (닉네임/전화번호 검색) |
| `GET /admin/settings` | 관리자 계정 / 피드 공통 계정 설정 |
| `POST /admin/settings/nickname` | 피드 공통 계정 닉네임 변경 (중복·길이 검증) |
| `POST /admin/settings/avatar` | 피드 공통 계정 프로필 이미지 변경 |

---

## 관리자 콘솔 (Admin Console)

### 접근 경로

| 환경 | URL |
|---|---|
| 로컬 | `http://localhost:18090/admin/login` |
| 서버 | `http://saigon.doil.me/admin/login` |

**기본 계정**: `admin` / `admin123` (`.env`의 `ADMIN_PASS_HASH` 교체로 변경)

### 라우팅 구조

```
브라우저 → nginx(:18090) /admin/ → backend:8080/admin/...
                                  ├── GET  /admin/          → redirect /admin/login
                                  ├── GET  /admin/login     → login.html (HTMLResponse)
                                  ├── POST /admin/login     → bcrypt 검증 → JWT 쿠키 → /admin/dashboard
                                  ├── GET  /admin/dashboard → 대시보드 HTML (쿠키 인증 필요)
                                  └── POST /admin/logout    → 쿠키 삭제 → /admin/login
```

### 관련 파일

| 파일 | 역할 |
|---|---|
| `nginx/conf.d/default.conf` | `/admin/` 경로 → backend 프록시 |
| `backend/app/routers/admin.py` | 관리자 라우터 (`/admin` prefix) |
| `backend/app/templates/admin/login.html` | 로그인 UI |
| `backend/app/templates/admin/dashboard.html` | 대시보드 UI |

### 현재 상태

| # | 기능 | 상태 |
|---|---|---|
| 1 | 로그인 UI 페이지 | ✅ 완료 |
| 2 | 관리자 인증 (POST /admin/login + JWT 쿠키) | ✅ 완료 |
| 3 | 대시보드 (유저/퀘스트/라이딩/피드 통계) | ✅ 완료 |
| 4 | 사이드바 공통 레이아웃 (5개 메뉴) | ✅ 완료 (260516) |
| 5 | 퀘스트 관리 (리스트/등록/수정/삭제, 썸네일 업로드) | ✅ 완료 (260516) |
| 6 | 피드 관리 (인스타형 리스트/게시/수정/삭제, 해시태그) | ✅ 완료 (260516) |
| 7 | 유저 관리 (리스트/검색) | ✅ 완료 (260516) |
| 8 | 설정 (관리자 프로필 이미지) | ✅ 완료 (260516) |

### 관리자 user 시드

`feed_posts.user_id`, `users.avatar_*` 등 NOT NULL FK 충족을 위해 가상 admin user 1행을 시드한다.

| 항목 | 값 |
|---|---|
| `users.id` | `00000000-0000-0000-0000-000000000001` (ENV `ADMIN_USER_ID` 로 override 가능) |
| `users.phone` | `__admin__` (sentinel — 실 전화번호 충돌 없음) |
| `users.nickname` | `admin` |
| 시드 위치 | `database/init/015_admin_seed.sql` (멱등 ON CONFLICT) |

---

## 컨텐츠 이미지 서빙

> 최종 갱신: 2026-05-16

### 이미지 서빙 흐름

```
클라이언트 (image src)
  │
  ├─ content_id 아는 경우
  │   GET /api/bff/contents/{id}/img?w=800&h=450
  │   → BFF: DB에서 file_path 조회
  │   → 302 redirect → nginx /img/ → imgproxy → 파일시스템
  │
  └─ content_id 모르는 경우 (fallback)
      GET /api/bff/contents/mock-img?seed={quest_id}
      → BFF: owner_type='mock' 목록 조회
      → seed 기반 결정론적 선택 → 302 redirect → imgproxy
```

### 엔드포인트 상세

#### `GET /contents/{content_id}/img`

| 항목 | 내용 |
|---|---|
| 목적 | content_id만으로 이미지 서빙 (file_path 불필요) |
| 파라미터 | `w` (기본 800), `h` (기본 450) — 단위 px |
| 응답 | `302 redirect` → imgproxy URL (`rs:fill:{w}:{h}:1`) |
| 사용처 | 프로필 아바타, 퀘스트 썸네일 직접 지정 시 |

```
GET /api/bff/contents/a3ea6311-7189-44eb-8935.../img?w=400&h=300
→ 302 → https://saigon.doil.me/img/insecure/rs:fill:400:300:1/{base64}
```

#### `GET /contents/mock-img`

| 항목 | 내용 |
|---|---|
| 목적 | 이미지 미설정 퀘스트의 fallback 이미지 랜덤 서빙 |
| 파라미터 | `w` (기본 800), `h` (기본 450), `seed` (선택) |
| seed 동작 | UUID 지정 시 → 결정론적 선택 (같은 seed = 항상 같은 이미지) |
| seed 미지정 | 완전 랜덤 선택 |
| 캐시 | `Cache-Control: no-store` (브라우저 캐시 방지) |
| DB 조건 | `owner_type = 'mock'`, `created_at` 오름차순 정렬 후 선택 |
| 응답 | `302 redirect` → imgproxy URL |

```
GET /api/bff/contents/mock-img?seed=e2f9ece6-0f39-41db-8445-590b808dff0d
→ 항상 같은 mock 이미지 (quest_id 기반 결정론적)

GET /api/bff/contents/mock-img
→ 매 요청마다 랜덤 mock 이미지

GET /api/bff/contents/profile-mock-img?seed={user_id}&w=240&h=240
→ owner_type='profile_mock' 풀에서 user_id 결정론적 선택 (기본 아바타)
```

`mock-img` 와 `profile-mock-img` 는 `_serve_pool_image()` 헬퍼를 공유한다. `mock`=퀘스트/구 폴백(가로형), `profile_mock`=프로필 사진 미설정 시 기본 아바타 풀(정사각).

### 콘텐츠 contents 중개 원칙

모든 이미지는 `contents` 테이블에 등록되어 `content_id` 로 매핑된다 (관리자·프론트 공통). DB 는 `*_content_id` 만 저장하고, BFF 출력 시점에 imgproxy URL 로 해석한다. 레거시 URL 컬럼(`feed_posts.image_url`, `users.avatar_url`, `quests.hero_image_url`, `districts.image_url`)은 read-only 폴백.

- 아바타: `utils.resolve_avatar_url()` — `avatar_content_id > avatar_url(레거시) > profile_mock 풀 (seed=user_id)`
- 피드 이미지: `utils.resolve_feed_image_url()` — `image_content_id > image_url(레거시)`

### 퀘스트 thumbnail_url 결정 우선순위 (`_to_out`)

```
1. quest.thumbnail_content.file_path  → build_imgproxy_url()   (자체 등록 이미지)
2. district.image_content.file_path   → build_imgproxy_url()   (district 대표 이미지)
3. MOCK_IMG_ENDPOINT?seed={quest.id}  → /contents/mock-img 엔드포인트 (mockup)
```

### owner_type 구분

| owner_type | 저장 경로 | 설명 |
|---|---|---|
| `system` | `system/` | 관리자 직접 배치 또는 API 업로드 |
| `user` | `user-contents/{year}/{month}/` | 유저 업로드 (프로필 사진, 피드 등) |
| `mock` | `system/mock/` | fallback 전용 목업 이미지 (5장) |

### 관련 파일

| 파일 | 역할 |
|---|---|
| `backend/app/routers/contents.py` | `/mock-img`, `/{id}/img` 엔드포인트 |
| `backend/app/utils.py` | `build_imgproxy_url(file_path, options)`, `MOCK_IMG_ENDPOINT` |
| `backend/app/routers/quests.py` | `_to_out()` fallback 체인 |
| `database/init/011~013_*.sql` | district FK, 시스템 시드, mock enum |
| `ai-docs/workflow/system-contents-upload.md` | 이미지 추가 절차 |

---

## P0 — 핵심 경로 (가입 완성 + 퀘스트 진입)

### 🔐 Profile 확장

| 상태 | # | 엔드포인트 | 연결 함수 (spec) | 설명 |
|---|---|---|---|---|
| ✅ | A-1 | `GET /api/profile/check-nickname` | `checkNickname(nickname)` | 닉네임 중복 확인 (`?nickname=` 쿼리) |
| ✅ | A-2 | `PUT /api/profile` | `saveProfile(data)` | 닉네임 + rider_type 동시 저장 (초기 프로필 설정) |

### 🗺 Quest

| 상태 | # | 엔드포인트 | 연결 함수 (spec) | 설명 |
|---|---|---|---|---|
| ✅ | Q-1 | `GET /api/quests` | `getQuests(filters)` | 퀘스트 목록 — 필터: `period`, `district`, `badge`, `safety_grade` |
| ✅ | Q-2 | `GET /api/quests/pins` | `getQuestPins()` | 월드맵 핀 좌표 목록 (PostGIS `quest_pins`) |
| ✅ | Q-3 | `GET /api/quests/recommended` | `getRecommendedQuest()` | Tonight's Pick — 오늘 활성 퀘스트 중 추천 1개 |
| ✅ | Q-4 | `GET /api/quests/{id}` | `getQuestDetail(id)` | 퀘스트 상세 (히어로 이미지, 조건, 보상) |
| ✅ | Q-5 | `POST /api/quests/{id}/accept` | `acceptQuest(id)` | `user_quests` INSERT → `sessionId` 반환 |

---

## P1 — 핵심 게임플레이 루프 (라이딩)

### 🗺 Quest 보조

| 상태 | # | 엔드포인트 | 연결 함수 (spec) | 설명 |
|---|---|---|---|---|
| ✅ | Q-6 | `POST /api/quests/{id}/bookmark` | `toggleBookmark(id)` | `bookmarks` 토글 (있으면 DELETE, 없으면 INSERT) |
| ✅ | Q-7 | `GET /api/quests/{id}/participants` | `getQuestParticipants(id)` | 같은 퀘스트 ACTIVE 유저 아바타 목록 |

### 🏍 Ride

| 상태 | # | 엔드포인트 | 연결 함수 (spec) | 설명 |
|---|---|---|---|---|
| ✅ | R-1 | `POST /api/ride/submit` | `submitRideResult(rideData)` | `ride_sessions` INSERT, EXP/Gold 정산, 스트릭 갱신 |
| ✅ | R-2 | `GET /api/ride/streak` | `getRideStreak()` | `ride_streaks` 조회 |
| ✅ | R-3 | `GET /api/ride/history` | `getRideHistory()` | `ride_sessions` 목록 (페이지네이션) |
| ✅ | R-4 | `POST /api/ride/safety-grade` | `calcSafetyGrade(rideData)` | 실시간 안전등급 계산 (속도·급감속 기반 → A/B/C) |

---

## P2 — 소셜 & 알림

### 📱 Feed

| 상태 | # | 엔드포인트 | 연결 함수 (spec) | 설명 |
|---|---|---|---|---|
| ✅ | F-1 | `GET /api/feed` | `getFeed(filter)` | 피드 목록 — 필터: `all`/`nearby`/`friends`/`hot`, 페이지네이션 |
| ✅ | F-2 | `GET /api/feed/stories` | `getStories()` | `is_story=true` 최근 피드 |
| ✅ | F-3 | `POST /api/feed` | `createFeedPost(rideResult)` | 라이딩 결과 피드 공유 |
| ✅ | F-4 | `POST /api/feed/{id}/like` | `toggleLike(postId)` | `post_likes` 토글 + `like_count` 갱신 |
| ✅ | F-5 | `GET /api/feed/{id}/comments` | `getComments(postId)` | `post_comments` 목록 (대댓글 포함) |
| ✅ | F-6 | `POST /api/feed/{id}/comments` | `postComment(postId, content)` | 텍스트 또는 이미지 댓글 작성 |

### 🔔 Notification

| 상태 | # | 엔드포인트 | 연결 함수 (spec) | 설명 |
|---|---|---|---|---|
| ✅ | N-1 | `GET /api/notifications` | `getNotifications()` | 알림 목록 + 읽지 않은 수 |
| ✅ | N-2 | `GET /api/notifications/settings` | — | 알림 설정 조회 |
| ✅ | N-3 | `PUT /api/notifications/settings` | `saveNotificationSettings(prefs)` | `notification_settings` 갱신 |

---

## P3 — 프로필 상세 & 계정 관리

### 🏅 User / Badge

| 상태 | # | 엔드포인트 | 연결 함수 (spec) | 설명 |
|---|---|---|---|---|
| ✅ | U-1 | `GET /api/users/me/stats` | `getMonthlyStats()` | 이번 달 누적 km / 퀘스트 수 / 평균 안전도 |
| ✅ | U-2 | `GET /api/badges/{id}` | `getBadgeDetail(id)` | 배지 상세 + 획득 조건 |
| ✅ | U-3 | `GET /api/users/me/badges` | — | 내 배지 목록 |

### 🔐 Account

| 상태 | # | 엔드포인트 | 연결 함수 (spec) | 설명 |
|---|---|---|---|---|
| ✅ | A-3 | `DELETE /api/users/me` | `deleteAccount()` | 계정 탈퇴 (관련 데이터 CASCADE) |
| ✅ | A-4 | `POST /api/users/export` | `requestDataExport()` | 내 데이터 다운로드 요청 (stub) |

---

## Skip — 현재 미구현 유지

| 기능 | 이유 |
|---|---|
| `sendOtp(phone)` / `verifyOtp(phone, code)` | Twilio 미연동, passcode 방식으로 대체 운용 중 |

---

## 라우터 파일 현황

```
backend/app/routers/
├── auth.py          ✅ 완료
├── contents.py      ✅ 완료
├── profile.py       ✅ 완료
├── quests.py        ✅ 완료 (Q-1 ~ Q-7)
├── ride.py          ✅ 완료 (R-1 ~ R-4)
├── feed.py          ✅ 완료 (F-1 ~ F-6)
├── notifications.py ✅ 완료 (N-1 ~ N-3)
├── users.py         ✅ 완료 (U-1, U-3, A-3, A-4)
├── badges.py        ✅ 완료 (U-2)
└── admin.py         ✅ 완료 (Admin-1 ~ Admin-3)
```

---

## 전체 진행 현황

| 우선순위 | 도메인 | 총 엔드포인트 | 완료 | 잔여 |
|---|---|---|---|---|
| — | Auth/Contents/Profile (기구현) | 7 | 7 | 0 |
| P0 | Profile 확장 + Quest 핵심 | 7 | 7 | **0** |
| P1 | Quest 보조 + Ride | 6 | 6 | **0** |
| P2 | Feed + Notification | 9 | 9 | **0** |
| P3 | User/Badge + Account | 5 | 5 | **0** |
| Admin | 관리자 콘솔 (5개 메뉴 + 인증 + 정적 라우트) | 14 | 14 | **0** |
| **합계** | | **48** | **48** | **0** |
