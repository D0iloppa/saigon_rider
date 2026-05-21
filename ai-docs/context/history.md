# 완료 작업 이력 (Session History)

> 완료(✅)된 세션 작업 이력 아카이브. `current.md` 경량화를 위해 분리.  
> 필요 시에만 로드. 최신순 정렬.

---

## Task 7: 관리자 보상 정책 관리 UI (2026-05-20) — ✅ DONE

- `backend/app/templates/admin/policies.html` 신규 생성 — 정책 CRUD 전체 UI
  - 정책 목록 테이블 (코드, 이름, 조건 요약, 액션 수, 우선순위, 반복, 활성 상태)
  - 모달 폼: 조건 배열 동적 추가/삭제 (metric, op, value), 액션 배열 동적 추가/삭제 (GRANT_RP/EXP/GOLD/BADGE)
  - 활성/비활성 토글, 삭제(confirm 다이얼로그)
  - 기존 API 엔드포인트(`/admin/api/sre/policies`) fetch 연동
- `backend/app/routers/admin.py` — `GET /sre/policies` HTML 핸들러 추가, `_NAV_KEYS`에 `"policies"` 추가
- `backend/app/templates/admin/_layout.html` — 사이드바에 "보상 정책" 링크 추가
- 기존 admin 페이지 스타일(배지, 아이템) 패턴 일관성 유지

---

## DEV Context 정리 + 월드맵 기획 등록 (2026-05-20) — ✅ DONE

- IN_PROGRESS Features 7건 전부 DONE 처리 (#3, #4, #41, #42, #44, #45, #46)
- `current_focus` → "월드맵 페이지 개편 기획", `current_sprint` → "월드맵 개편 Phase 1"
- Feature #48 등록 (`home`, "월드맵 개편 — 날씨/유가/AQI 정보 허브", PLANNED)
- 위키 기획문서 카테고리 신설 + 3건 작성 (개요/날씨&AQI/유가)
- `sidebars.ts`에 기획문서 카테고리 추가

## Redis Streams 메시지 큐 도입 (2026-05-20) — ✅ DONE

- Feature #47 (`infra`): `sre_message_tbl` 직접 INSERT → Redis Streams 버퍼 + Consumer Worker 전환
- 서브태스크 7건 전부 완료 (Redis 서비스, redis-py, XADD 전환, Consumer Worker, docker-compose, Fallback, 통합 테스트)
- 태스크: `task/active/260520_redis_message_queue_task.md`

## Capacitor 도입 — NativeInterface 전환 (2026-05-20) — ✅ DONE

- Feature #46 (`infra`): `native.ts` 전면 재작성 (319줄 → ~120줄), Capacitor 플러그인 기반
- FeedCreate, FeedList 마이그레이션 완료, `vite-env.d.ts` 레거시 타입 제거
- 태스크: `task/active/260520_capacitor_migration_task.md`

## SRE 게이미피케이션 v2 — 전 서브태스크 완료 (2026-05-18~20) — ✅ DONE

- Features #42, #44, #45 완료 (가챠/상점/시즌 시스템, 아이템 컬렉션, 시즌패스)
- GAP-H2 6개 API 완료, GAP-H3 5개 UI 컴포넌트 완료, GAP-H4 시즌 시드 완료
- FAB → Game Hub Sheet 전환, 문서 현행화 전면 완료
- 태스크: `task/active/260518_sre_upgrade_plan_task.md`

## 프로필 기록/배지 실데이터 연동 (2026-05-19) — ✅ DONE

- 기록 탭: `GET /api/users/me/quest-history` 연동
- 배지 탭: `GET /api/badges?user_id=` 연동 + 관리자 CRUD
- 이번 달 통계 카드: `GET /api/users/me/stats` 연동
- 032 마이그레이션 (badge condition_rule JSONB + 다국어)

---

## ProfileCard Draggable Sheet + 피드 조회 (2026-05-18, 25차) — 🔧 코드 완료, 실기기 검증 대기

- `ProfileCard.tsx` — BottomSheet 제거 → 커스텀 draggable overlay (createPortal)
  - 기본(collapsed): 프로필 카드, 확장(expanded): 유저 피드 리스트
  - 두 스냅 지점, 속도 기반 스냅 (velocity threshold 0.4px/ms)
- `ProfileCard.module.css` 전면 재작성
- `FollowerList.tsx`, `FollowingList.tsx` — 아바타/닉네임 클릭 → ProfileCard 오픈
- 태스크: [`task/active/260518_profilecard_draggable_feed.md`](../task/active/260518_profilecard_draggable_feed.md)

## Profile Sheet 스크롤 UX 수정 (2026-05-18, 24차) — 🔧 코드 완료, 실기기 검증 대기

- ImageCarousel x/y 동시 스크롤 → `.wrap`에 `touch-action: none`
- Sheet 상한 도달 후 이중 제스처 → setTimeout 350 → 100ms
- 태스크: [`task/active/260518_profile_sheet_scroll_ux.md`](../task/active/260518_profile_sheet_scroll_ux.md)

## AppImage 폴백 체인 시스템 (2026-05-18, 23차) — ✅ DONE

- 퀘스트 썸네일 최종 폴백 실패 시 shimmer 영구 표시 버그 수정
- `_to_out()` 4단계 체인 배열 빌드, `AppImage` 체인 walking + 재시도 + 에러 이미지
- 트러블슈팅: [`trouble/260518/260518_appimage_fallback_shimmer.md`](../trouble/260518/260518_appimage_fallback_shimmer.md)

## 월드맵 SECTION 1/2 실데이터 연동 (2026-05-18, 22차) — 🔧 코드 완료, UI 검증 대기

- SECTION 1: `useUserStore.refreshUser()` → 월드맵 진입 시 xp/gold/skill_pt 갱신
- SECTION 2: `GET /quests/recommended` + `app_config` 기반 추천 퀘스트 N개
- AppConfig 모델 + 관리자 설정 (`030_app_config_seed.sql`)

## 피드 팔로우 카운트 버그 수정 + 언팔로우 확인 다이얼로그 (2026-05-18, 21차) — ✅ DONE

- ProfileCard 팔로우/언팔로우 시 팔로워 수 미갱신 버그 수정
- 언팔로우 확인 다이얼로그 3곳 (ProfileCard, FollowingList, FollowerList)

## 앱 버전 관리 시스템 (2026-05-18, 20차) — ✅ DONE

- `app_versions` 테이블 트리 구조 (primary → ios/android)
- 공개 API 3종 + 관리자 CRUD
- DB `029_app_versions.sql`, 백엔드 `routers/app_version.py`

## 건너뛰기 시 기본 닉네임 부여 (2026-05-18, 19차) — ✅ DONE

- `[형용사] [명사] [3자리숫자]` 영어 기본 닉네임 자동 부여
- `nickname_words` 테이블 + 관리자 단어풀 CRUD
- DB `028_nickname_words.sql`

## PTR 러버밴딩 + ProfileSetup 온보딩 UX (2026-05-18, 18차) — ✅ DONE

- PTR 러버밴딩 효과 (`contentStyle` translateY), ProfileSetup StatusBar 누락, 건너뛰기 버튼

## Overscroll Bounce + Profile Sheet 스크롤 Block (2026-05-18, 17차) — ✅ DONE

- `overscroll-behavior: none`, Sheet `scrollable` state + setTimeout 지연, ImageCarousel 축 잠금
- 트러블슈팅: [`trouble/260518/`](../trouble/index.md)

## API 에러 Toast + 프로필 수정 (2026-05-18, 16차) — ✅ (부분)

- API 클라이언트 에러 Toast 일괄 적용 (✅)
- 프로필 PUT 500 → `rider_type_id` FK 할당으로 수정 (✅)
- ⚠ 인증 방식 미구현 → `task/active/260515_auth_todo.md`에서 추적

## 프로필 피드 관리 기능 (2026-05-17, 15차) — ✅ DONE

- 백엔드 API 3종 (GET/PUT/DELETE `/feed/{post_id}`), 프로필 feeds 탭, 피드 수정 페이지

## 친구 기능 마무리 (2026-05-17, 14차) — ✅ DONE (FriendAdd 미완)

- ProfileCard BottomSheet, 프로필 Draggable Sheet, QR 프로필 공유
- FriendAdd 검색/QR스캔 탭 미완 → `task/active/260516_friend_feature.md`

## 무한스크롤 + Pull-to-Refresh + 퀘스트 완료 구조 (2026-05-16, 13차) — ✅ DONE

- `useInfiniteScroll<T>`, `usePullToRefresh`, ScrollSentinel, PullIndicator
- 퀘스트 서버사이드 완료 필터링

## 피드 소셜 기능 확장 (2026-05-16, 12차) — ✅ DONE

- DB 020-023, UserFollow/DmConversation/DmMessage, 피드 위치 필터, 프론트 5개 신규 페이지

## 기본 프로필 이미지 풀 (profile_mock) 도입 (2026-05-16, 11차) — ✅ DONE

- `owner_type='profile_mock'` 6장, `GET /contents/profile-mock-img` 결정론적 선택

## 관리자 콘솔 콘텐츠 contents 중개 (2026-05-16, 10차) — ✅ DONE

- contents 테이블 중개 원칙 확립, 마이그레이션 017, resolver 체계

## 관리자 콘솔 전체 기능 구현 (2026-05-16, 9차) — ✅ DONE

- admin 7개 페이지, 사이드바 레이아웃, admin user 시드 (015)

## 퀘스트 페이지 핀 버튼 등재 (2026-05-16) — 메모

- 핀 필터 UX 의도 확인, District 중심 좌표 미결 → `project_todo.md`에 등재

## 보안 / 환경 변수 규약 신설 (2026-05-16) — ✅ DONE

- GUIDELINE §7 신설, `.env.example` 키 6종 추가

## BFF 타임존 (2026-05-16 확정) — ✅ DONE

- `APP_TIMEZONE` 환경변수, `APP_TZ` 유틸, 일자 경계 제어 3곳 적용

## 최근 작업 이력 (2026-05-15 — 6차)

| # | 작업 | 결과 |
|---|---|---|
| 20 | 시스템 이미지 imgproxy 서빙 구조 구축 | `contents/system/` 배치, `build_imgproxy_url(options)` 확장 |
| 21 | DB 마이그레이션 011 | `districts.image_content_id UUID FK` |
| 22 | DB 마이그레이션 012 | district 5개 + quest 썸네일 6개 contents 시드 |
| 23 | BFF District 모델 확장 | `DistrictOut` model_validator imgproxy resolve |
| 24 | BFF contents 엔드포인트 2종 | `GET /contents/{id}/img`, `GET /contents/mock-img` |
| 25 | quests `_to_out()` fallback 체인 | quest thumbnail → district image → mock-img |
| 26 | DB 마이그레이션 013 | `content_owner_type` mock 추가, mock 5개 시드 |
| 27 | Mock 이미지 5장 배치 | `contents/system/mock/mock-01~05.jpg` |
| 28 | `BFF_PUBLIC_URL` 환경변수 | `.env` + docker-compose 반영 |
| 29 | 워크플로우 현행화 | `system-contents-upload.md` |
