# §1 화면 목록 (Screen Inventory)

> **출처**: `frontend/src/App.tsx` 라우터 정의 기준.  
> `PrivateRoute`로 감싸진 화면은 로그인(`user` 컨텍스트)이 없으면 `/splash`로 리다이렉트된다.  
> 진척도: [../progress.md](../progress.md)

## 1.1 그룹 A — 온보딩 / 인증

| 화면 ID | 화면명 | 접근 URL | 컴포넌트 | 보호 | scene.html | 상태 |
|---|---|---|---|---|---|---|
| ONB-001 | 스플래시 | `/` (→ `/splash` 리다이렉트) · 직접: `/splash` | `pages/auth/Splash.tsx` | Public | `01 · ONB-001` | ✅ |
| AUTH-001 | 번호입력 | `/auth/phone` | `pages/auth/PhoneInput.tsx` | Public | `02 · AUTH-001` | ✅ |
| AUTH-001-E | 번호오류(상태분기) | `/auth/phone` (입력 오류 상태) | `pages/auth/PhoneInput.tsx` | Public | `03 · AUTH-001-E` | ✅ |
| AUTH-002 | OTP 코드 입력 | `/auth/otp` | `pages/auth/OtpInput.tsx` | Public | `04 · AUTH-002` | ✅ |
| AUTH-002-E | OTP 코드 오류(상태분기) | `/auth/otp` (검증 실패 상태) | `pages/auth/OtpInput.tsx` | Public | `05 · AUTH-002-E` | ✅ |
| PROFILE-SETUP | 라이더 프로필 설정 | `/auth/profile-setup` | `pages/auth/ProfileSetup.tsx` | Public | `06 · PROFILE-SETUP` | ✅ |
| LINK-ROUTER | 딥링크 진입 | `/link` (쿼리 파라미터 처리) | `pages/link/LinkRouter.tsx` | Mixed | — | ✅ |

## 1.2 그룹 B — 홈 & 월드맵

| 화면 ID | 화면명 | 접근 URL | 컴포넌트 | 보호 | scene.html | 상태 |
|---|---|---|---|---|---|---|
| HOME-001 | 월드맵 홈 | `/home` | `pages/home/WorldMap.tsx` | Private | `07 · HOME-001 ⭐` | ✅ |
| HOME-001-EMPTY | 월드맵 홈(빈상태) | `/home` (추천 퀘스트 null 상태) | 동일 | Private | `08 · HOME-001-EMPTY` | ✅ |
| HOME-001-LOADING | 월드맵 홈(로딩) | `/home` (초기 fetch 진행 중) | 동일 | Private | `09 · HOME-001-LOADING` | ✅ |

## 1.3 그룹 C — 퀘스트

| 화면 ID | 화면명 | 접근 URL | 컴포넌트 | 보호 | scene.html | 상태 |
|---|---|---|---|---|---|---|
| QUEST-LIST | 퀘스트 목록 | `/quests` | `pages/quest/QuestList.tsx` | Private | `10 · QUEST-LIST` | ✅ |
| QUEST-LIST-EMPTY | 퀘스트 목록(빈상태) | `/quests` (필터 결과 0건 상태) | 동일 | Private | `11 · QUEST-LIST-EMPTY` | ✅ |
| QUEST-DETAIL | 퀘스트 상세 | `/quests/:id` | `pages/quest/QuestDetail.tsx` | Private | `12 · QUEST-DETAIL ⭐` | ✅ |
| QUEST-DETAIL-LOCK | 잠금 모달 | `/quests/:id` (레벨미달 상태) | 동일 | Private | `13 · QUEST-DETAIL-LOCK` | ✅ |

## 1.4 그룹 D — 라이딩

| 화면 ID | 화면명 | 접근 URL | 컴포넌트 | 보호 | scene.html | 상태 |
|---|---|---|---|---|---|---|
| RIDE-ACTIVE | 주행 HUD | `/ride/active` | `pages/ride/RideActive.tsx` | Private | `14 · RIDE-ACTIVE ⭐` | ✅ |
| RIDE-PAUSE | 일시정지 BottomSheet | `/ride/active` (오버레이) | 동일 | Private | `15 · RIDE-PAUSE` | ✅ |
| RIDE-GPS-ERROR | GPS 오류 | `/ride/active` (오버레이) | 동일 | Private | `16 · RIDE-GPS-ERROR` | ✅ |
| RIDE-RESULT-S | 결과 — 성공 | `/ride/result/success` | `pages/ride/RideResultSuccess.tsx` | Private | `17 · RIDE-RESULT-S ⭐` | ✅ |
| RIDE-RESULT-F | 결과 — 실패 | `/ride/result/fail` | `pages/ride/RideResultFail.tsx` | Private | `18 · RIDE-RESULT-F` | ✅ |

## 1.5 그룹 E — 소셜 피드

| 화면 ID | 화면명 | 접근 URL | 컴포넌트 | 보호 | scene.html | 상태 |
|---|---|---|---|---|---|---|
| FEED-001 | 피드 목록 | `/feed` | `pages/feed/FeedList.tsx` | Private | `19 · FEED-001` | ✅ |
| FEED-EMPTY | 피드 빈상태 | `/feed` (게시물 0건) | 동일 | Private | `20 · FEED-EMPTY` | ✅ |
| FEED-COMMENT | 댓글 BottomSheet | `/feed` (오버레이) | 동일 | Private | `21 · FEED-COMMENT` | ✅ |

## 1.6 그룹 F — 프로필

| 화면 ID | 화면명 | 접근 URL | 컴포넌트 | 보호 | scene.html | 상태 |
|---|---|---|---|---|---|---|
| PROFILE-001 | 내 프로필 | `/profile` | `pages/profile/ProfileMain.tsx` | Private | `22 · PROFILE-001` | ✅ |
| BADGE-DETAIL | 배지 상세 모달 | `/profile` (오버레이) | 동일 | Private | `23 · BADGE-DETAIL` | ✅ |

## 1.7 그룹 G — 설정

| 화면 ID | 화면명 | 접근 URL | 컴포넌트 | 보호 | scene.html | 상태 |
|---|---|---|---|---|---|---|
| SETTINGS | 설정 메인 | `/settings` | `pages/settings/Settings.tsx` | Private | `24 · SETTINGS` | ✅ |
| SET-NOTI | 알림 설정 | `/settings/notifications` | `pages/settings/NotiSettings.tsx` | Private | `25 · SET-NOTI` | ✅ |
| SET-LANG | 언어 설정 | `/settings/language` | `pages/settings/LangSettings.tsx` | Private | `26 · SET-LANG` | ✅ |
| SET-ACCOUNT | 계정 관리 | `/settings/account` | `pages/settings/AccountSettings.tsx` | Private | `27 · SET-ACCOUNT` | ✅ |

## 1.8 기타 라우트 / Fallback

| 항목 | 동작 | 점검 | 상태 |
|---|---|---|---|
| `*` (404) | `/home`으로 Navigate | `/some-random` 접근 시 `/home` 으로 이동 또는 로그인 안된 경우 `/splash` | ✅ |
| `PrivateRoute` 가드 | 미로그인 시 모든 Private URL → `/splash` 리다이렉트 | App.tsx `PrivateRoute` 코드 확인: `isAuthenticated` false → `<Navigate to="/splash">` | ✅ |
| 관리자 콘솔 | `http://localhost:18090/admin/`, `/admin/login` | `/admin/` → 307 redirect → `/admin/login` 200 ✅ | ✅ |
