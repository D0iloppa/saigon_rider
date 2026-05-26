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
│       │   ├── follows.ts      # follow / unfollow / fetchFollowers / fetchFollowing
│       │   ├── dm.ts           # DM 대화·메시지 API
│       │   ├── gacha.ts        # 가챠 목록·뽑기·로그 API (Engine)
│       │   ├── shop.ts         # 상점 카탈로그·구매 API (Engine)
│       │   ├── inventory.ts    # 인벤토리·장착 API (Engine)
│       │   ├── wallet.ts       # 통화 잔액·거래내역 API (Engine)
│       │   ├── season.ts       # 시즌패스·레벨·보상 수령 API (Engine)
│       │   ├── master.ts       # 마스터 데이터 (구역·라이더타입·안전등급)
│       │   ├── appVersion.ts   # 앱 버전 조회 API
│       │   └── types.ts        # 도메인 타입 정의
│       ├── components/
│       │   ├── auth/
│       │   │   └── PrivateRoute.tsx
│       │   ├── game/           # 게이미피케이션 컴포넌트
│       │   │   ├── PityBar.tsx         # 천장(pity) 진행 바
│       │   │   ├── ConfettiLayer.tsx   # SVG 축하 파티클 오버레이
│       │   │   ├── RarityChip.tsx      # 등급 배지 (C/R/E/L/M)
│       │   │   ├── CurrencyBadge.tsx   # 통화 배지 (GP/GC/SXP)
│       │   │   ├── GachaCardBack.tsx   # 가챠 카드 뒷면 (flip 애니메이션)
│       │   │   └── GameHubSheet.tsx    # 게임 허브 바텀시트 런처
│       │   ├── layout/
│       │   │   ├── AppShell.tsx
│       │   │   ├── StatusBar.tsx
│       │   │   ├── TabBar.tsx          # FAB → GameHubSheet 런처
│       │   │   └── TopBar.tsx
│       │   └── ui/             # Button, Chip, Toggle, CurrencyHUD, ImageCarousel 등 공통 UI
│       ├── data/
│       │   ├── countryCodes.ts # 65개국 국가코드 + 국기 이모지
│       │   ├── feed.ts         # 더미 피드 데이터
│       │   └── quests.ts       # 더미 퀘스트 데이터
│       ├── hooks/
│       │   ├── useInfiniteScroll.ts  # offset 기반 무한스크롤
│       │   └── usePullToRefresh.ts   # 당겨서 새로고침 (touch 이벤트)
│       ├── lib/
│       │   ├── format.ts       # 숫자/날짜 포맷 유틸
│       │   ├── i18n.ts         # i18next 설정
│       │   ├── native.ts       # NativeInterface — WebView ↔ Native 통신 (send/request/on)
│       │   ├── rewards.ts      # 보상 계산 유틸
│       │   └── session.ts      # 쿠키 세션 관리 (saveSession / loadSession)
│       ├── locales/            # 다국어 번역 (ko / vi / en)
│       ├── pages/
│       │   ├── auth/           # Splash, PhoneInput, OtpInput, ProfileSetup
│       │   ├── home/           # WorldMap
│       │   ├── quest/          # QuestList, QuestDetail
│       │   ├── ride/           # RideActive, RideResultSuccess, RideResultFail
│       │   ├── feed/           # FeedList, FeedCreate, FeedEdit
│       │   ├── dm/             # DmList, DmDetail
│       │   ├── profile/        # ProfileMain, FollowerList, FollowingList, FriendAdd
│       │   ├── gacha/          # GachaMain, GachaPull
│       │   ├── shop/           # ShopCatalog, ItemDetail
│       │   ├── inventory/      # Inventory, EquipPreview
│       │   ├── season/         # SeasonPass
│       │   ├── garage/         # Garage
│       │   ├── link/           # 딥링크 라우터
│       │   └── settings/       # Settings, NotiSettings, LangSettings, AccountSettings, ProfileEdit
│       ├── store/
│       │   ├── useUserStore.ts     # loginFromBackend, refreshUser 액션
│       │   ├── useRideStore.ts
│       │   ├── useConfirmStore.ts  # ConfirmDialog 전역 상태
│       │   ├── useDialogStore.ts   # Dialog 전역 상태
│       │   └── useDmStore.ts       # DM 미읽음 폴링
│       └── styles/
│           ├── globals.css
│           └── tokens.css      # CSS 디자인 토큰
├── backend/                    # BFF (saigon_bff) — 앱 화면 API
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py             # FastAPI 앱 엔트리포인트, CORS, Swagger 설정
│       ├── database.py         # SQLAlchemy async 엔진 (asyncpg)
│       ├── models.py           # User, Content, Badge 등 ORM 모델
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
│           ├── users.py          # GET /api/users/me/stats·badges·quest-history, DELETE /me, search
│           ├── badges.py         # GET /api/badges (목록 + 획득 여부), GET /api/badges/{id}
│           ├── follows.py        # POST/DELETE /api/follows/{user_id} (팔로우/언팔로우)
│           ├── dm.py             # DM 대화 목록·메시지·읽음 처리
│           ├── gacha.py          # 가챠 목록·뽑기·로그·천장·자격 (→ Engine 프록시)
│           ├── shop.py           # 상점 아이템 목록·일일 추천·구매 (→ Engine 프록시)
│           ├── inventory.py      # 인벤토리·장착·해제·컬렉션 진행도 (→ Engine 프록시)
│           ├── wallet.py         # 통화(GP/GC) 잔액 조회
│           ├── season.py         # 시즌패스 현재·레벨·보상 수령 (→ Engine 프록시)
│           ├── master.py         # 마스터 데이터 (구역·라이더타입·안전등급)
│           ├── app_version.py    # 앱 버전 조회·앱 설정
│           ├── dev_context.py    # __DEV Context/Feature/Todo CRUD + 어드민 대시보드
│           └── admin.py          # POST /admin/login (JWT), 대시보드, 배지 CRUD, 설정 등
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
│       │   ├── balance.py      # GET /v1/users/{id}/balance, /transactions, /wallet
│       │   ├── missions.py     # GET /v1/users/{id}/missions
│       │   ├── catalog.py      # GET /v1/catalog
│       │   ├── redemptions.py  # POST /v1/users/{id}/redemptions
│       │   ├── gacha.py        # 가챠 목록·뽑기·천장·자격·로그
│       │   ├── shop.py         # 상점 아이템·일일 추천·구매
│       │   ├── inventory.py    # 인벤토리·장착·해제·컬렉션 진행도
│       │   ├── season.py       # 시즌패스 현재·레벨·보상 수령
│       │   ├── message.py      # SRE 메시지 이벤트 로깅
│       │   └── admin.py        # /v1/admin/* (룰·유저·감사·가챠·아이템·상점·운영 통계)
│       ├── services/           # event_bus, point_ledger, mission, anti_abuse 등
│       ├── adapters/           # PartnerAdapter (internal / stub)
│       └── jobs/               # APScheduler 일배치 4종
├── database/
│   └── init/                   # 컨테이너 최초 기동 시 파일명 순서대로 자동 실행
│       ├── 001_init_schema.sql      # 전체 테이블 + ENUM + 인덱스
│       ├── 002~003                  # passcode, contents, avatar_content_id
│       ├── 004~009                  # comment_likes, app_config, quest 확장, master tables
│       ├── 010~016                  # master data, admin 시드, feed_image_content
│       ├── 017~019                  # profile_mock content type + 시드
│       ├── 020~023                  # feed 위치, user_follows, DM 대화/메시지
│       ├── 024_feed_post_images.sql # 피드 다중 이미지
│       ├── 025~027                  # __DEV context/features/todos + 시드 + status
│       ├── 028_nickname_words.sql   # 기본 닉네임 단어풀
│       ├── 029_app_versions.sql     # 앱 버전 트리
│       ├── 030~031                  # app_config 시드 (추천 퀘스트 수, DM 폴링 주기)
│       └── 032_badge_condition_rule.sql  # 배지 JSONB 조건식 + 다국어 + 아이콘
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
./wikidoc_publish.sh              # ai-docs/TEST → wiki private 동기화 + 무중단 발행
./wikidoc_publish.sh --sync-only  # 파일 복사만 (docker 명령 생략)
./wikidoc_publish.sh --no-build   # 재기동만 (이미지 재빌드 생략)
./wikidoc_publish.sh --help       # 도움말
```

- `ai-docs/TEST/*.md` 를 자동으로 `wiki/wiki-docs/private/test/` 에 동기화 (front-matter·동기화 알림 자동 주입)
- 이후 `saigon_wiki` 컨테이너만 `--no-deps --build` 로 재발행

#### B. Docusaurus 마크다운만 직접 수정한 경우

> `wiki/wiki-docs/*` 를 직접 편집했고 ai-docs/TEST 동기화가 필요 없을 때.

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
| `GET` | `/api/bff/contents/{id}/img` | imgproxy → 302 redirect (w/h 파라미터 지원) |
| `GET` | `/api/bff/contents/mock-img` | mock 풀에서 랜덤 이미지 → 302 redirect |
| `GET` | `/api/bff/contents/profile-mock-img` | seed 기반 결정론적 프로필 기본 이미지 |

#### 프로필 (Profile)

| Method | Path | 설명 |
|---|---|---|
| `PUT` | `/api/bff/profile` | 프로필 저장 (닉네임, rider_type) |
| `POST` | `/api/bff/profile/avatar` | 프로필 사진 업로드 및 변경 |
| `PUT` | `/api/bff/profile/nickname` | 닉네임 변경 (중복 검사 포함) |
| `GET` | `/api/bff/profile/check-nickname` | 닉네임 중복 확인 |
| `GET` | `/api/bff/profile/{user_id}/rp-balance` | RP 잔액·등급 조회 |

#### 유저 (Users)

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/bff/users/me/stats` | 이번 달 통계 (주행 km, 퀘스트 수, 평균 안전등급) |
| `GET` | `/api/bff/users/me/badges` | 내 획득 배지 목록 |
| `GET` | `/api/bff/users/me/quest-history` | 완료 퀘스트 이력 (페이징) |
| `DELETE` | `/api/bff/users/me` | 계정 탈퇴 |
| `POST` | `/api/bff/users/export` | 데이터 내보내기 요청 |
| `GET` | `/api/bff/users/{user_id}/profile` | 타유저 공개 프로필 (팔로우 여부 포함) |
| `GET` | `/api/bff/users/search` | 유저 검색 (닉네임/전화번호) |

#### 배지 (Badges)

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/bff/badges` | 전체 배지 목록 (user_id 옵션 → 획득 여부 포함) |
| `GET` | `/api/bff/badges/{id}` | 배지 상세 조회 |

#### 팔로우 (Follows)

| Method | Path | 설명 |
|---|---|---|
| `POST` | `/api/bff/follows/{user_id}` | 팔로우 (이미 팔로우 시 409) |
| `DELETE` | `/api/bff/follows/{user_id}` | 언팔로우 |

#### DM

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/bff/dm/conversations` | DM 대화 목록 |
| `POST` | `/api/bff/dm/conversations` | 대화 시작 (기존 방 있으면 재사용) |
| `GET` | `/api/bff/dm/conversations/{id}/messages` | 메시지 목록 (page/after 지원) |
| `POST` | `/api/bff/dm/conversations/{id}/messages` | 메시지 전송 |
| `POST` | `/api/bff/dm/conversations/{id}/read` | 읽음 처리 |

#### 가챠 (Gacha) — Engine 프록시

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/bff/gacha/list` | 활성 가챠 목록 |
| `POST` | `/api/bff/gacha/pull` | 가챠 뽑기 (1회/10연) |
| `GET` | `/api/bff/gacha/log` | 뽑기 이력 |
| `GET` | `/api/bff/gacha/pity/{gacha_code}` | 천장 카운트 조회 |
| `GET` | `/api/bff/gacha/eligibility/{gacha_code}` | 응모 자격 확인 |

#### 상점 (Shop) — Engine 프록시

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/bff/shop/items` | 상점 아이템 목록 (필터 지원) |
| `GET` | `/api/bff/shop/daily-featured` | 오늘의 추천 아이템 |
| `POST` | `/api/bff/shop/purchase` | 아이템 구매 |

#### 인벤토리 (Inventory) — Engine 프록시

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/bff/inventory/items` | 보유 아이템 목록 + 통계 |
| `GET` | `/api/bff/inventory/equipment` | 현재 장착 슬롯 조회 |
| `PUT` | `/api/bff/inventory/equip` | 아이템 장착 |
| `DELETE` | `/api/bff/inventory/equip/{slot}` | 장착 해제 |
| `GET` | `/api/bff/inventory/collection-progress` | 컬렉션 진행도 |

#### 지갑 (Wallet)

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/bff/wallet/me` | GP/GC 잔액 조회 |

#### 시즌 (Season) — Engine 프록시

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/bff/season/current` | 현재 활성 시즌 정보 |
| `GET` | `/api/bff/season/pass` | 내 시즌패스 상태 |
| `GET` | `/api/bff/season/levels/{season_code}` | 레벨별 보상 목록 |
| `POST` | `/api/bff/season/claim` | 시즌패스 보상 수령 |

#### 마스터 데이터 (Master)

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/bff/master/districts` | 구역 목록 |
| `GET` | `/api/bff/master/rider-types` | 라이더 타입 목록 |
| `GET` | `/api/bff/master/safety-grades` | 안전등급 목록 |

#### 앱 버전 / 설정

| Method | Path | 설명 |
|---|---|---|
| `GET` | `/api/bff/app-config` | 프론트엔드용 앱 설정값 |
| `GET` | `/api/bff/app-version/current` | 플랫폼별 현재 활성 버전 |
| `GET` | `/api/bff/app-version/releases` | 릴리즈 목록 |

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
| `GET` | `/api/sre/users/{id}/wallet` | GP/GC 잔액 조회 |
| `GET` | `/api/sre/users/{id}/missions` | 미션 진행도 조회 |
| `GET` | `/api/sre/catalog` | 보상 카탈로그 조회 |
| `POST` | `/api/sre/users/{id}/redemptions` | 보상 교환 요청 |
| `GET` | `/api/sre/gacha/list` | 활성 가챠 목록 |
| `POST` | `/api/sre/gacha/pull` | 가챠 뽑기 실행 |
| `GET` | `/api/sre/shop/items` | 상점 아이템 목록 |
| `POST` | `/api/sre/shop/purchase` | 아이템 구매 |
| `GET` | `/api/sre/inventory/{user_uuid}/items` | 보유 아이템 목록 |
| `GET` | `/api/sre/season/current` | 현재 활성 시즌 |
| `POST` | `/api/sre/season/{user_uuid}/claim` | 시즌패스 보상 수령 |

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

> ⚠ **보안 규약 (ai-docs/agent-guidelines.md §7)**
> - `.env` 는 절대 노출 금지 (git/PR/로그/채팅/AI 프롬프트 어디에도).
> - `.env` 와 `.env.example` 은 **항상 동일한 키셋** 을 유지 — 한쪽에 키 추가/삭제 시 반대쪽도 즉시 갱신. 배포본은 `.env.example` 만 함께 나가므로 키 인터페이스 어긋나면 부팅 실패.
> - 보안 정보 하드코딩 금지 — 소스·`docker-compose.yml`·`nginx.conf` 어디에도 평문 금지, **반드시** `${VAR}` 보간 또는 `os.getenv()` / `import.meta.env` 로 `.env` 값 참조.

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