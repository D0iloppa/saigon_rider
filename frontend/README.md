# 🏍 Saigon Rider — Mobile Web App

호치민 라이더를 위한 위치 기반 라이딩 RPG. React + Vite + TypeScript 프로토타입.

## 🚀 시작하기

```bash
npm install
npm run dev
```

- 개발 서버: `http://localhost:5173`
- **휴대폰에서 보기**: 같은 Wi-Fi 환경에서 `http://[너의 PC IP]:5173` 으로 접속
  (예: `http://192.168.0.10:5173`)

## 📱 주요 흐름 (수동 테스트 시나리오)

1. **`/splash`** — 첫 화면. [시작하기] → 휴대폰 번호 입력
2. **`/auth/phone`** — 8~11자리 숫자 입력 → 인증 코드 받기
3. **`/auth/otp`** — 아무 6자리(`000000` 제외) 입력 → 확인
4. **`/auth/profile-setup`** — 닉네임 + 라이더 스타일 → 시작
5. **`/home`** — 월드맵, 재화 카드, 추천 퀘스트 → 퀘스트 시작
6. **`/quests/:id`** — 퀘스트 상세 → [퀘스트 시작 →]
7. **`/ride/active`** — 라이딩 HUD (1초당 9~12m씩 자동 진행, 안전 등급 변동)
   - **상단의 [✓ 완료 처리]** 버튼: 즉시 완료 (목표 거리 도달 안 했어도 테스트용)
   - 일시정지 → 계속 진행 / 종료
   - GPS 오류 시뮬레이션 버튼도 우상단에 있음
8. **`/ride/result/success`** — 컨페티 + 트로피 + Bento 통계 + 보상 4개
9. **`/ride/result/fail`** — 실패 사유 + 위안 보상
10. **`/feed`** — 피드 + 응원 토글 + 댓글 바텀시트
11. **`/profile`** — 헤더 + 재화 + 미니 차트 + 기록/배지/장비 탭
12. **`/settings`** + 하위 3개 페이지

기본 로그인 상태로 시작하니까 `/home`에서 바로 둘러볼 수 있어요.
온보딩부터 보고 싶으면 브라우저 콘솔에서:
```js
localStorage.clear(); location.href = '/splash';
```

## 🗂 폴더 구조

```
saigon-rider/
├── src/
│   ├── main.tsx, App.tsx
│   ├── styles/
│   │   ├── tokens.css      ← :root CSS 변수 (디자인 시스템)
│   │   └── globals.css
│   ├── api/                ← Mock/Real 스위치 가능한 API 레이어
│   │   ├── client.ts       ← USE_MOCK 토글로 백엔드 전환
│   │   ├── types.ts        ← 모든 DTO
│   │   ├── quests.ts, feed.ts
│   │   └── mock/           ← 더미 핸들러 (현재 비어있음, data/ 사용)
│   ├── data/               ← 더미 데이터 (사이공 실제 지명)
│   │   ├── quests.ts       ← 6개 퀘스트
│   │   └── feed.ts         ← 피드 + 댓글 + 배지
│   ├── store/              ← Zustand 글로벌 스토어
│   │   ├── useUserStore.ts ← 레벨/EXP/XP/골드/스킬 (persist)
│   │   └── useRideStore.ts ← 라이딩 시뮬레이션 (setInterval 기반)
│   ├── lib/                ← 게임 로직
│   │   ├── rewards.ts      ← 기획서 §4.2 보상 공식 그대로
│   │   └── format.ts       ← 거리/시간/상대시간 포맷팅
│   ├── components/
│   │   ├── layout/         ← AppShell / TabBar / TopBar
│   │   └── ui/             ← Button / BottomSheet / Toggle
│   └── pages/              ← 27개 화면 ≒ 라우트
│       ├── auth/   (4)
│       ├── home/   (1)
│       ├── quest/  (2)
│       ├── ride/   (3)
│       ├── feed/   (1)
│       ├── profile/(1)
│       └── settings/(4)
```

## 🎨 디자인 시스템

`src/styles/tokens.css` 의 CSS 변수를 모든 컴포넌트가 공유:

- **Brand**: `--brand-500` (#FF5A1F, Saigon Sunset 메인)
- **Game Currency**: `--xp` (보라), `--exp` (그린), `--gold` (옐로우)
- **Neon (HUD)**: `--neon-cyan`, `--neon-lime`, `--neon-amber`, `--neon-pink`
- **Gradients**: `--grad-sunset`, `--grad-night`

폰트:
- 본문: **Pretendard** (한/영/베트남어 다 처리)
- 숫자/디스플레이: **Space Grotesk** (모든 통계·EXP·거리)
- 감성 카피: **Instrument Serif** *italic* (결과 화면 한 줄)

## 🧠 게임 로직

### 화폐 3종
- `levelExp` — 누적, 소모 불가. 레벨업에만 사용.
- `xpPoints` — 능동 소모. 퀘스트 리롤(20), 부스트(50), 꾸미기.
- `gold` — 일반 재화.

### 보상 공식 (`lib/rewards.ts`)
```
expEarned = quest.rewardExp × (1 + safetyBonus + firstClearBonus)
           ↓ 분배
levelExp += earned × 0.7
xpPoints += earned × 0.3 + safeRiderBonus
goldEarned = quest.rewardGold × (1 + safetyBonus + firstClearBonus + goldSkill)
```

### GPS 시뮬레이션 (`store/useRideStore.ts`)
`startRide()` 호출 시 1초 인터벌 시작.
- 거리: 1초당 +8~12m (≒ 30~43 km/h)
- 안전 등급: 2% 확률로 등급 변동
- `pauseRide()` / `resumeRide()` 로 누적 일시정지 시간 추적

실제 GPS 연동 시: `useRideStore.ts`의 `tick()` 내부를 브라우저 Geolocation API로 교체.

## 🔌 백엔드 연결 (나중에)

`.env` 파일 생성:
```
VITE_USE_MOCK=false
VITE_API_BASE=https://api.saigonrider.app/v1
```

이러면 `src/api/quests.ts`, `feed.ts` 등이 자동으로 `realFetch()` 로 전환됩니다.
DTO는 `src/api/types.ts` 그대로 백엔드 응답과 매칭하면 됨.

## 📋 기획서와 매핑

| 기획서 화면 ID | 라우트 | 파일 |
|---|---|---|
| ONB-001 | `/splash` | `pages/auth/Splash.tsx` |
| AUTH-001 (+E) | `/auth/phone` | `pages/auth/PhoneInput.tsx` |
| AUTH-002 (+E) | `/auth/otp` | `pages/auth/OtpInput.tsx` |
| PROFILE-SETUP | `/auth/profile-setup` | `pages/auth/ProfileSetup.tsx` |
| HOME-001 (+EMPTY/LOADING) | `/home` | `pages/home/WorldMap.tsx` |
| QUEST-LIST (+EMPTY) | `/quests` | `pages/quest/QuestList.tsx` |
| QUEST-DETAIL (+LOCK) | `/quests/:id` | `pages/quest/QuestDetail.tsx` |
| RIDE-ACTIVE / PAUSE / GPS-ERROR | `/ride/active` | `pages/ride/RideActive.tsx` |
| RIDE-RESULT-S | `/ride/result/success` | `pages/ride/RideResultSuccess.tsx` |
| RIDE-RESULT-F | `/ride/result/fail` | `pages/ride/RideResultFail.tsx` |
| FEED-001 (+EMPTY/COMMENT) | `/feed` | `pages/feed/FeedList.tsx` |
| PROFILE-001 / BADGE-DETAIL | `/profile` | `pages/profile/ProfileMain.tsx` |
| SETTINGS / NOTI / LANG / ACCOUNT | `/settings`, `/settings/*` | `pages/settings/*` |

LOADING/EMPTY/PAUSE/GPS-ERROR는 상위 라우트 안의 조건부 렌더링 또는 모달로 처리.

## 🛠 다음 작업 (Claude Code 가이드)

이 프로젝트를 백엔드까지 연결하려면:

1. **백엔드 빌드**: `server/` 디렉터리에 Node.js + Fastify + PostgreSQL.
   기획서 §2 DB 스키마(users, quests, quest_attempts, ride_locations, feed_posts 등)를 마이그레이션.
2. **SMS OTP**: Twilio 또는 AWS SNS 연동 (`auth/otp/send`, `auth/otp/verify`).
3. **JWT 발급**: `src/api/client.ts` 의 `realFetch()` 가 이미 토큰 첨부함.
4. **실제 GPS**: `useRideStore.tick()` 을 `navigator.geolocation.watchPosition()` 으로 교체.
   배경 추적은 PWA 또는 Capacitor로 wrapping 필요.
5. **푸시 알림**: FCM 설정.
6. **사진 업로드**: S3 presigned URL.

각 작업은 독립적이라 Claude Code에 단계별로 맡길 수 있어요.

## 📝 라이선스

이 프로젝트는 사이드 프로젝트 데모입니다. 사진은 Unsplash, 아바타는 Pravatar 사용.
