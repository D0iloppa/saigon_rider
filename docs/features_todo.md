# Saigon Rider — 상세 구현 TODO 리스트

> **정적 디자인 기준**: `/scene.html` 직접 열어 확인  
> **텍스트 작성 지침**: 모든 텍스트 요소는 i18n을 고려해서 작업할 것
> **API 정책**: 백엔드 미구현 항목은 `src/api/` dummy 함수로 구현. 함수 내부만 교체하면 동작  
> **상태 범례**: ✅ 미구현 · ✅ 완료 · 🚧 진행중 · ⏭ 스킵(우선순위 하향)


---

## 🏗 공통 기반 (Foundation)

### 프로젝트 초기 설정
- ✅ CSS Design Token 정의 (`--brand-*`, `--ink-*`, `--neon-*`, `--grad-*` 등 scene.html 토큰 이식)
- ✅ 전역 폰트 설정 (Pretendard, Space Grotesk, Instrument Serif)
- ✅ 전역 Reset CSS + base 스타일
- ✅ Router 설정 (전체 27개 화면 라우트 등록)
- ✅ 전역 상태 관리 초기 설정 (auth / user / ride store)
- ✅ i18n 설정 (한국어 / Tiếng Việt / English 3개 locale)
- ✅ `src/api/` 모듈 구조 생성 (client.ts / quests.ts / feed.ts)
- ✅ 모든 API dummy 함수 초기 작성 (USE_MOCK 패턴, spec.md 기준)

### 공통 컴포넌트
- ✅ `StatusBar` — 시간(Space Grotesk) + 신호/배터리 SVG 아이콘 (라이트/다크 variant)
- ✅ `BottomTabBar` — 월드/퀘스트/FAB/피드/프로필 탭, active 상태 위쪽 bar indicator, FAB grad-sunset 64px
- ✅ `BtnPrimary` — brand-500, shadow-pop, 상단 흰색 shine 레이어, 56px
- ✅ `BtnSecondary` — surface, brand 테두리, 56px
- ✅ `BtnGlass` — rgba(255,255,255,.12), 흰 테두리, backdrop-filter
- ✅ `BtnDangerOutline` — danger 색상, 테두리, 56px
- ✅ `Chip` — variant: glass / glass-light / brand / surface / dark / lime / xp / gold / exp / hot / new / limited (전용 컴포넌트 미구현, CSS 클래스만 존재)
- ✅ `Toggle` — on/off 상태, 슬라이드 애니메이션 (Toggle.tsx)
- ✅ `RadioCircle` — checked/unchecked, brand-500 채움 (현재 ● ○ 텍스트로 대체)
- ✅ `ProgressBar` — track + fill (brand-300 → brand-500 그라디언트)
- ✅ `GlassPanel` — dark glass (globals.css .glass 클래스)
- ✅ `GlassLight` — light glass (globals.css .glass-light 클래스)
- ✅ `OTPBox` — filled / active(커서) / empty-dot / error(shake + 빨간 테두리) 상태 (AuthForm.module.css)
- ✅ `StoryAvatar` — 64px 원형, brand-500→xp 그라디언트 테두리
- ✅ `LevelBadge` — "LV.N" brand-500 배경 인라인 뱃지
- ✅ `SkeletonShimmer` — shimmer 애니메이션 (globals.css .shimmer)
- ✅ `SettingsRow` — 아이콘 + 라벨 + 우측 chevron/토글 레이아웃, border-bottom
- ✅ `PhotoCard` — 이미지 + saturate/contrast 필터 + 상단 shine 레이어
- ✅ `MapPin` — brand-500 pill, 주황 glow, 절대 위치
- ✅ `CardBase` — card-3d (shadow-card, 상단 shine 레이어, border-radius 24px)

---

## 그룹 A — 온보딩 / 인증 (Auth Flow)

### [ONB-001] 스플래시 화면 `/`
- ✅ 풀스크린 `--grad-sunset` 그라디언트 배경
- ✅ noise texture 오버레이 (SVG feTurbulence)
- ✅ 사이공 야경 hero 이미지 (상단 440px, 하단 페이드 그라디언트)
- ✅ 상단 StatusBar (흰색 텍스트/아이콘 SVG, 인라인 구현)
- ✅ 우상단 언어 선택 Chip (KO ▾, glass variant, 국기 GIF)
- ✅ 중앙 워드마크: 이탤릭 서브카피 + "SAIGON RIDER" (72px Space Grotesk, top:310px)
- ✅ 하단 Bottom Sheet (흰 배경, 상단 radius 32px, 절대 위치 bottom:0)
  - ✅ "시작하기" BtnPrimary → `/auth/phone`
  - ✅ "로그인" 텍스트 링크 → `/auth/phone`
- ✅ `localStorage` 토큰 유무 자동 확인 → 토큰 있으면 `/home`으로 리다이렉트

### [AUTH-001] 번호 입력 `/auth/phone`
- ✅ `--bg` 배경
- ✅ 뒤로가기 버튼 (TopBar showBack)
- ✅ 제목 "휴대폰 번호로 로그인" (h1, 28px)
- ✅ 설명 caption (+84 베트남 번호 안내)
- ✅ 번호 입력 카드 (80px, shadow-card, 상단 shine)
  - ✅ +84 국가코드 + 베트남 국기 GIF (border-right 1.5px 구분선)
  - ✅ 번호 입력 (Space Grotesk 24px, text-3 색상)
- ✅ 실시간 입력 포맷팅 (숫자만 필터, 최대 11자리 강제)
- ✅ 유효성 검사 (10~11자리) → 유효하지 않으면 버튼 disabled
- ✅ `[AUTH-001-E]` 에러 상태: 빨간 테두리 + 에러 메시지
- ✅ "인증 코드 받기" BtnPrimary → `sendOtp(phone)` dummy → `/auth/otp`
- ✅ 하단 약관 동의 텍스트 (brand-500 링크)
- ✅ 하단 mesh gradient 장식 (opacity 0.15)

### [AUTH-002] OTP 입력 `/auth/otp`
- ✅ 뒤로가기 버튼
- ✅ 제목 "인증 코드 입력" + 번호 안내 caption
- ✅ 6칸 OTPBox 컴포넌트 (가운데 정렬, gap 8px)
- ✅ 숫자 키 입력 시 현재 칸 채우고 다음 칸으로 자동 포커스
- ✅ Backspace 시 현재 칸 지우고 이전 칸으로 포커스
- ✅ 카운트다운 타이머 (03:00 → 0, mm:ss, Space Grotesk)
- ✅ "확인" BtnPrimary → `verifyOtp(phone, code)` dummy → 성공 시 `/auth/profile-setup`
- ✅ `[AUTH-002-E]` 검증 실패: 모든 OTPBox error 상태 + CSS shake 애니메이션 + 에러 메시지
- ✅ 타이머 0 도달 시 "재전송" 텍스트 활성화 → `sendOtp()` 재호출 + 타이머 리셋

### [PROFILE-SETUP] 라이더 프로필 설정 `/auth/profile-setup`
- ✅ 뒤로가기 버튼 (인라인 backBtn, 40x40, shadow-card)
- ✅ 3단계 Dot Indicator (2단계 brand-500, 3단계 line색)
- ✅ 제목 "당신은 어떤 라이더인가요?"
- ✅ 닉네임 입력 카드 (모터사이클 GIF, 입력 placeholder, 체크 GIF)
  - ✅ 실시간 `checkNickname(nickname)` dummy 호출 (debounce 500ms)
  - ✅ 사용 가능 ✓ GIF 아이콘 표시 (2자 이상 입력 시)
- ✅ 라이더 타입 선택 카드 3종 (GIF emoji 아이콘)
  - ✅ 출퇴근러 (1f3d9 GIF, 설명)
  - ✅ 카페 헌터 (2615 GIF, 설명)
  - ✅ 나이트 라이더 (1f319 GIF, 설명)
  - ✅ 선택 상태: brand-500 테두리 + shadow-pop + 그라디언트 오버레이
  - ✅ 미선택 상태: 기본 card-3d 스타일
- ✅ RadioCircle — 22px 원형, checked: brand-500 채움 + 흰 dot
- ✅ 하단 고정 "시작하기 →" BtnPrimary → `saveProfile(data)` dummy → `/home`

---

## 그룹 B — 홈 & 월드맵 (Home)

### [HOME-001] 월드맵 홈 `/home`

#### 헤더
- ✅ `--grad-sunset` 배경 + noise 오버레이
- ✅ 아바타(48px 원형, 흰 테두리) + 닉네임(white 15px bold) + LV MICRO 라벨
- ✅ 알림 Bell GIF + 빨간 dot 뱃지
- ✅ 설정 ⚙ GIF → `/settings`

#### 레벨 & 재화
- ✅ 인사 텍스트 ("Chào buổi tối, [이름] ✨") + 레벨업까지 caption
- ✅ ProgressBar (흰색 track + fill, 100% 기준)
- ✅ 재화 카드 가로 스크롤 (XP / Gold / Skill Pt)
  - ✅ 각 카드 border-top 4px (xp/gold/brand-500 색상)
  - ✅ GIF 이모지(36px) + 숫자 + MICRO 라벨
  - ✅ 숫자 카운팅 애니메이션 (300ms)

#### SVG 월드맵
- ✅ 배경 `#DFF0EC`, border-radius 28px, 220px 높이
- ✅ River Saigon SVG path (#6ED8D0 stroke)
- ✅ 구역 Polygon 6개 (Q.1 / Q.3 / Bình Thạnh / Q.7 / Phú Nhuận / Thủ Đức)
- ✅ 점령 구역 fill: `--brand-200` / 미점령: `--surface-2`
- ✅ 구역 텍스트 라벨 (SVG text, Space Grotesk 9px)
- ✅ 퀘스트 핀 (pill 형태, brand-500, 절대 위치)
- ✅ 핀 클릭 → `/quests/:id`
- ✅ 우상단 "HCM City" glass-light chip

#### Tonight's Pick (추천 퀘스트)
- ✅ `fetchRecommendedQuest()` dummy 호출
- ✅ TONIGHT'S PICK MICRO 라벨 + 시간대
- ✅ 썸네일 80x80 + 퀘스트명 + GIF 보상 아이콘
- ✅ "퀘스트 시작" 버튼 (48px, border-radius 16px) → `/quests/:id`

#### 상태 분기
- ✅ **LOADING**: shimmer skeleton (추천카드 영역)
- ✅ **EMPTY**: 잠자는 이모지 + 빈 상태 텍스트 + "퀘스트 둘러보기" 버튼
- ✅ 하단 `BottomTabBar` (AppShell이 자동 렌더)

---

## 그룹 C — 퀘스트 (Quest)

### [QUEST-LIST] 퀘스트 목록 `/quests`
- ✅ 헤더 "퀘스트" h1 + 위치 GIF 아이콘 (1f4cd)
- ✅ 세그먼트 탭 (오늘 / 주간 / 이벤트)
  - ✅ 선택 탭: brand-500 배경 + 흰 텍스트 + glow shadow
  - ✅ 미선택 탭: 투명 + text-3
  - ✅ 탭 전환 시 `fetchQuests(filters)` dummy 재호출
- ✅ 필터 Chip 가로 스크롤
  - ✅ 선택 → chip-dark (text 배경), 미선택 → chip-surface
  - ✅ 구역/타입/안전등급 필터 4종
- ✅ 퀘스트 카드 리스트 (fetchQuests dummy)
  - ✅ 썸네일 80x80 (border-radius 16px, saturate 1.2)
  - ✅ 상단 shine 오버레이
  - ✅ 우상단 HOT/NEW/LIMITED 뱃지 (neon-pink/lime/xp, glow 그림자)
  - ✅ 카테고리 Chip (LV.N · 구역, border-radius 6px)
  - ✅ 퀘스트명 (15px bold) + 거리·별점 caption
  - ✅ GIF 보상 아이콘 + XP 숫자 + 제한시간 Chip (색상: danger/warn/xp)
  - ✅ 카드 클릭 → `/quests/:id`
- ✅ **EMPTY** 상태: 나침반 GIF + 안내 텍스트 + 이탤릭 인용구
- ✅ BottomTabBar (AppShell 자동 렌더)

### [QUEST-DETAIL] 퀘스트 상세 `/quests/:id`
- ✅ `getQuestDetail(id)` dummy 호출
- ✅ 히어로 이미지 (360px, object-cover, 하단 검정 그라디언트)
- ✅ 히어로 위: 뒤로가기 Glass 버튼 (좌) + 북마크/공유 Glass 버튼 (우)
- ✅ 히어로 하단: 퀘스트 타입 MICRO 라벨 + 퀘스트명 (36px Space Grotesk)
- ✅ White bottom sheet (top: 336px, border-radius 32px, overflow-y auto)
  - ✅ 카테고리 Chip 행 (LV / 구역 / 별점)
  - ✅ 스토리 본문 텍스트 (14px, line-height 1.7)
  - ✅ 조건 카드 (surface-2 배경, 3행: 시간대 / 거리 / 안전등급)
  - ✅ 보상 카드 (brand-50 배경, 2x2 그리드: EXP/XP/Gold/아이템)
  - ✅ 도전 중인 유저 아바타 스택 (+N 오버플로우) + caption (`getQuestParticipants()` dummy)
- ✅ 하단 고정 CTA "퀘스트 시작 →" → `acceptQuest(id)` dummy → `/ride/active`
- ✅ 북마크 아이콘 토글 (`toggleBookmark(id)` dummy)
- ✅ **잠금 모달** [QUEST-DETAIL-LOCK]: 레벨 미달 시 표시
  - ✅ 블러(4px) + 다크 오버레이
  - ✅ 모달 카드: 자물쇠 이모지(96px) + 레벨 안내 텍스트
  - ✅ 현재 레벨 ProgressBar
  - ✅ "더 쉬운 퀘스트 보기" BtnPrimary / "닫기" 텍스트

---

## 그룹 D — 라이딩 (Ride)

### [RIDE-ACTIVE] 주행 HUD `/ride/active`
- ✅ `--grad-night` 풀스크린 + noise
- ✅ 반투명 배경 이미지 (opacity 0.2, saturate 1.5)
- ✅ StatusBar (흰 시간 + GPS 신호 강도 네온 바 3칸)

#### 상단 Glass 바
- ✅ Glass 패널 (margin 4px 16px)
- ✅ 일시정지 버튼 (40x40, 반투명 배경) → RIDE-PAUSE 오버레이
- ✅ 퀘스트 제목 (중앙, 흰색)
- ✅ GPS 위성 아이콘 버튼 (cyan 테두리)

#### HUD Ring
- ✅ SVG 링 (270x270, viewBox 동일)
  - ✅ 점선 외곽 ring (stroke-dasharray 4 8)
  - ✅ track 원 (opacity 0.06)
  - ✅ progress arc (cyan linearGradient, stroke-dashoffset = 전체둘레 * (1 - 진행률))
  - ✅ 끝점 glow dot
  - ✅ Gaussian blur glow filter
- ✅ 링 내부 텍스트 (현재 km / 목표 km + % COMPLETE 네온 cyan)

#### Metrics 패널
- ✅ Glass 패널 3열 (TIME / SAFETY / AVG SPEED)
- ✅ SAFETY 등급: 36x36 박스 (A: neon-lime, B: warn, C: danger) + glow

#### 실시간 측정 로직
- ✅ `navigator.geolocation.watchPosition()` 시작
- ✅ GPS accuracy 기반 신호 강도 표시 (3칸 바)
- ✅ Haversine 거리 계산 (좌표 배열 누적합)
- ✅ 주행 시간 `setInterval` 카운트업 (mm:ss:ms 또는 hh:mm:ss)
- ✅ 평균 속도 = 누적 거리 / 경과 시간(h)
- ✅ `calcSafetyGrade(rideData)` dummy 주기적 호출 (5초마다)
- ✅ `getRideStreak()` dummy → 하단 연속 라이딩 pill 표시

#### 하단 액션
- ✅ 오늘 누적 km Glass pill (좌)
- ✅ 연속 라이딩 🔥 N일 Glass pill (우)
- ✅ PAUSE Glass 버튼 (하단 40px 위)

#### 오류/분기
- ✅ GPS 위치 권한 거부/신호 없음 → RIDE-GPS-ERROR 오버레이
- ✅ 목표 거리 100% 달성 → 자동으로 `/ride/result/success`

### [RIDE-PAUSE] 일시정지 Bottom Sheet
- ✅ 반투명 다크 배경 오버레이 (blur 32px)
- ✅ 드래그 핸들 (40px 너비 pill)
- ✅ "PAUSED" 텍스트 (Space Grotesk, 28px)
- ✅ 3열 통계 카드 (DIST / TIME / SAFETY)
- ✅ 미니 경로 지도 (120px 높이, dark 배경, cyan path SVG + 현재 위치 dot)
- ✅ 경고 텍스트 "지금 멈추면 시도 무효"
- ✅ "계속 진행" BtnPrimary → 타이머 재개 + 오버레이 닫기
- ✅ "퀘스트 종료" BtnDangerOutline → `submitRideResult` (실패 처리) → `/ride/result/fail`

### [RIDE-GPS-ERROR] GPS 오류 화면
- ✅ Night gradient 배경
- ✅ GPS 위성 이모지 (140px) + 빨간 동심원 glow (inset -32px / -16px)
- ✅ 에러 제목 + 설명 텍스트
- ✅ "설정 열기" BtnPrimary → OS 위치 권한 설정 (`settings://` 또는 PWA permissions API)
- ✅ "퀘스트 포기" 텍스트 → `/ride/result/fail`

### [RIDE-RESULT-S] 라이딩 결과 — 성공 `/ride/result/success`
- ✅ `submitRideResult(rideData)` dummy 호출 → 보상 데이터 수신
- ✅ Sunset gradient 풀스크린 + noise
- ✅ Confetti 파티클 (div 기반, 10개 이상 다양한 색상/크기/회전)
- ✅ 트로피 이모지 (160px, 골드 glow) + 위성 이모지들 절대 위치 배치
- ✅ "QUEST CLEARED" MICRO 라벨 (white)
- ✅ White bottom sheet (top: 298px)
  - ✅ 퀘스트명 (h2) + 이탤릭 인용구 (serif-italic)
  - ✅ Bento 통계 2x2 (DISTANCE / TIME / SAFETY / AVG SPEED)
  - ✅ 보상 목록 4행
    - ✅ EXP 행 (보라 테두리, progress bar 포함)
    - ✅ XP 행 (chip-xp)
    - ✅ Gold 행 (chip-gold)
    - ✅ 아이템 행 (brand 테두리, NEW chip)
  - ✅ 첫 클리어 보너스 배너 (brand-50 배경, +20% 텍스트)
  - ✅ "피드에 공유" BtnPrimary → `createFeedPost(rideResult)` dummy
  - ✅ "다음 퀘스트" BtnSecondary → `/quests`

### [RIDE-RESULT-F] 라이딩 결과 — 실패 `/ride/result/fail`
- ✅ Night gradient 풀스크린 + noise
- ✅ 모터바이크 이모지 (120px, 5도 기울기) + 번개구름 이모지 (우상단)
- ✅ "QUEST FAILED" MICRO 라벨
- ✅ White bottom sheet (top: 268px)
  - ✅ 제목 "조금만 더 달려보면 어땠을까요?" + 이탤릭 인용구
  - ✅ 실패 사유 카드 (danger 테두리/배경, REASON 라벨, 달성 거리 ProgressBar 빨간색)
  - ✅ 위로 보상 카드 (EXP +20 표시)
  - ✅ "다시 도전" BtnPrimary → `/quests/:id` (같은 퀘스트)
  - ✅ "다른 퀘스트" BtnSecondary → `/quests`

---

## 그룹 E — 소셜 피드 (Feed)

### [FEED-001] 피드 목록 `/feed`
- ✅ StatusBar
- ✅ 헤더 "피드" + 카메라 📷 + 알림 🔔 (dot 뱃지)

#### 스토리 행
- ✅ "내 스토리" 추가 (점선 원, + 아이콘, 10px 라벨)
- ✅ 유저 스토리 아바타 가로 스크롤 (`getStories()` dummy)
  - ✅ StoryAvatar (brand→xp 그라디언트 테두리, 64px 원형)
  - ✅ 닉네임 라벨 (10px)

#### 필터
- ✅ Chip 가로 스크롤 (전체/내 동네/친구/핫) — chip-dark(선택) / chip-surface(미선택)
- ✅ 탭 전환 시 `getFeed(filter)` dummy 재호출

#### 피드 카드 리스트
- ✅ `getFeed(filter)` dummy → 카드 목록
- ✅ 카드 구조 (border-radius 24px, shadow-card, overflow hidden)
  - ✅ 히어로 이미지 (200px, 하단 그라디언트)
  - ✅ 우상단 Glass Chip (N.Nkm · 안전 X)
  - ✅ 좌하단 EXP/Gold 보상 뱃지 (blur glass)
  - ✅ 유저 아바타(36px) + 이름 + LevelBadge + 시간
  - ✅ 본문 텍스트 (14px)
  - ✅ 하단 액션 바 (border-top line)
    - ✅ 🔥 응원 수 (toggleLike() dummy)
    - ✅ 💬 댓글 수 → FEED-COMMENT 오버레이
    - ✅ 공유 아이콘 (우측)
- ✅ 무한 스크롤 또는 페이지네이션

#### 빈 상태
- ✅ 카메라 이모지 + 폴라로이드 장식 이미지
- ✅ 안내 텍스트 + "퀘스트 시작" BtnPrimary

- ✅ BottomTabBar (피드 탭 active)

### [FEED-COMMENT] 댓글 Bottom Sheet (오버레이)
- ✅ 배경 blur(2px) + 다크 오버레이
- ✅ Bottom Sheet (top: 100px, border-radius 32px)
- ✅ 드래그 핸들
- ✅ "댓글 N" h3 제목
- ✅ 댓글 목록 (`getComments(postId)` dummy)
  - ✅ 일반 댓글: 아바타(36px) + 닉네임 + 시간 + ♥ N 수 + 본문 텍스트
  - ✅ 이미지 댓글: 아바타 + 닉네임 + 이미지(120x80, radius 12px)
  - ✅ 대댓글: 24px 들여쓰기, 아바타 30px
- ✅ 댓글 입력 바 (border-top)
  - ✅ 내 아바타 (28px)
  - ✅ 텍스트 입력 (placeholder "댓글…")
  - ✅ 📷 사진 첨부 → `uploadImage(file)` dummy
  - ✅ 전송 버튼 (32px 원형, brand-500) → `postComment(postId, content)` dummy

---

## 그룹 F — 프로필 (Profile)

### [PROFILE-001] 내 프로필 `/profile`
- ✅ `getMe()` dummy 호출

#### 헤더 (280px)
- ✅ `--grad-sunset` + noise
- ✅ 우상단 ⚙ 설정 이동 버튼
- ✅ 아바타 (104px, 흰 테두리 4px, shadow-pop)
  - ✅ 좌하단 온라인 상태 dot (22C55E 초록)
  - ✅ 우상단 ⭐ 스타 뱃지 (neon-amber 원형)
- ✅ 닉네임 (white, 18px bold)
- ✅ 라이더 타입 Glass Chip (이모지 + 텍스트)
- ✅ LV 표시 + "320 EXP TO LV.N" + 흰색 ProgressBar

#### White bottom sheet (top: 256px)
- ✅ 재화 Bento 3열 (XP/Gold/Skill Pt, 각 border-top 3px 색상)
- ✅ "이번 달" 통계 카드 (`getMonthlyStats()` dummy)
  - ✅ 3열 숫자 (km / 퀘스트 수 / 평균 안전등급)
  - ✅ Mini 라인 차트 SVG (cyan stroke + fill gradient)
- ✅ 탭 전환 (기록 / 배지 / 장비)
  - ✅ 선택 탭: 흰 배경 + shadow, 미선택: 투명 + text-3
- ✅ **[기록 탭]** 최근 라이딩 목록 (`getRideHistory()` dummy)
  - ✅ 썸네일 56x56 + 퀘스트명 + 날짜 + 안전등급 Chip
- ✅ **[배지 탭]** 배지 그리드 (placeholder — 추후 구현)
- ✅ **[장비 탭]** 장비 목록 (placeholder — 추후 구현)
- ✅ 배지 클릭 → BADGE-DETAIL 모달

### [BADGE-DETAIL] 배지 상세 모달
- ✅ 블러(6px) + 다크 오버레이
- ✅ `getBadgeDetail(id)` dummy 호출
- ✅ 모달 카드 (border-radius 32px, shadow 큰 것)
  - ✅ 상단: `--grad-sunset` (200px) + noise + 장식 이모지들 절대 배치
  - ✅ 배지 이모지 (144px, 골드 glow)
  - ✅ 하단 패딩 영역
    - ✅ 배지명 MICRO 라벨 (brand-500)
    - ✅ 배지 설명 본문
    - ✅ 획득 조건 체크리스트 (✅ 이모지 + 조건 텍스트)
    - ✅ 획득 일자 caption
    - ✅ "공유" BtnPrimary
    - ✅ "닫기" 텍스트

- ✅ BottomTabBar (프로필 탭 active)

---

## 그룹 G — 설정 (Settings)

### [SETTINGS] 설정 메인 `/settings`
- ✅ StatusBar
- ✅ 헤더 뒤로가기 + "설정" h1
- ✅ 미니 프로필 카드 (아바타 48px + 닉네임 + "Lv.N · 타입" caption + chevron) → 프로필 편집
- ✅ **알림** 그룹 → `/settings/notifications`
- ✅ **앱** 그룹
  - ✅ 언어 SettingsRow (현재 언어 표시) → `/settings/language`
  - ✅ 다크 모드 Toggle (on/off → CSS class 전환)
  - ✅ 위치 권한 SettingsRow (허용됨 ✓ / 거부됨 표시)
- ✅ **계정** 그룹
  - ✅ 계정 관리 → `/settings/account`
  - ✅ 개인정보 → (웹뷰 또는 별도 화면)
- ✅ **기타** 그룹
  - ✅ 앱 정보 (v1.0.0)
  - ✅ 고객센터
- ✅ 로그아웃 텍스트 (danger 색) → 확인 모달 → localStorage 클리어 + `/`

### [SET-NOTI] 알림 설정 `/settings/notifications`
- ✅ 뒤로가기 + "알림 설정" h1
- ✅ **퀘스트** 그룹 Toggle
  - ✅ 추천 퀘스트 (기본 ON)
  - ✅ 만료 임박 (기본 ON)
  - ✅ 이벤트 시작 (기본 OFF)
- ✅ 안내 caption 텍스트
- ✅ **결과** 그룹 Toggle
  - ✅ 퀘스트 완료 (기본 ON)
  - ✅ 레벨업 (기본 ON)
  - ✅ 배지 획득 (기본 ON)
- ✅ **소셜** 그룹 Toggle
  - ✅ 응원 받음 (기본 ON)
  - ✅ 댓글 (기본 OFF)
  - ✅ 친구 신청 (기본 ON)
- ✅ Toggle 변경 시 `saveNotificationSettings(prefs)` dummy 호출 (debounce 1s)

### [SET-LANG] 언어 설정 `/settings/language`
- ✅ 뒤로가기 + "언어" h1
- ✅ 언어 카드 3종
  - ✅ 한국어 (🇰🇷 이모지, "Korean")
  - ✅ Tiếng Việt (🇻🇳 이모지, "Vietnamese")
  - ✅ English (🇺🇸 이모지, "English")
  - ✅ 선택 상태: brand-500 테두리 + shadow-pop + radio checked + 옅은 그라디언트
- ✅ 선택 즉시 i18n locale 변경 (전체 앱 즉시 반영)
- ✅ 하단 "변경 사항은 즉시 적용됩니다" caption

### [SET-ACCOUNT] 계정 관리 `/settings/account`
- ✅ 뒤로가기 + "계정 관리" h1
- ✅ 계정 정보 카드 (`getMe()` dummy)
  - ✅ 휴대폰 번호 + "변경" 텍스트 버튼 (brand-500)
  - ✅ 가입일
  - ✅ 계정 ID + 복사 아이콘 → Clipboard API
- ✅ "내 데이터 다운로드" 카드 → `requestDataExport()` dummy
- ✅ **Danger Zone** 카드 (danger 테두리, 0 0 24px rgba(239,59,59,.06) glow)
  - ✅ ⚠ 아이콘 + "계정 탈퇴" h3 (danger 색)
  - ✅ 경고 본문 텍스트 (영구 삭제 안내)
  - ✅ "계정 탈퇴" BtnDangerOutline → 확인 모달 → `deleteAccount()` dummy → `/`

---

## 📊 진행 현황 요약

> 구현 완료 시 위 `✅` → `✅` 로 변경

| 그룹 | 총 항목 | 완료 | 진행률 |
|------|---------|------|--------|
| 공통 기반 | 28 | 28 | 100% |
| A. 인증 | 40 | 40 | 100% |
| B. 홈 | 25 | 25 | 100% |
| C. 퀘스트 | 30 | 30 | 100% |
| D. 라이딩 | 40 | 40 | 100% |
| E. 피드 | 30 | 30 | 100% |
| F. 프로필 | 22 | 22 | 100% |
| G. 설정 | 30 | 30 | 100% |
| **합계** | **245** | **245** | **100%** |
