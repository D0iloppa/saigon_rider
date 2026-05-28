# Saigon Rider — 클라이언트 빌드 결정서 v1.0

> 발행일: 2026-05-18
> 목적: 디자인 시안(v2+v3) → 진짜 작동 앱으로 전환하기 위한 5가지 핵심 결정
> 형식: 추천안 + 근거 + 대안 비교. 동의/변경 후 C/B/A 단계로 진행

---

## 결정 1. 플랫폼 — **모바일 우선 + 웹 보조**

### 추천: 모바일 (iOS + Android) 메인, 웹 보조

| 영역 | 모바일 필수성 | 비고 |
|---|---|---|
| GPS 라이딩 트래킹 | 🔴 필수 | 백그라운드 위치, 라이딩 중 화면 켜둠 |
| 카메라 (피드 인증) | 🔴 필수 | 라이딩 결과 사진 |
| 푸시 알림 | 🔴 필수 | 미션 만료, 가챠 보너스, 친구 알림 |
| 가챠 / 상점 | 🟡 선택 | 모바일이 자연스럽지만 웹도 가능 |
| 피드 / 프로필 | 🟢 보조 | 웹에서도 OK |
| 운영자 대시보드 | 🟢 웹 전용 | 시즌·아이템·미션 관리 |

### 근거
- 라이딩 자체가 모바일 행위 (헬멧 안에 PC 들고 다닐 수 없음)
- 호치민 사용자 90%+ 모바일 우선 (스마트폰 보급률 vs PC)
- 디자인 시안이 393×852 모바일 프레임 기준 = 곧장 모바일로 옮기기 쉬움

### 대안
- 웹 우선 PWA: GPS 백그라운드 트래킹 / 푸시 알림이 iOS Safari에서 제약. ❌
- 네이티브 앱 따로 (Swift + Kotlin): 개발 비용 2배. ❌

---

## 결정 2. 프레임워크 — **Expo (React Native) + 웹은 Expo Router의 web target**

### 추천: Expo SDK 50+ / React Native 0.75+ / NativeWind (Tailwind for RN)

```
모노레포 구조:
saigon-rider/
├── apps/
│   ├── mobile/        # Expo (iOS + Android)
│   ├── web/           # Expo Router web (또는 Next.js 별도)
│   └── admin/         # 운영자 대시보드 (Next.js)
├── packages/
│   ├── ui/            # 공유 컴포넌트 (RN + Web 호환)
│   ├── tokens/        # 디자인 토큰 (CSS vars + TS)
│   ├── api/           # API 클라이언트 (Supabase + tRPC)
│   └── types/         # 공유 타입
└── ...
```

### 근거
- **HTML → JSX 변환 쉬움**: screens_v3_rpg.html의 div + style을 NativeWind className으로 변환하면 80% 그대로 옮겨짐
- **디자인 토큰 그대로 사용**: CSS variables → Tailwind config → NativeWind
- **OTA 업데이트**: Expo Updates로 앱스토어 심사 없이 핫픽스 (가챠 확률 조정 등)
- **베트남 인터넷 환경 친화적**: Hermes 엔진 + 작은 번들 크기
- **단일 코드베이스로 iOS + Android + Web 동시 커버**: TypeScript 풀스택

### 대안 비교
| 옵션 | 장점 | 단점 |
|---|---|---|
| **Expo + RN** ⭐ | HTML→JSX 쉬움, OTA, 단일 코드 | RN 빌드 학습곡선 |
| Flutter | 성능 좋음, 한 코드로 다 | Dart 학습, HTML 시안 못 살림 |
| iOS Swift + Android Kotlin | 최고 성능 | 개발팀 2배, 디자인 시안 2번 옮김 |
| Next.js PWA | 웹 친화적 | iOS Safari 푸시·GPS 제약 |

### 핵심 라이브러리 (의존성)
```json
{
  "expo": "^50.0.0",
  "react-native": "0.75.x",
  "expo-router": "^3.x",          // 파일 기반 라우팅
  "nativewind": "^4.x",           // Tailwind for RN
  "@supabase/supabase-js": "^2.x",// Auth + DB + Realtime
  "expo-location": "~17.x",       // GPS 트래킹
  "expo-task-manager": "~12.x",   // 백그라운드 라이딩
  "expo-notifications": "~0.28.x",// 푸시
  "expo-camera": "~15.x",
  "react-native-mmkv": "^2.x",    // 빠른 로컬 저장
  "@tanstack/react-query": "^5.x",// 서버 상태
  "zustand": "^4.x",              // 클라이언트 상태
  "react-native-reanimated": "~3.x", // 가챠 연출 애니메이션
  "lottie-react-native": "^7.x",  // 트로피/컨페티
  "sentry-expo": "^7.x"           // 에러 추적
}
```

---

## 결정 3. API 계약 — **Supabase + PostgREST + 보조 API**

### 추천: Supabase 풀스택 + 라이딩/이미지/푸시는 별도 Hono API

```
┌────────────────────────────────────────────────┐
│  Expo App (React Native + Web)                 │
└──────────┬─────────────────────────────────────┘
           │
   ┌───────┴───────┐
   ▼               ▼
┌─────────────┐  ┌──────────────────┐
│  Supabase   │  │  Hono API        │
│             │  │  (사이드카)      │
│ • Auth      │  │                  │
│   (Phone    │  │ • 라이딩 GPS     │
│    OTP)     │  │   스트림 처리    │
│ • Postgres  │  │ • 이미지 처리    │
│   (SRE)     │  │   (CDN)          │
│ • RPC       │  │ • 푸시 알림      │
│   (16개     │  │   (FCM/APNs)     │
│    함수)    │  │ • 외부 IAP       │
│ • Realtime  │  │   영수증 검증    │
│   (피드)    │  │                  │
│ • Storage   │  └────────┬─────────┘
│   (이미지)  │           │
└──────┬──────┘           │
       │                  ▼
       └─────────►  PostgreSQL (SRE)
```

### 근거
- **PostgREST = SRE 함수 16개 자동 노출**
  ```
  PL/pgSQL                          PostgREST RPC
  ────────────────────────────────────────────────────────
  dispatch_mission_reward(progress_id)
    → POST /rest/v1/rpc/dispatch_mission_reward
       body: { "progress_id": 9001 }

  pull_gacha(user_id, gacha_code, do_10_pull)
    → POST /rest/v1/rpc/pull_gacha
       body: { "p_user_id": 1001, "p_gacha_code": "PREMIUM_PULL",
               "p_do_10_pull": true }

  purchase_shop_item(user_id, item_code, currency)
    → POST /rest/v1/rpc/purchase_shop_item
  ```
  16개 함수 매핑 작업 = 0줄 코드. 자동.

- **Supabase Auth = 베트남 Phone OTP 즉시 지원**
  - Twilio 또는 자체 SMS 게이트웨이 연결
  - JWT 자동 발급 → RLS(Row Level Security)로 권한 처리
  - `auth.uid()` = `sre_user.external_user_uuid`로 매핑

- **RLS로 권한 안전 처리**
  ```sql
  -- 예: user_item은 본인만 조회/수정
  CREATE POLICY "user_item_own" ON user_item
    FOR ALL USING (
      user_id = (SELECT user_id FROM sre_user
                 WHERE external_user_uuid = auth.uid())
    );
  ```

### 왜 Hono를 따로?
PostgREST가 못 하는 일이 4개:
1. **라이딩 GPS 스트림**: 매초 좌표 받아서 거리/속도 계산 → 끝나면 SRE에 한 번 기록
2. **이미지 업로드/리사이즈**: Supabase Storage + Sharp 처리
3. **푸시 알림 발송**: FCM/APNs SDK
4. **IAP 영수증 검증**: Apple/Google 서버 통신 후 GC 적립

Hono = 가볍고 빠른 TS 프레임워크. Cloudflare Workers 또는 Fly.io로 배포.

### 인증 흐름 (Supabase Auth + SRE 매핑)
```
1. 사용자가 +84 901 234 567 입력
2. supabase.auth.signInWithOtp({ phone })
3. SMS 코드 받아서 supabase.auth.verifyOtp({ phone, token })
4. auth.users 테이블에 row 생성 (auth.uid = UUID)
5. 트리거로 sre_user에 row 자동 생성:
   INSERT INTO sre_user (external_user_uuid, ...)
   VALUES (NEW.id, ...);
   INSERT INTO rp_balance (user_id, ...) VALUES (...);
6. 클라이언트는 JWT로 모든 API 호출
```

### 대안
- 자체 백엔드 (Express + Passport): 모든 걸 직접 구현. 1-2달 소요. ❌
- Firebase: NoSQL → SRE PostgreSQL 모델과 안 맞음. ❌
- AWS Amplify: 학습곡선 큼, 비용 높음. ❌

---

## 결정 4. MVP 범위 — **핵심 루프 12화면 (3-4주)**

### 추천 MVP: 라이딩 → 보상 → 가챠/상점 슬라이스만

```
인증 (3)      → SPLASH → AUTH-001 → AUTH-002 → PROFILE-SETUP
홈 (1)        → HOME-001
퀘스트 (2)    → QUEST-LIST → QUEST-DETAIL
라이딩 (3)    → RIDE-ACTIVE → RIDE-RESULT-S (또는 -F)
경제 (4)      → SHOP-001 → GACHA-HUB → GACHA-PULL-RESULT → INVENTORY-001

총 12-13화면
```

### MVP에서 제외 (Phase 2 이후)
- 피드 (FEED-001, FEED-COMMENT) — 소셜 기능, 콜드 스타트 문제
- 게러지/아바타 (GARAGE-001, AVATAR-001) — 장착 시스템, 우선순위 낮음
- 시즌패스 (SEASON-PASS) — 첫 시즌까지 시간 있음
- 배지/프로필 상세 (BADGE-DETAIL, PROFILE-001) — 부가
- 모든 설정 화면 (SETTINGS, SET-NOTI 등) — 기본만
- 모든 EMPTY/ERROR 상태 — 최소 fallback만

### 핵심 루프 검증 목표
"신규 가입 → 첫 퀘스트 클리어 → 첫 가챠 → 인벤토리 확인" 1세션 완료가 5분 안에 가능한가?
이게 되면 게임이 작동하는 거. 안 되면 다시.

### 시간 예측
| Phase | 작업 | 기간 |
|---|---|---|
| Phase 0 | 모노레포 + 토큰 + 컴포넌트 12개 | 2-3일 |
| Phase 1 | 인증 + 홈 + 라이딩 (가짜 GPS) | 1주 |
| Phase 2 | 가챠 + 상점 + 인벤토리 | 1주 |
| Phase 3 | 진짜 GPS + 푸시 + 폴리시 | 1주 |
| **MVP** | **12화면 + 핵심 루프** | **3-4주** |
| Phase 4+ | 피드, 시즌패스, 게러지 | +4-6주 |

---

## 결정 5. 인프라 — **Supabase Cloud + Expo EAS + Cloudflare**

### 추천 스택

| 영역 | 선택 | 비용 (초기) |
|---|---|---|
| 데이터베이스 | Supabase Pro (PG 15) | $25/월 |
| 인증 | Supabase Auth (포함) | 포함 (50k MAU까지) |
| Storage | Supabase Storage | 포함 (100GB까지) |
| 보조 API | Cloudflare Workers (Hono) | $5/월 (10M req) |
| 이미지 CDN | Cloudflare R2 + Images | $5/월 |
| 모바일 빌드 | Expo EAS Build | $99/월 (Production) |
| 푸시 | Expo Push (무료) → Firebase 후속 | $0 (초기) |
| 에러 추적 | Sentry | $0 (5k events) |
| 분석 | PostHog (self-hosted) 또는 Mixpanel | $0 (초기) |
| 도메인 | saigonrider.app | $20/년 |
| **합계 (월)** | | **~$140** |

### 환경 구성
```
┌──────────────────────────────────────────────────┐
│ 환경 (3개)                                       │
├──────────────────────────────────────────────────┤
│ 1. local    : 개발자 PC, Supabase CLI, Expo Dev  │
│ 2. staging  : Supabase staging 프로젝트          │
│              + Expo Preview Build                │
│              + saigon-rider-stage.app            │
│ 3. production: Supabase prod 프로젝트            │
│              + Expo Production Build             │
│              + 호치민 베트남 리전 사용          │
└──────────────────────────────────────────────────┘
```

### CI/CD
- GitHub Actions (PR마다 자동 lint + type-check + test)
- 메인 머지 시 staging 자동 배포
- 태그 v1.x.x 푸시 시 production 자동 배포
- EAS Submit으로 TestFlight + Play Store internal 자동

### 모니터링
- Supabase 대시보드: PG 슬로우 쿼리, RLS 위반
- Sentry: 앱 크래시, JS 에러
- Expo Insights: OTA 업데이트 채택률, 크래시
- 자체 대시보드: GP/GC 일일 발행/소모, 가챠 ROI, 천장 발동 (SRE 가이드 §7)

### 백업
- Supabase 자동 백업 (일일, 7일 보관, Pro 플랜)
- 추가: 매일 새벽 외부 S3 백업 (운영 후 추가)

---

## 결정 요약 표

| # | 결정 | 추천안 | 핵심 근거 |
|---|---|---|---|
| 1 | 플랫폼 | 모바일 우선 + 웹 보조 | 라이딩 = 모바일 본질적 행위 |
| 2 | 프레임워크 | Expo + RN + NativeWind | HTML 시안 80% 그대로 옮기기 가능 |
| 3 | API | Supabase + PostgREST + Hono | 16개 SRE 함수 자동 노출 |
| 4 | MVP 범위 | 핵심 루프 12화면 | 3-4주, 가챠까지 클릭 가능 |
| 5 | 인프라 | Supabase + EAS + Cloudflare | 월 ~$140, 50k MAU까지 커버 |

---

## 변경하고 싶은 결정이 있다면

- "1번을 웹 우선으로 가고 싶다" → Next.js로 전환, MVP 범위 재조정
- "2번을 Flutter로" → C/B/A 다시 작성 (Dart 코드)
- "3번에서 Supabase 말고 자체 백엔드" → API 작성 비용 3-4주 추가
- "4번에서 피드까지 MVP에 넣고 싶다" → 6-8주로 확장
- "5번 비용을 더 줄이고 싶다" → Supabase Free + Cloudflare Free (개발만)

다음 단계 (C, B, A)는 이 5가지 결정을 전제로 작성됩니다.

---

(끝)
