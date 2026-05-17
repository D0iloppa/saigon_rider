# 현재 상황 (Session Carry-Over)

> 다음 스레드가 이 파일만 읽고도 작업을 이어받을 수 있도록 작성.  
> 큰 변경 후 갱신. **마지막 갱신**: 2026-05-17 (15차 — 프로필 피드 관리: 내 피드 조회/수정/삭제)

## 프로필 피드 관리 기능 (2026-05-17, 15차)

- **백엔드 신규 API 3종** (`routers/feed.py`):
  - `GET /feed/{post_id}` — 피드 단건 조회 (F-2b)
  - `PUT /feed/{post_id}` — 피드 수정, 소유자 검증 (F-3b)
  - `DELETE /feed/{post_id}` — 피드 삭제, 소유자 검증 (F-3c)
- **스키마 신규**: `FeedUpdateRequest`, `FeedDeleteRequest` (`schemas.py`)
- **프론트 API 신규 함수** (`api/feed.ts`): `fetchFeedPost`, `fetchMyFeed`, `updateFeedPost`, `deleteFeedPost`
- **프로필 페이지 feeds 탭** (`ProfileMain.tsx`):
  - 탭 순서: feeds > history > badges > gear (feeds가 기본 탭)
  - 내 피드 리스트 조회 (fetchMyFeed, user_id 필터)
  - 각 피드 카드에 `⋮` 메뉴 → 수정 / 삭제 액션
  - 삭제: useDialogStore 확인 다이얼로그 → deleteFeedPost API
  - "+ 새 글" 버튼 → `/feed/new` 이동
- **피드 수정 페이지** (`pages/feed/FeedEdit.tsx`): 기존 content/image 프리필, FeedCreate CSS 재활용, `/feed/edit/:postId` 라우트
- **App.tsx**: `/feed/edit/:postId` 라우트 추가
- **i18n**: ko/en/vi에 `profile.tabFeeds`, `profile.emptyFeeds`, `profile.editPost`, `profile.deletePost`, `profile.deletePostConfirm`, `feedEdit.*` 등 키 추가
- **CSS**: `ProfileMain.module.css`에 feedsList, feedCard, feedCardMenu, feedCardDropdown 등 스타일 추가
- TypeScript 빌드 통과, Frontend + BFF Docker 재배포 완료

## 친구 기능 마무리 (2026-05-17, 14차)

- **ProfileCard BottomSheet** (`components/ProfileCard.tsx`): 타유저 프로필 카드. 아바타+닉네임+레벨뱃지+riderStyle+팔로워/팔로잉 수+팔로우 버튼. FeedList에서 게시자 클릭 시 오픈.
- **백엔드 `GET /users/{user_id}/profile`**: nickname, avatar_url, level, rider_style, follower_count, following_count, is_following 반환. `UserProfileOut` 스키마 신규.
- **프론트 `fetchUserProfile`** (`api/profile.ts`): snake_case→camelCase 수동 매핑.
- **FeedList 연동**: `.postHeader`를 `<button>`으로 변경, 자기자신 클릭→`/profile`, 타인→ProfileCard 오픈.
- **프로필 페이지 구조 재설계** (Draggable Sheet 패턴):
  - 단일 `bgFixed` 그라데이션 배경 (전체화면 고정)
  - Section 1 (fixedHeader: 아바타~레벨바) — 항상 고정
  - Section 2 (socialSection: 팔로워/팔로잉 + 프로필공유/친구추가 버튼) — fixed, Section 1 아래
  - Section 3 (sheet: 드래그 가능 바텀시트) — snapMin/snapMax 두 지점 스냅, Section 2 위로 올라갈 수 있으나 Section 1은 절대 덮지 않음
  - 핵심: `overflowY` 토글 (`hidden` while dragging, `auto` at snapMin) → 시트 이동과 내부 스크롤 분리
- **소셜 영역 2분할**: Friend 셀 제거, Follower/Following만 표시.
- **프로필 액션 버튼 (Instagram 스타일)**: "프로필 공유" 텍스트 버튼 (→QR BottomSheet) + 친구추가 SVG 아이콘 (→`/friends/add`).
- **QR 프로필 공유 BottomSheet**: qrcode.react 활용, 내 프로필 URL QR 코드 + 닉네임 표시.
- Docker 재빌드 배포 완료.

## 무한스크롤 + Pull-to-Refresh + 퀘스트 완료 구조 (2026-05-16, 13차)

- **무한스크롤**: `useInfiniteScroll<T>` 훅 신규 (`hooks/useInfiniteScroll.ts`) — IntersectionObserver + sentinel ref, loadingRef 중복 방지, deps 변경 시 자동 리셋
- **ScrollSentinel**: `components/ui/ScrollSentinel.tsx` — 리스트 하단 스피너/끝 표시
- **Pull-to-Refresh**: `usePullToRefresh` 훅 (`hooks/usePullToRefresh.ts`) — touch 이벤트 기반, 저항감 0.5 감쇠, 64px 임계값
- **PullIndicator**: `components/ui/PullIndicator.tsx` — 당김 진행도에 따라 화살표 회전 → 스피너 전환
- **피드**: `fetchFeed` → `FeedPage` 반환, `FeedList` 무한스크롤 + PTR 연결
- **퀘스트 백엔드**: `GET /quests`에 `user_id` + `exclude_completed=true` 파라미터 추가 → UserQuest NOT IN 서브쿼리로 서버사이드 필터링, `total`도 미완료 기준
- **퀘스트 프론트**: `fetchQuests` → `QuestPage` 반환, `QuestList` 무한스크롤 + PTR 연결, 완료 퀘스트는 리스트에서 skip + 하단 "N개 완료" 카운트 배지만 표시
- TypeScript 빌드 통과, Docker 재배포 완료

## 피드 소셜 기능 확장 (2026-05-16, 12차)

- **DB 마이그레이션 020-023**: feed_posts 위치 컬럼(lat/lng/district_id), user_follows(팔로우), dm_conversations(DM 대화방), dm_messages(DM 메시지) 테이블 추가.
- **백엔드 모델**: `UserFollow`, `DmConversation`, `DmMessage` 신규 + `FeedPost`에 `latitude`, `longitude`, `district_id` 확장.
- **백엔드 라우터 2개 신규**:
  - `follows.py`: POST/DELETE /follows/{user_id}, GET /users/{user_id}/followers|following|follow-counts
  - `dm.py`: GET/POST /dm/conversations, GET/POST /dm/conversations/{id}/messages, POST /dm/conversations/{id}/read
- **피드 라우터 확장**: `filter=neighborhood` → PostGIS ST_DWithin(5km), `filter=friends` → user_follows 서브쿼리
- **프론트 신규 페이지 5개**: FeedCreate(`/feed/new`), DmList(`/dm`), DmDetail(`/dm/:id`), FollowerList(`/followers/:userId`), FollowingList(`/following/:userId`)
- **프론트 수정**: TopBar에 `leftContent` prop 추가, FeedList 헤더 재구성(좌측 + 버튼, 우측 프로필/DM 아이콘), ProfileMain에 팔로워/팔로잉 카운트 + 네비게이션
- **i18n**: ko/en/vi에 feedCreate, dm, follow 키 추가
- ⚠ 마이그레이션 020-023은 기존 환경에서 수동 적용 필요: `docker exec -i saigon_db psql -U $DB_USER -d $DB_NAME < database/init/020_feed_location.sql` (021~023도 동일)

## 기본 프로필 이미지 풀 (profile_mock) 도입 (2026-05-16, 11차)

- 단일 default 아바타(`saigon-default.jpg`) → `owner_type='profile_mock'` 컨텐츠 풀로 전환 ([상세](../task/260516/260516_profile_mock_pool.md)).
- **마이그레이션 018/019**: `content_owner_type` enum 에 `profile_mock` 추가, `system/profile-mock/` 하위 6장(`saigon-default.jpg` + `profile-mock-01~05.png`) 등록.
- **신규 엔드포인트** `GET /contents/profile-mock-img?seed=&w=&h=` — `profile_mock` 풀에서 seed(user_id) 결정론적 선택 → imgproxy 302 (`serve_mock_image` 와 `_serve_pool_image` 헬퍼 공유).
- **resolver**: `utils.default_avatar_url(seed)` 가 profile-mock 엔드포인트 URL 반환. `resolve_avatar_url` 폴백이 `seed=user.id` 로 호출 → 프로필 없는 유저는 풀에서 결정론적 1장. 등록된 프로필 사진이 있으면 그대로 우선. 프론트·관리자 모두 BFF resolver 경유라 코드 변경 불필요.
- 검증: 6개 seed → 6장 분산, imgproxy 200 서빙 확인.
- ⚠ 마이그레이션 018·019 는 기존 환경에서 수동 적용 필요 (`docker exec -i saigon_db psql -U $DB_USER -d $DB_NAME < database/init/018_*.sql` / `019_*.sql`).

## 관리자 콘솔 콘텐츠 contents 중개 / 피드 CRUD 보강 (2026-05-16, 10차)

- 관리자 페이지 기능 오류 6종 수정 ([상세](../task/260516/260516_admin_content_mediation_fix.md))
- **핵심 원칙**: 모든 콘텐츠는 `contents` 테이블로 중개되고 `content_id` 로 매핑된다 (관리자·프론트 공통). imgproxy URL 을 컬럼에 직접 저장하던 방식 폐지.
- **마이그레이션 017**: `feed_posts.image_content_id UUID FK` 추가. 피드 이미지는 contents row 생성 후 id 매핑.
- **프로필/아바타**: `users.avatar_content_id` 만 저장 (`avatar_url` 쓰기 폐지). 미설정 시 프론트 default 이미지(`saigon-default.jpg`)로 폴백.
- **이미지 URL 해석**: `utils.resolve_avatar_url()` / `resolve_feed_image_url()` — 우선순위 `content_id > 레거시 url > default`. BFF 출력 시점에 imgproxy URL 로 해석.
- **퀘스트 썸네일 체인**: `thumbnail_content > district.image_content > mock` 으로 축소 (`hero_image_url`·`district.image_url` 제거 — contents 미중개라 폐기).
- **피드 관리**: 인스타그램 카드형 리스트로 재구성, `/admin/feed/{id}/edit` 수정 기능 신설, 본문 `#해시태그` 정규식 강조.
- ⚠ async lazy-load 회피: `UserOut`/`FeedPostOut` 가 관계를 참조하므로 commit 후 직렬화 엔드포인트는 `db.refresh` 대신 재조회.
- ⚠ 마이그레이션 017 은 기존 환경에서 수동 적용 필요: `docker exec -i saigon_db psql -U $DB_USER -d $DB_NAME < database/init/017_feed_image_content.sql`

## 관리자 콘솔 전체 기능 구현 (2026-05-16, 9차)

- 기존 admin: login + dashboard 두 페이지뿐 → 5개 메뉴 전체 구현 ([상세](../task/260516/260516_admin_console_full.md))
- 신규 admin 페이지(7개): `/admin/quests`, `/admin/quests/new`, `/admin/quests/{id}/edit`, `/admin/feed`, `/admin/feed/new`, `/admin/users`, `/admin/settings`
- 사이드바 공통 레이아웃 도입 — `templates/admin/_layout.html` + `_render_page(name, nav, page_title, **ctx)` 헬퍼 (Jinja2 미도입, 단순 치환 컨벤션 유지)
- **admin user 시드** (015 마이그레이션): `users` 테이블에 가상 행 1개 (`id=00000000-0000-0000-0000-000000000001`, `phone='__admin__'`, `nickname='admin'`). 피드 작성·아바타 업로드의 user_id 로 사용. ENV `ADMIN_USER_ID` 로 override 가능.
- 퀘스트 등록 폼 노출 범위: 필수+보상+i18n 제목+썸네일 (rider_type/safety_grade 는 014 의 자동 매핑 정책에 위임)
- 피드 등록은 multipart 이미지 첨부 → `_save_uploaded_image()` 헬퍼가 `system/` 경로에 저장 후 imgproxy URL 을 `feed_posts.image_url` 에 직접 기록
- 스모크 검증: 7개 페이지 200 응답 + 피드/퀘스트 등록(이미지) + 아바타 업로드 모두 동작 확인
- ⚠ 마이그레이션 015 는 `database/init/` 자동 실행이 안 된 기존 환경에서는 `docker exec -i saigon_db psql -U $DB_USER -d $DB_NAME < database/init/015_admin_seed.sql` 수동 적용 필요

## 퀘스트 페이지 핀 버튼 등재 (2026-05-16)

- `QuestList.tsx:100` 우상단 핀 이모지(`<GifIcon code="1f4cd" />`) — 현재 onClick 없는 장식 상태 확인.
- UX 의도: 현재 위치 기준 "내 근처 퀘스트" 필터. NULL 좌표 퀘스트는 거리 조건 무시.
- 기존 자산: `quest_pins`(PostGIS POINT) + `/api/quests/pins` + `nativeInterface.getLocation` 이미 존재.
- District 에는 중심 좌표 없음 — 데이터 모델 결정(A/B/C 옵션) 후 마이그레이션 필요.
- 다영역 협업 항목으로 [`project_todo.md`](../project_todo.md) "🗺 위치 / 지도" 섹션 신설하여 등재.

## 보안 / 환경 변수 규약 신설 (2026-05-16)

- `GUIDELINE.md` §7 "보안 / 환경 변수" 신설 — `.env` 절대 노출 금지, 키셋 동일 인터페이스 의무, 보안 정보 하드코딩 금지(`os.getenv()` / `import.meta.env` / `${VAR}` 보간 참조만).
- `.env.example` 에 누락 키 6종 추가 (`ADMIN_USER`/`ADMIN_PASS_HASH`/`ADMIN_JWT_SECRET`/`APP_TIMEZONE`/`BFF_PUBLIC_URL`/`IMGPROXY_BASE_URL`) — `.env` 와 키셋 완전 일치 확인.
- `README.md` "환경변수 (.env)" 섹션 상단에 보안 규약 박스 추가.
- ⚠ 향후 `.env` 에 키를 추가/삭제할 때마다 `.env.example` 도 즉시 동일 갱신할 것 (GUIDELINE §7 규칙 2).

## BFF 타임존 (2026-05-16 확정)

- `.env` `APP_TIMEZONE` (기본 `Asia/Seoul`) 으로 일자 경계 제어
- `docker-compose.yml` → bff 서비스에 `APP_TIMEZONE`, `TZ` 둘 다 주입
- `backend/app/utils.py` 에 `APP_TZ` 노출 (잘못된 값은 Asia/Seoul 폴백)
- 적용 대상:
  - `quests.py` `_calc_period_key` (DAILY/WEEKLY 퀘스트 일자 경계)
  - `users.py` `_month_bounds` (월별 통계, 구 `_vn_month_bounds` 폐기)
  - `ride.py` `_upsert_streak` (라이딩 streak 일자 경계)
- 변경 시 `tzdata` 패키지 필요 (slim 이미지) — `requirements.txt` 반영
- ⚠ **엔진(SRE)** 의 `SRE_TIMEZONE` 은 비즈니스 룰 (anti-abuse, RP 만료 등) 용이라 별도 — 현재 `Asia/Ho_Chi_Minh` 유지

## 활성 태스크

**`task/active/260515_human_ux_check.md`** — §2.7~2.15 휴먼 UX 점검 (58 항목, 미점검 잔여)

**`task/active/260515_tabbar_scroll_layout_fix.md`** — TabBar iOS 수정 + Feed/Profile 스크롤 레이아웃 (실기기 최종 확인 대기)

**`task/active/260515_tabbar_ux_polish.md`** — TabBar UX 개선 (진행 중)

**`task/active/260515_auth_todo.md`** — 인증 체계 구현 (진행 중)

**`task/active/260516_infinite_scroll.md`** — 무한스크롤 + PTR + 퀘스트 완료 구조 (구현 완료, UI 검증 필요)  
✅ 문서·위키 현행화 완료 (2026-05-16, wiki 재발행)

**`task/active/260516_friend_feature.md`** — 친구 기능 마무리 (ProfileCard + 소셜 단순화 + QR 공유 완료, FriendAdd 검색/QR스캔 탭 미완)

**`task/active/260517_profile_feed_management.md`** — 프로필 피드 관리 (조회/수정/삭제 구현 완료, UI 검증 필요)

**`task/active/260515_quest_fk_mapping.md`** — Quest FK 매핑 (진행 중)

### 다음 우선순위
1. **실기기 확인**: iOS에서 TabBar/Feed/Profile 이슈 수정 결과 검증
2. **12차 UI 검증**: 피드 헤더(+/프로필/DM 아이콘), /feed/new, /dm, 팔로워 카운트, 필터 칩 동작
3. **A섹션 결함 수정**: F-AUTH-LOGIN, F-02-7, F-03-2 코드 수정
4. **퀘스트 이미지 매핑**: DB 실제 퀘스트에 `thumbnail_content_id` 연결 (어드민 플로우)

---

## 최근 작업 이력 (2026-05-15 — 6차)

| # | 작업 | 결과 |
|---|---|---|
| 20 | **시스템 이미지 imgproxy 서빙 구조 구축** | `contents/system/districts/`, `contents/system/quests/` 배치, `build_imgproxy_url(options)` 확장 |
| 21 | **DB 마이그레이션 011** | `districts.image_content_id UUID FK` 추가 |
| 22 | **DB 마이그레이션 012** | district 5개 + quest 썸네일 6개 contents 시드, district `image_content_id` 자동 연결 |
| 23 | **BFF District 모델 확장** | `District.image_content`, `DistrictOut` model_validator로 imgproxy URL 자동 resolve |
| 24 | **BFF contents 엔드포인트 2종 추가** | `GET /contents/{id}/img` (redirect), `GET /contents/mock-img` (mock 랜덤 redirect) |
| 25 | **quests `_to_out()` fallback 체인 완성** | quest thumbnail → district image → mock-img 순서 |
| 26 | **DB 마이그레이션 013** | `content_owner_type` enum에 `'mock'` 추가, mock 이미지 5개 시드 |
| 27 | **Mock 이미지 5장 배치** | `contents/system/mock/mock-01~05.jpg`, Saigon Rider 분위기 AI 생성 이미지 |
| 28 | **`BFF_PUBLIC_URL` 환경변수 추가** | `.env` + `docker-compose.yml` 반영, `MOCK_IMG_ENDPOINT` 유틸 상수화 |
| 29 | **워크플로우 `system-contents-upload.md` 현행화** | content_id 기반 서빙 구조, BFF redirect 패턴, 관련 코드 목록 반영 |

---

## 이미지 서빙 아키텍처 (2026-05-15 확정)

> 신규 이미지 추가 시 반드시 확인 — 상세는 [`workflow/system-contents-upload.md`](../workflow/system-contents-upload.md)

```
thumbnail_url 결정 순서 (_to_out in quests.py):
  1. quest.thumbnail_content.file_path  → build_imgproxy_url()
  2. quest.district.image_content.file_path → build_imgproxy_url()
  3. MOCK_IMG_ENDPOINT (BFF_PUBLIC_URL/contents/mock-img → 랜덤 302)
```

- **content_id 기반 서빙**: `GET /api/bff/contents/{id}/img?w=800&h=450` → 302 → imgproxy
- **신규 업로드**: 파일명 = content_id UUID (`contents.py` upload 엔드포인트)
- **owner_type**: `system` (관리자 배치) / `user` (유저 업로드) / `mock` (fallback 전용)
- **관련 마이그레이션**: `011`, `012`, `013` (database/init/)

---

## 미해결 결함 (❌, [issues.md](../TEST/issues.md))

| 기능 ID | 화면 | 수정 방향 |
|---|---|---|
| F-AUTH-LOGIN | AUTH-002 OtpInput | `handleVerify` → `apiLogin(phone, passcode)` 호출 |
| F-02-7 | AUTH-002 재전송 | 재전송 버튼 onClick에 `apiRegister(phone)` 호출 추가 |
| F-03-2 | PROFILE-SETUP 닉네임 중복 | debounce + `check-nickname` API 연동 |

---

## 진행 중 / 부분 점검 (🟡)

- F-03-1 닉네임 1자 IME 이슈 — 재빌드 후 재점검 필요
- ~~F-09-3 피드 필터 chip neighborhood/friends~~ → 12차에서 구현 완료 (user_follows + PostGIS ST_DWithin)
- 퀘스트 `thumbnail_content_id` 미연결 — DB 퀘스트가 mock 데이터와 달라 직접 매핑 필요

---

## 미구현 후속 태스크 메모

> 다영역 협업이 필요한 영구 후속 항목은 [`project_todo.md`](../project_todo.md) 로 이관됨.
> 신규 항목은 본 섹션이 아닌 `project_todo.md` 의 적절한 카테고리에 추가한다.

---

## 현재 프론트엔드 CSS 아키텍처 핵심 규칙

> **신규 페이지 추가 시 반드시 확인** — 상세는 [`context/frontend.md`](frontend.md) §2~§3

- `<StatusBar>` 를 헤더 최상단 첫 자식으로 배치, 헤더 `padding-top: 0` 유지
- `TopBar` 컴포넌트 사용 시 내부에 StatusBar 포함 → 추가 불필요
- 고정 px 값으로 상단 여백 지정 금지 → `var(--status-bar-height)` 사용
- 플랫폼 분기 필요 시 `[data-platform="ios"]` / `[data-platform="android"]` CSS 선택자 활용

---

## 다음 스레드 진입 시 권장 순서

1. [INDEX.md](../INDEX.md) → 이 파일 (`current.md`) 확인
2. 필요한 활성 태스크 로드 (`human_ux_check`, `tabbar_*`, `auth_todo` 등)
3. 필요 시 [`TEST/issues.md`](../TEST/issues.md) 와 해당 섹션 체크리스트만 추가 로드
