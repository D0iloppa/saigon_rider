# Saigon Rider

모바일 하이브리드 앱 서비스. React + FastAPI 기반 SPA를 Capacitor로 네이티브 앱으로 감싸는 구조.

---

## 기술 스택

| 레이어 | 기술 |
|---|---|
| 모바일 셸 | Capacitor (iOS / Android) |
| 프론트엔드 | React + Vite + TypeScript |
| 상태관리 | Zustand |
| 라우팅 | React Router DOM |
| 백엔드 | FastAPI (Python 3.12) |
| 데이터베이스 | PostgreSQL 15 + PostGIS |
| 이미지 처리 | imgproxy |
| 리버스 프록시 | Nginx |

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
│       │   ├── auth.ts         # apiRegister / apiLogin fetch 래퍼
│       │   ├── client.ts       # 공통 API 클라이언트 (mock 전환 지원)
│       │   ├── feed.ts
│       │   ├── quests.ts
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
│       │   ├── rewards.ts      # 보상 계산 유틸
│       │   └── session.ts      # 쿠키 세션 관리 (saveSession / loadSession)
│       ├── locales/            # 다국어 번역 (ko / vi / en)
│       ├── pages/
│       │   ├── auth/
│       │   │   ├── AuthForm.module.css
│       │   │   ├── CountryPicker.module.css
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
├── backend/
│   ├── Dockerfile
│   ├── requirements.txt
│   └── app/
│       ├── main.py             # FastAPI 앱 엔트리포인트, CORS
│       ├── database.py         # SQLAlchemy async 엔진 (asyncpg)
│       ├── models.py           # User ORM 모델
│       ├── schemas.py          # Pydantic 요청/응답 스키마
│       └── routers/
│           └── auth.py         # POST /api/auth/register, POST /api/auth/login
├── database/
│   └── init/                   # 컨테이너 최초 기동 시 파일명 순서대로 자동 실행
│       ├── 001_init_schema.sql # 전체 테이블 + ENUM + 인덱스
│       └── 002_add_passcode.sql# users.passcode_hash 컬럼 추가
├── nginx/
│   └── conf.d/
│       └── default.conf        # /api/ → backend, /img/ → imgproxy, / → frontend
├── contents/
│   └── user-contents/          # imgproxy 로컬 파일 루트 (git 추적 제외)
└── shared/                     # 서비스 간 공유 리소스
```

---

## 포트 구성

| 서비스 | 호스트 포트 | 설명 |
|---|---|---|
| Nginx | `18090` | 메인 진입점 (개발 접속 URL) |
| Frontend | `5174` | Vite dev server 직접 접근 (HMR 확인용) |
| Backend | `8082` | FastAPI (uvicorn) |
| Database | `5435` | PostgreSQL (DB 클라이언트 접속용) |

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

### 전체 스택 기동 (backend + database 포함)

```bash
docker compose --profile backend up --build -d
```

### 접속 URL

- **메인** → http://localhost:18090
- **API** → http://localhost:18090/api/health
- **Vite 직접** → http://localhost:5174 (HMR WebSocket 확인용)

### 로그 확인

```bash
docker compose logs -f frontend
docker compose logs -f backend
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
[PhoneInput] → POST /api/auth/register → { passcode, user }
                → 쿠키 저장 { phone, passcode, userId }
                → ProfileSetup → Home

[앱 재기동] → 쿠키에서 { phone, passcode } 읽기
             → POST /api/auth/login → { user }
             → 자동 로그인 → Home
```

### API 엔드포인트

| Method | Path | 설명 |
|---|---|---|
| POST | `/api/auth/register` | 신규 가입 (phone → passcode 발급) |
| POST | `/api/auth/login` | 로그인 (phone + passcode 검증) |
| GET | `/api/auth/me?phone=...` | 현재 유저 조회 |
| GET | `/api/health` | 헬스체크 |

> **보안 참고**: passcode는 현재 쿠키에 평문 저장됩니다.  
> 향후 `src/lib/session.ts` 내부를 HttpOnly cookie + JWT 방식으로 교체 예정.

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

| 변수 | 기본값 | 설명 |
|---|---|---|
| `NETWORK_BRIDGE` | `saigon-net` | Docker 브릿지 네트워크 이름 |
| `NGINX_PORT` | `18090` | Nginx 호스트 포트 |
| `FRONTEND_PORT` | `5174` | Vite dev server 호스트 포트 |
| `BACKEND_PORT` | `8082` | FastAPI 호스트 포트 |
| `DB_PORT` | `5435` | PostgreSQL 호스트 포트 |
| `DB_NAME` | `saigon_rider` | DB 이름 |
| `DB_USER` | `saigon` | DB 유저 |
| `DB_PASSWORD` | - | DB 비밀번호 |
| `IMGPROXY_KEY` | (비움) | imgproxy 서명 키 (비우면 insecure 모드) |
| `IMGPROXY_SALT` | (비움) | imgproxy 서명 솔트 |
