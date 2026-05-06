# Saigon Rider

모바일 하이브리드 앱 서비스. Vue 3 + Spring Boot 기반 SPA를 Capacitor로 네이티브 앱으로 감싸는 구조.

---

## 기술 스택

| 레이어 | 기술 |
|---|---|
| 모바일 셸 | Capacitor (iOS / Android) |
| 프론트엔드 | Vue 3 + Vite + TypeScript |
| 상태관리 | Pinia |
| 라우팅 | Vue Router |
| 백엔드 | Spring Boot |
| 데이터베이스 | PostgreSQL 15 + PostGIS |
| 이미지 처리 | imgproxy |
| 리버스 프록시 | Nginx |

---

## 디렉토리 구조

```
saigon_rider/
├── frontend/               # Vue 3 + Vite 소스코드
│   ├── Dockerfile.dev      # 개발: Vite dev server (HMR)
│   ├── Dockerfile          # 배포: npm run build → nginx 정적서빙
│   └── src/
│       ├── router/
│       ├── stores/         # Pinia
│       ├── views/
│       └── composables/
├── backend/                # Spring Boot 소스코드
├── database/
│   └── init/               # 초기화 SQL (.sql 파일 넣으면 자동 실행)
├── nginx/
│   └── conf.d/
│       └── default.conf    # 라우팅 설정
├── contents/               # imgproxy 콘텐츠 루트
│   └── user-contents/      # 유저 업로드 파일 (git에서 파일 제외, 폴더만 유지)
└── shared/                 # 서비스 간 공유 리소스
```

---

## 포트 구성

| 서비스 | 호스트 포트 | 설명 |
|---|---|---|
| Nginx | `18090` | 메인 진입점 (개발 접속 URL) |
| Frontend | `5174` | Vite dev server 직접 접근 (HMR 확인용) |
| Backend | `8082` | Spring Boot API |
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
# 첫 실행 또는 Dockerfile 변경 후
docker compose up --build -d

# 이후 실행
docker compose up -d
```

### 전체 스택 기동 (backend + database 포함)

```bash
docker compose --profile backend up --build -d
```

### 접속 URL

- **메인** → http://localhost:18090
- **Vite 직접** → http://localhost:5174 (HMR WebSocket 확인용)
- **이미지** → http://localhost:18090/img/insecure/fill/400/300/sm/0/plain/local:///user-contents/{파일명}@webp

### 로그 확인

```bash
docker compose logs -f frontend
docker compose logs -f nginx
docker compose logs -f imgproxy
```

### 중지

```bash
docker compose down

# 볼륨(DB 데이터)까지 삭제
docker compose down -v
```

---

## 배포

### Frontend 프로덕션 빌드

```bash
# 정적 파일 빌드 (dist/ 생성)
docker build -f frontend/Dockerfile -t saigon-frontend:prod ./frontend
```

`frontend/Dockerfile`은 멀티스테이지 빌드로 `npm run build` 결과물을 nginx에서 정적 서빙.

### 전체 스택 프로덕션

```bash
docker compose --profile backend up --build -d
```

---

## imgproxy 사용법

`contents/` 폴더가 imgproxy의 로컬 파일 루트(`/data`)로 마운트됨.

```
# URL 패턴 (개발 - 서명 없음)
/img/insecure/{처리옵션}/plain/local:///{contents 내 경로}@{출력포맷}

# 예시: user-contents/photo.jpg를 400x300으로 리사이즈 후 webp 변환
http://localhost:18090/img/insecure/fill/400/300/sm/0/plain/local:///user-contents/photo.jpg@webp
```

> **주의**: `IMGPROXY_KEY` / `IMGPROXY_SALT` 미설정 시 `/insecure/` 경로만 동작.  
> 운영 환경에서는 반드시 서명된 URL 사용 (`openssl rand -hex 32`로 키 생성 후 .env에 설정).

---

## 환경변수 (.env)

| 변수 | 기본값 | 설명 |
|---|---|---|
| `NETWORK_BRIDGE` | `saigon-net` | Docker 브릿지 네트워크 이름 |
| `NGINX_PORT` | `18090` | Nginx 호스트 포트 |
| `FRONTEND_PORT` | `5174` | Vite dev server 호스트 포트 |
| `BACKEND_PORT` | `8082` | Spring Boot 호스트 포트 |
| `DB_PORT` | `5435` | PostgreSQL 호스트 포트 |
| `DB_NAME` | `saigon_rider` | DB 이름 |
| `DB_USER` | `saigon` | DB 유저 |
| `DB_PASSWORD` | - | DB 비밀번호 |
| `IMGPROXY_KEY` | (비움) | imgproxy 서명 키 (비우면 insecure 모드) |
| `IMGPROXY_SALT` | (비움) | imgproxy 서명 솔트 |
