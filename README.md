# Saigon Rider

> **📖 개발자 위키** → **http://localhost:18090/wiki/**  
> `docker compose --profile wiki up --build -d` 로 wiki 서비스 기동 후 접속  
> Private 문서(`/wiki/docs/private/`) 접근 시 Basic Auth 필요 — `.env`의 `WIKI_AUTH_USER` / `WIKI_AUTH_PASS` 사용

---

모바일 하이브리드 앱 서비스. React + FastAPI 기반 SPA를 Capacitor로 네이티브 앱으로 감싸는 구조.

---

## 기술 스택

| 레이어 | 기술 |
|---|---|
| 모바일 셸 | Capacitor (iOS / Android) |
| 프론트엔드 | React + Vite + TypeScript |
| 상태관리 | Zustand |
| 라우팅 | React Router DOM |
| BFF | FastAPI (Python 3.12) — 앱 화면 API (인증·퀘스트·피드·프로필 등) |
| SRE Engine | FastAPI (Python 3.12) — RP·미션·보상·어뷰징 계산 엔진 |
| 데이터베이스 | PostgreSQL 15 + PostGIS |
| 이미지 처리 | imgproxy |
| 리버스 프록시 | Nginx |

---

## 아키텍처

```
모바일 앱 / 웹 클라이언트
        │ HTTPS
        ▼
┌─────────────────────────────────────────────────────┐
│  Nginx (:18090) — saigon_nginx                      │
│  /api/bff/* → bff:8080/api/*                        │
│  /api/sre/* → engine:8090/v1/*                      │
│  /admin/*   → bff:8080/admin/*                      │
│  /img/*     → imgproxy:8080                         │
└──────────┬──────────────────────┬───────────────────┘
           │                      │
┌──────────▼──────────┐  ┌────────▼────────────────────┐
│  saigon_bff         │  │  saigon_engine              │
│  (FastAPI, :8080)   │  │  (FastAPI, :8090)           │
│  인증·프로필·퀘스트  │──▶  RP·미션·보상·어뷰징·등급  │
│  피드·라이드·유저   │  │  /v1/* 엔드포인트           │
└─────────────────────┘  └─────────────────────────────┘
           │                        │
           └──────────┬─────────────┘
                      ▼
        ┌─────────────────────────────┐
        │  saigon_db                  │
        │  (PostgreSQL 15 + PostGIS)  │
        └─────────────────────────────┘
```

---

## 디렉토리 구조

```
saigon_rider/
├── frontend/
│   ├── Dockerfile              # 배포: npm run build → nginx 정적서빙
│   ├── Dockerfile.dev          # 개발: Vite dev server (HMR)
│   ├── nginx.conf              # 프론트 컨테이너 내부 nginx 설정
│   ├── index.html
│   ├── package.json
│   └── src/
│       ├── App.tsx             # 라우팅 + 세션 bootstrap
│       ├── main.tsx
│       ├── api/
│       │   ├── client.ts       # 단일 API 클라이언트 (service: 'bff'|'sre' 분기)
│       │   ├── auth.ts         # apiRegister / apiLogin (BFF)
│       │   ├── profile.ts      # apiUploadAvatar / apiUpdateNickname (BFF)
│       │   ├── feed.ts         # fetchFeed / toggleCheer (BFF)
│       │   ├── quests.ts       # fetchQuests / fetchQuest (BFF)
│       │   └── types.ts        # 도메인 타입 정의
│       ├── components/
│       │   ├── auth/
│       │   │   └── PrivateRoute.tsx
│       │   ├── layout/
│       │   │   ├── AppShell.tsx
│       │   │   ├── StatusBar.tsx
│       │   │   ├── TabBar.tsx
│       │   │   └── TopBar.tsx
│       │   └── ui/             # Button, Chip, Toggle 등 공통 UI
│       ├── data/
│       │   ├── countryCodes.ts # 65개국 국가코드 + 국기 이모지
│       │   ├── feed.ts         # 더미 피드 데이터
│       │   └── quests.ts       # 더미 퀘스트 데이터
│       ├── lib/
│       │   ├── format.ts       # 숫자/날짜 포맷 유틸
│       │   ├── i18n.ts         # i18next 설정
│       │   ├── native.ts       # NativeInterface — WebView ↔ Native 통신 (send/request/on)
│       │   ├── rewards.ts      # 보상 계산 유틸
│       │   └── session.ts      # 쿠키 세션 관리 (saveSession / loadSession)
│       ├── locales/            # 다국어 번역 (ko / vi / en)
│       ├── pages/
│       │   ├── auth/
│       │   │   ├── OtpInput.tsx
│       │   │   ├── PhoneInput.tsx  # 국가코드 피커 + 회원가입/로그인
│       │   │   ├── ProfileSetup.tsx
│       │   │   └── Splash.tsx
│       │   ├── feed/           # FeedList
│       │   ├── home/           # WorldMap
│       │   ├── link/           # 딥링크 라우터
│       │   ├── profile/        # ProfileMain
│       │   ├── quest/          # QuestList, QuestDetail
│       │   ├── ride/           # RideActive, RideResult
│       │   └── settings/       # Settings, NotiSettings, LangSettings, AccountSettings
│       ├── store/
│       │   ├── useRideStore.ts
│       │   └── useUserStore.ts # loginFromBackend 액션
│       └── styles/
│           ├── globals.css
│           └── tokens.css      # CSS 디자인 토큰
├── backend/                    # BFF (saigon_bff) — 앱 화면 API
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py             # FastAPI 앱 엔트리포인트, CORS, Swagger 설정
│       ├── database.py         # SQLAlchemy async 엔진 (asyncpg)
│       ├── models.py           # User, Content ORM 모델
│       ├── schemas.py          # Pydantic 요청/응답 스키마
│       ├── utils.py            # imgproxy URL 빌더, 기본 아바타 URL
│       ├── engine_client.py    # Engine HTTP 클라이언트 (X-Service-Key 자동 주입)
│       └── routers/
│           ├── auth.py           # POST /api/auth/register, /login, GET /api/auth/me
│           ├── contents.py       # POST /api/contents/upload, GET /api/contents/{id}
│           ├── profile.py        # POST /api/profile/avatar, PUT /api/profile, GET check-nickname
│           ├── quests.py         # GET /api/quests (목록·핀·추천·상세·수락·북마크·참여자)
│           ├── ride.py           # POST /api/ride/submit, GET streak/history, POST safety-grade
│           ├── feed.py           # GET/POST /api/feed, stories, like, comments
│           ├── notifications.py  # GET /api/notifications, GET/PUT /api/notifications/settings
│           ├── users.py          # GET /api/users/me/stats·badges, DELETE /me, POST /export
│           ├── badges.py         # GET /api/badges/{id}
│           └── admin.py          # POST /admin/login (JWT), GET /admin/dashboard, POST /admin/logout
├── engine/                     # SRE Engine (saigon_engine) — RP·미션·보상
│   ├── Dockerfile
│   ├── requirements.txt
│   ├── alembic.ini
│   └── app/
│       ├── main.py             # FastAPI 앱, /v1 prefix
│       ├── config.py           # SreSettings (BaseSettings)
│       ├── database.py         # asyncpg 엔진 (별도 커넥션 풀)
│       ├── models.py           # SQLAlchemy ORM (sre_user, action_event 등)
│       ├── schemas.py          # Pydantic 요청/응답
│       ├── deps.py             # verify_service_key, verify_admin_jwt
│       ├── enums.py            # Python Enum (DB ENUM과 1:1)
│       ├── routers/
│       │   ├── events.py       # POST /v1/events
│       │   ├── balance.py      # GET /v1/users/{id}/balance, /transactions
│       │   ├── missions.py     # GET /v1/users/{id}/missions
│       │   ├── catalog.py      # GET /v1/catalog
│       │   ├── redemptions.py  # POST /v1/users/{id}/redemptions
│       │   └── admin.py        # /v1/admin/...
│       ├── services/           # event_bus, point_ledger, mission, anti_abuse 등
│       ├── adapters/           # PartnerAdapter (internal / stub)
│       └── jobs/               # APScheduler 일배치 4종
├── database/
│   └── init/                   # 컨테이너 최초 기동 시 파일명 순서대로 자동 실행
│       ├── 001_init_schema.sql      # 전체 테이블 + ENUM + 인덱스
│       ├── 002_add_passcode.sql
│       ├── 002_contents_schema.sql  # contents 테이블 + content_owner_type ENUM
│       └── 003_profile_avatar.sql   # users.avatar_content_id 컬럼 추가
├── nginx/
│   └── conf.d/
│       └── default.conf        # /api/bff/* → bff, /api/sre/* → engine, /img/* → imgproxy
├── contents/
│   ├── system/                 # 정적 리소스 (saigon-default.jpg 등, git 추적)
│   └── user-contents/          # 유저 업로드 이미지 (yyyy/mm/uuid.ext, git 추적 제외)
└── wiki/                       # Docusaurus 개발자 문서 포털
```

---

## 포트 구성

| 서비스 | 호스트 포트 | 컨테이너 포트 | 설명 |
|---|---|---|---|
| Nginx | `18090` | `80` | 메인 진입점 (개발 접속 URL) |
| Frontend | `5174` | `80` | 빌드 정적 서빙 (Vite dev: `5174`) |
| BFF | `8082` | `8080` | FastAPI (saigon_bff) |
| Engine | `8091` | `8090` | FastAPI SRE Engine (saigon_engine) |
| Database | `35435` | `5432` | PostgreSQL (DB 클라이언트 접속용) |
| Wiki | `18090/wiki/` | — | Docusaurus (`wiki` 프로파일) |

---

## 개발 환경

### 사전 준비

```bash
cp .env.example .env
# .env 열어서 값 확인 (기본값으로 바로 사용 가능)
```

### 기동 (frontend + nginx + imgproxy)

```bash
docker compose up --build -d
```

### 전체 스택 기동 (bff + engine + database 포함)

```bash
docker compose --profile backend up --build -d
```

### 전체 스택 + 위키

```bash
docker compose --profile backend --profile wiki up --build -d
```

### 서비스별 재빌드

```bash
# 프론트엔드
docker compose --env-file .env up --build -d frontend

# BFF
docker compose --env-file .env --profile backend up --build -d bff

# Engine
docker compose --env-file .env --profile backend up --build -d engine
```

### 위키(Docusaurus) 문서만 재발행 — 무중단

> 다른 서비스(`frontend`/`bff`/`engine`/`database`)는 그대로 둔 채 위키 컨테이너만 재빌드·재기동합니다.

#### A. 권장: 스크립트 사용 (Private 문서 자동 동기화 포함)

```bash
./wikidoc_publish.sh              # docs/TEST → wiki private 동기화 + 무중단 발행
./wikidoc_publish.sh --sync-only  # 파일 복사만 (docker 명령 생략)
./wikidoc_publish.sh --no-build   # 재기동만 (이미지 재빌드 생략)
./wikidoc_publish.sh --help       # 도움말
```

- `docs/TEST/*.md` 를 자동으로 `wiki/wiki-docs/private/test/` 에 동기화 (front-matter·동기화 알림 자동 주입)
- 이후 `saigon_wiki` 컨테이너만 `--no-deps --build` 로 재발행

#### B. Docusaurus 마크다운만 직접 수정한 경우

> `wiki/wiki-docs/*` 를 직접 편집했고 docs/TEST 동기화가 필요 없을 때.

```bash
docker compose --env-file .env --profile wiki up --build -d --no-deps wiki
```

- `--build` : 변경된 `wiki/wiki-docs/*` 를 새 이미지에 포함하기 위해 재빌드
- `--no-deps` : 의존 컨테이너(다른 서비스) 재기동 안 함
- 평균 소요: 30~60초 (npm 캐시 적중 시)
- Private 문서(`/wiki/docs/private/...`) 접근 시 Basic Auth(`WIKI_AUTH_USER` / `WIKI_AUTH_PASS`) 필요

### 접속 URL

- **메인** → http://localhost:18090
- **개발자 위키** → http://localhost:18090/wiki/
- **BFF Health** → http://localhost:18090/api/bff/health
- **BFF Swagger** → http://localhost:18090/api/bff/docs
- **BFF ReDoc** → http://localhost:18090/api/bff/redoc
- **SRE Engine Swagger** → http://localhost:18090/api/sre/docs
- **SRE Engine ReDoc** → http://localhost:18090/api/sre/redoc
- **Admin Console** → http://localhost:18090/admin/login

### 로그 확인

```bash
docker compose logs -f frontend
docker compose logs -f bff
docker compose logs -f engine
docker compose logs -f database
```

### 중지

```bash
docker compose down

# 볼륨(DB 데이터)까지 삭제 (스키마 재적용 필요 시)
docker compose down -v
```

---

## 인증 구조

### 흐름

```
[PhoneInput] → POST /api/bff/auth/register → { passcode, user }
                → 쿠키 저장 { phone, passcode, userId }
                → ProfileSetup → Home

[앱 재기동] → 쿠키에서 { phone, passcode } 읽기
             → POST /api/bff/auth/login → { user }
             → 자동 로그인 → Home
```

### BFF API 엔드포인트 (`/api/bff/`)

전체 명세는 **Swagger UI** (`/api/bff/docs`) 에서 직접 확인 및 실행할 수 있습니다.

#### 인증 (Auth)

| Method | Path | 설명 |
|---|---|---|
| `POST` | `/api/bff/auth/register` | 신규 가입 — phone → passcode 발급 (`is_new=false`면 재발급) |
| `POST` | `/api/bff/auth/login` | 로그인 — phone + passcode 검증 |
| `GET` | `/api/bff/auth/me?phone=` | 유저 조회 |

#### 컨텐츠 (Contents)

| Method | Path | 설명 |
|---|---|---|
| `POST` | `/api/bff/contents/upload` | 이미지 업로드 (multipart) → imgproxy URL 반환 |
| `GET` | `/api/bff/contents/{id}` | 컨텐츠 메타데이터 + imgproxy URL 조회 |

#### 프로필 (Profile)

| Method | Path | 설명 |
|---|---|---|
| `POST` | `/api/bff/profile/avatar` | 프로필 사진 업로드 및 변경 |
| `PUT` | `/api/bff/profile/nickname` | 닉네임 변경 (중복 검사 포함) |

#### 시스템

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/bff/health` | 헬스체크 |

### SRE Engine API 엔드포인트 (`/api/sre/`)

BFF 내부에서 `engine_client`를 통해 호출. 외부에서는 `/api/sre/*` 경로로 접근.

| Method | Path | 설명 |
|---|---|---|
| `POST` | `/api/sre/events` | 액션 이벤트 수신 → RP 계산 파이프라인 실행 |
| `GET` | `/api/sre/users/{id}/balance` | RP 잔액 조회 |
| `GET` | `/api/sre/users/{id}/missions` | 미션 진행도 조회 |
| `GET` | `/api/sre/catalog` | 보상 카탈로그 조회 |
| `POST` | `/api/sre/users/{id}/redemptions` | 보상 교환 요청 |

> **BFF → Engine 연계**: BFF 라우터(`ride.py`, `feed.py` 등)는 `engine_client.post_event()`를 통해 `RIDE_KM`, `QUEST_COMPLETE`, `SHARE_SNS` 등의 액션 이벤트를 Engine으로 발행합니다.

> **보안 참고**: passcode는 현재 쿠키에 평문 저장됩니다.  
> 향후 `src/lib/session.ts` 내부를 HttpOnly cookie + JWT 방식으로 교체 예정.

---

## 프론트엔드 API 클라이언트

`frontend/src/api/client.ts`에서 BFF / SRE Engine을 단일 인터페이스로 호출합니다.

```typescript
import { api } from './client';
import type { Service } from './client';

// BFF 호출 (service 생략 시 기본값 'bff')
api.realFetch<Quest[]>('/quests');

// SRE Engine 명시적 지정
api.realFetch<BalanceDto>(`/users/${userId}/balance`, {}, 'sre');

// FormData 업로드 (BFF)
api.realFetchForm<AvatarResult>('/profile/avatar', formData);
```

| service | 요청 경로 | Nginx 라우팅 |
|---|---|---|
| `'bff'` (기본값) | `/api/bff/{endpoint}` | → `bff:8080/api/{endpoint}` |
| `'sre'` | `/api/sre/{endpoint}` | → `engine:8090/v1/{endpoint}` |

---

## NativeInterface (WebView ↔ Native 브릿지)

`frontend/src/lib/native.ts`에서 Android / iOS 네이티브 레이어와의 통신을 단일 인터페이스로 추상화합니다.

### 플랫폼별 발신 방식 (내부 자동 처리)

| 플랫폼 | 내부 호출 |
|--------|-----------|
| Android | `window.native.postMessage(jsonString)` |
| iOS | `window.webkit.messageHandlers.native.postMessage(jsonString)` |
| Browser(dev) | 콘솔 경고 + 100ms 후 자동 null resolve |

### 네이티브 → 웹 수신 진입점

네이티브 측에서 `window.nativeInterface.onMessage(jsonString)` 을 호출합니다.  
웹 초기화 시 자동으로 `window.nativeInterface` 가 등록됩니다.

### 사용법

```typescript
import { nativeInterface, NATIVE_KEYS } from '@/lib/native';

// 단방향 전송 (응답 불필요)
nativeInterface.send(NATIVE_KEYS.HAPTIC, { style: 'light' });

// 응답 기대 (Promise, 기본 타임아웃 10초)
const loc = await nativeInterface.request<{ lat: number; lng: number }>(NATIVE_KEYS.GET_LOCATION);

// Push 이벤트 구독 (네이티브 → 웹 단방향 스트림)
const unsub = nativeInterface.on<{ lat: number; lng: number }>(NATIVE_KEYS.LOCATION_UPDATE, (d) => {
  console.log(d.lat, d.lng);
});
unsub(); // 컴포넌트 unmount 시 해제
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

## imgproxy 사용법

```
# URL 패턴 (개발 - 서명 없음)
/img/insecure/{처리옵션}/plain/local:///{contents 내 경로}@{출력포맷}

# 예시
http://localhost:18090/img/insecure/fill/400/300/sm/0/plain/local:///user-contents/photo.jpg@webp
```

---

## 환경변수 (.env)

### 인프라

| 변수 | 기본값 | 설명 |
|---|---|---|
| `NETWORK_BRIDGE` | `saigon-net` | Docker 브릿지 네트워크 이름 |
| `NGINX_PORT` | `18090` | Nginx 호스트 포트 |
| `FRONTEND_PORT` | `5174` | 프론트엔드 호스트 포트 |
| `BACKEND_PORT` | `8082` | BFF 호스트 포트 |
| `ENGINE_PORT` | `8090` | SRE Engine 호스트 포트 |
| `DB_PORT` | `5435` | PostgreSQL 호스트 포트 |
| `DB_NAME` | `saigon_rider` | DB 이름 |
| `DB_USER` | `saigon` | DB 유저 |
| `DB_PASSWORD` | - | DB 비밀번호 |

### 이미지 처리

| 변수 | 기본값 | 설명 |
|---|---|---|
| `IMGPROXY_KEY` | (비움) | imgproxy 서명 키 (비우면 insecure 모드) |
| `IMGPROXY_SALT` | (비움) | imgproxy 서명 솔트 |
| `IMGPROXY_BASE_URL` | `http://localhost:18090/img` | 클라이언트에 반환할 imgproxy 공개 URL |
| `CONTENTS_BASE_PATH` | `/data` | 컨테이너 내 컨텐츠 볼륨 경로 |

### SRE Engine

| 변수 | 기본값 | 설명 |
|---|---|---|
| `ENGINE_SERVICE_KEY` | - | BFF → Engine 서비스 인증 키 (32바이트 랜덤 hex) |
| `ENGINE_ADMIN_JWT_SECRET` | - | Engine 관리자 JWT 서명 키 |
| `SRE_TIMEZONE` | `Asia/Ho_Chi_Minh` | RP 만료·배치 기준 타임존 |
| `SRE_RP_EXPIRY_MONTHS` | `3` | RP 유효기간 (월) |
| `SRE_DAILY_CAP_STANDARD` | `250` | 일반 유저 일일 RP 상한 |
| `SRE_DAILY_CAP_DRIVER` | `2000` | 드라이버 유저 일일 RP 상한 |
| `SRE_NEW_ACCOUNT_PENALTY_DAYS` | `3` | 신규 계정 패널티 기간 |
| `SRE_NEW_ACCOUNT_MULTIPLIER` | `0.5` | 신규 계정 RP 배율 |
| `SRE_IDEMPOTENCY_TTL_DAYS` | `7` | 멱등성 키 TTL |
| `SRE_LOG_LEVEL` | `INFO` | Engine 로그 레벨 |
