# 개발서버 → 운영서버 배포 (SOP 수립 + 1차 배포)

> 260604 · 상태: 🔧 진행중 · Plane **SGR-220** (label: infra, priority: High)
> 성격: **일반 태스크이자 배포 SOP(runbook)** — 이 문서는 이후 모든 배포의 **기준 지침**이 된다.
> 결정 요약: ① 별도 운영 호스트 ② **git pull + docker compose build** ③ **nginx 2계층(A안)** + 컨테이너 nginx loopback 바인딩 ④ `/app/SaigonRider` 단일 폴더 격리

---

## 목적 / 범위

개발서버 구성을 운영 호스트로 **재현 가능하게** 배포하기 위한 절차를 수립하고, 그 절차로 **1차 실배포**를 수행한다.

| # | 범위 | 산출물 |
|---|---|---|
| 1 | 배포 SOP / 체크리스트 문서화 | 본 문서 (runbook) |
| 2 | 운영 환경 분리 구성 | `docker-compose.prod.yml`(override) · 운영 `.env` · 호스트 nginx site |
| 3 | SOP에 따른 1차 실배포 + 검증 | 배포 로그 · 검증 체크리스트 통과 |

---

## ADR-001 — nginx 2계층 구조 (결정 기록)

**결정**: 운영 호스트의 시스템 nginx는 **SSL 종단 + 단일 reverse_proxy**만 담당하고, 앱 라우팅 전체(`/api/bff`·`/api/sre`·`/img`·`/admin`·SPA fallback)는 **컨테이너 nginx(:18090)가 그대로** 담당한다 (dev와 동일).

**근거**:
- 컨테이너 nginx의 라우팅 로직은 dev에서 검증된 SoT(`nginx/conf.d/default.conf`). 이를 호스트 nginx로 옮기면 손으로 재구현 → 회귀 위험. 2계층은 라우팅 SoT를 한 곳으로 유지.
- `/app/SaigonRider` 안에 라우팅까지 자급자족 → **격리 목적 부합**. `docker compose up/down`이 호스트 nginx를 안 건드림.
- dev/prod 패리티 → 디버깅 단순.

**기각**: 호스트 nginx 직접 라우팅(B안) — 격리 깨짐 + BFF/Engine 포트 호스트 노출(공격면↑) + 라우팅 재구현 버그.

**성능 트레이드오프**: 추가 홉은 **loopback(127.0.0.1)** → 수십 µs, 무시 수준. 병목은 FastAPI+DB. 2계층의 실제 리스크는 throughput이 아니라 **설정 정합성**(아래 §호스트 nginx 체크리스트).

---

## 타겟 토폴로지

```
[인터넷] →:443→ 호스트 nginx (SSL 종단, 도메인별 site)
                    │  proxy_pass http://127.0.0.1:18090   ← 단 한 줄
                    ▼
   ┌─ /app/SaigonRider (docker compose, dev-net 격리) ────────┐
   │  컨테이너 nginx → 127.0.0.1:18090 바인딩 (외부 직접접근 차단) │
   │     ├ /          → frontend:80   (SPA, 도메인 비종속)        │
   │     ├ /api/bff/  → bff:8080                                  │
   │     ├ /api/sre/  → engine:8090                               │
   │     ├ /admin/    → bff:8080                                  │
   │     └ /img/      → imgproxy:8080                             │
   │  bff · engine · worker · redis · database (포트 미노출)      │
   └──────────────────────────────────────────────────────────────┘
```

---

## 접속 대상 (운영 호스트)

| 항목 | 값 |
|---|---|
| Host | `218.234.18.148` |
| Port | `2202` |
| User | `wellconn` |
| SSH alias | `ssh saigon-prod` (로컬 `~/.ssh/config` 등록 완료) |
| 키 | `~/.ssh/saigon_prod_ed25519` (전용 배포키, git 추적 밖). **개인키 본문은 어떤 문서·repo에도 넣지 않음** |
| 배포 루트 | `/app/SaigonRider` (미생성) |
| OS | **Rocky Linux 9.6** (RHEL계, dnf) |

> 공개키 등록 완료 — `ssh saigon-prod` 키 인증 통과 확인됨(2026-06-04). 키 유출 시 회수 범위는 배포 1건으로 국한.

## 운영 호스트 실측 (2026-06-04 recon)

| 항목 | 상태 | 조치 |
|---|---|---|
| SSH 키 접속 | ✅ 통과 | — |
| OS | Rocky Linux 9.6 | dnf 계열 |
| **Docker** | ✅ **설치 완료** (Engine 29.5.3, Compose v2 플러그인) | `wellconn` docker그룹 → 무sudo 실행 검증됨 |
| sudo (`wellconn`, wheel그룹) | ⚠️ **암호 필요** (NOPASSWD 아님) | 권한 작업은 사용자 입회/암호 필요 |
| 호스트 nginx | ✅ 설치됨 `/usr/sbin/nginx`, **conf.d 형** | 기존 `lsh_api.conf` 가동 중 — **건드리지 말 것** |
| `/app/SaigonRider` | ✅ 생성 (wellconn 소유) | git clone 대상 |

> dnf 설치 시 호스트의 **죽은 `pgdg13` repo(410)**가 길을 막음 → `--disablerepo="pgdg*"`로 우회(서버 repo 설정은 불가침). pgdg13 정리는 본 작업 범위 밖.

### 호스트 기존 스택 / 인증서 (06-04 점검)

- **lsh 스택은 네이티브**(Docker 아님): 80/443 = 호스트 nginx(`user root`), `:8180` = `apache-tomcat-8.5.99`(lsh_api 백엔드). → **Saigon Rider가 유일한 docker 스택**, 컨테이너 충돌 없음.
- **인증서 갱신**: 커스텀 스크립트 아님. 표준 `certbot-renew.timer`(systemd) → `certbot renew`, `authenticator = nginx`(installer=nginx). **webroot 비의존** → root+www를 saigon.conf로 가져가도 certbot이 server_name 매칭으로 챌린지 처리(호환). lsh_api.conf의 acme webroot(`/app/nginx/`)는 구 방식 잔재.
- ✅ **cert 갱신 해소 (06-04)**: letantonsheriff 단독 갱신 → 서빙 cert `Sep 1 2026`로 복구(root+www). 전용 `/usr/local/bin/saigon-cert-renew.sh`(nginx authenticator, 성공 시 reload) + root cron `0 3,15 * * *` 등록 → 이후 자동 갱신. 기존 `certbot-renew.sh`(공유, manual 인증서 묶음)는 미변경.
- 🔴 **(해소된) 원인 기록**:
  - 갱신 주체 = root crontab `0 1 * * * /usr/local/bin/certbot-renew.sh` → `certbot renew --quiet --webroot -w /app/nginx/` → 성공 시 `systemctl reload nginx`(reload는 정상).
  - **5/29부터 매일 실패**: 같은 런에서 `wellconn.co.kr`·`schoolsafe24.tracer.co.kr`가 **`authenticator=manual` + `pref_challs=dns-01`**로 발급돼 webroot(http-01)로 갱신 불가 → `None of the preferred challenges are supported` → **renew 런 전체 실패**, letantonsheriff까지 만료.
  - **letantonsheriff.com 은 `authenticator=nginx`**(pref_challs 없음) → http-01로 단독 갱신 가능. 처리: `sudo certbot renew --cert-name letantonsheriff.com --dry-run` 검증 → 실갱신 → `systemctl reload nginx`. **P4 전 선행**.
  - dns-01 수동 인증서 2종(wellconn/schoolsafe)은 **본 배포 범위 밖**(공유 인프라). 스크립트가 3개를 묶어 돌려 실패하는 구조 — 근본수정은 별도.

> ⚠️ 호스트 nginx에 이미 `lsh_api.conf`(타 서비스)가 있다. 우리 설정은 **별도 파일** `/etc/nginx/conf.d/saigon.conf`로 추가하고, server_name(운영 도메인)으로 분리한다. 기존 conf는 수정·삭제 금지.

## 선결 과제 (배포 전, sudo 필요)

> `wellconn`은 wheel 그룹이나 sudo에 암호가 필요하다 → 아래는 **사용자 입회 또는 암호 제공** 하에 수행 (에이전트 무암호 실행 불가).

- [x] **Docker CE + compose plugin 설치** (Rocky 9, `--disablerepo="pgdg*"` 우회) — Engine 29.5.3 / Compose v2
- [x] **`wellconn` docker 그룹 추가** → 무sudo `docker` 실행 검증됨
- [x] `/app/SaigonRider` 생성 (wellconn 소유)
- [x] git 접근 (read-only **deploy key** `~/.ssh/saigon_deploy_ed25519` + `github-saigon` alias) → `/app/SaigonRider` clone 완료 (HEAD 1ad1a46)
- [ ] 도메인 DNS A레코드 → 운영 호스트 IP
- [ ] SSL 인증서 (certbot 또는 발급분)
- [ ] `NETWORK_BRIDGE` = `saigon-net-prod` (호스트 기존 docker 네트워크 충돌 회피)

---

## dev ↔ prod 구성 차이 (핵심)

> 아래 항목은 dev `docker-compose.yml` / `.env.example`를 그대로 쓰면 **운영에서 문제**가 되는 지점이다. `docker-compose.prod.yml`(override) + 운영 `.env`로 분리한다.

### 1. 포트 노출 정책 (보안 — 최우선)

dev는 nginx·frontend·bff·engine·db 포트를 호스트에 모두 published. **운영은 nginx만, 그것도 loopback에만** 노출한다.

| 서비스 | dev | **prod override** |
|---|---|---|
| nginx | `${NGINX_PORT}:80` (0.0.0.0) | **`127.0.0.1:18090:80`** |
| frontend | `5174:80` | **포트 매핑 제거** (내부 네트워크만) |
| bff | `8082:8080` | **제거** |
| engine | `8090:8090` | **제거** |
| database | `5435:5432` | **제거** (DB 외부 노출 절대 금지) |

→ override에서 해당 서비스의 `ports:`를 빈 배열 또는 loopback 바인딩으로 덮는다.

### 2. profiles — 배포 대상 서비스

dev 기본(profile 없음): nginx·frontend·imgproxy만 기동. 백엔드는 `--profile backend`.

- **운영 기동**: `docker compose --profile backend ...` (bff·engine·worker·redis·database 포함)
- **mcp_dev 제외**: legacy(Plane으로 대체). `backend` 프로필에 묶여 있으므로 override에서 **비활성**(별도 `legacy` 프로필로 분리 또는 prod override에서 미정의). → Phase 2 결정 항목.
- **wiki 제외**: 개발자 문서 포털. 운영 앱 배포 대상 아님 (필요 시 별도 운영).

### 3. 소스 bind-mount — 이미지 권위화

dev는 `./backend:/app`·`./engine:/app`를 bind-mount(핫리로드). **운영은 빌드된 이미지가 권위** → 소스 마운트 제거.

| 마운트 | dev | prod override |
|---|---|---|
| `./backend:/app` · `./engine:/app` | 핫리로드 | **제거** (이미지 코드 사용) |
| `./contents:/data` (bff, imgproxy) | 유지 | **유지** (유저 업로드 영속 — named volume 승격 검토) |
| `saigon_db_data` · `saigon_redis_data` | named volume | **유지** (데이터 영속) |

> ⚠️ `contents/`는 유저 업로드 이미지. 운영 데이터이므로 백업 대상. bind-mount 경로(`/app/SaigonRider/contents`)를 백업 스케줄에 포함하거나 named volume으로 승격.

### 4. 환경변수 — 운영 값 차이

| 키 | dev | **prod** |
|---|---|---|
| `BFF_PUBLIC_URL` | `http://localhost:18090` | **`https://letantonsheriff.com`** |
| `IMGPROXY_BASE_URL` | `http://localhost:18090/img` | **`https://letantonsheriff.com/img`** |
| `VITE_USE_MOCK` | true(dev서버) / Docker빌드는 false | false (현행 유지) |
| `VITE_API_BASE` | — | **불필요** (프론트가 상대경로 `/api/*` 사용, `client.ts:44`) |
| `APP_TIMEZONE` | Asia/Seoul | Asia/Seoul (유지) |
| `SRE_TIMEZONE` | Asia/Ho_Chi_Minh | 유지 (compose 직접 주입) |
| `NETWORK_BRIDGE` | saigon-net | **`saigon-net-prod`** (충돌 회피) |

> 프론트는 same-origin 상대경로 호출이라 **운영 도메인용 프론트 재빌드 불필요**. 도메인이 바뀌어도 호스트 nginx가 same-origin으로 받으므로 자동 동작.

### 5. 시크릿 회전 (필수 — dev placeholder 금지)

운영 `.env`에서 아래는 **반드시 강한 값으로 신규 생성**. `change_me_*`·dev 값 재사용 금지.

| 키 | 생성법 |
|---|---|
| `DB_PASSWORD` | 강한 랜덤 |
| `ENGINE_SERVICE_KEY` | `openssl rand -hex 32` |
| `ENGINE_ADMIN_JWT_SECRET` | `openssl rand -hex 32` |
| `ADMIN_JWT_SECRET` | `openssl rand -hex 32` |
| `ADMIN_PASS_HASH` | passlib bcrypt 해시 |
| `IMGPROXY_KEY` / `IMGPROXY_SALT` | 각 `openssl rand -hex 32` (dev는 insecure 모드 — **운영은 반드시 설정**) |
| `WIKI_AUTH_PASS` | 강한 값 (wiki 운영 시) |

> `.env`와 `.env.example`은 항상 동일 키셋 (agent-guidelines §4). 운영용 키 추가 시 example도 갱신.

**P3 완료 (06-04)**: 서버 `/app/SaigonRider/.env`(600) 작성. 키셋 41개 = `.env.example`과 완전 일치(example 갱신 불필요). **회전**: DB_PASSWORD·ENGINE_SERVICE_KEY·ENGINE_ADMIN_JWT_SECRET·ADMIN_JWT_SECRET·WIKI_AUTH_PASS(서버 openssl 생성). **carry(승인)**: ADMIN_USER·ADMIN_PASS_HASH·OPENWEATHER·GOOGLE. **empty**: IMGPROXY_KEY/SALT(dev 동일 insecure)·RAINVIEWER·PLANE_API_KEY.
- ⚠️ **FCM 푸시 미배선**: `FIREBASE_CREDENTIALS_JSON=/app/firebase-credentials.json`이나 운영은 engine 소스마운트 제거 → 파일이 컨테이너에 없음. 푸시 활성화하려면 서버에 json 배치 + prod override에 해당 파일 단독 마운트 추가. 초기 배포는 푸시 off 허용.
- ⚠️ **imgproxy insecure 유지**(하드닝 TODO): 외부 직접노출 없음(컨테이너 nginx /img 경유만). 추후 KEY/SALT 서명 모드.

### 6. imgproxy 보안 모드

dev는 KEY/SALT 미설정 → `/insecure/` URL 허용. **운영은 KEY/SALT 설정** → 서명 URL 강제. `build_imgproxy_url()`이 KEY/SALT 유무로 분기하는지 1차 배포 시 확인.

---

## 호스트 nginx 설정 + 정합성 체크리스트

**도메인 결정(06-04)**: 전용 도메인 미구매 → **기존 `letantonsheriff.com` + `www` 재사용**(루트+www 둘 다 Saigon Rider). 추후 전용 도메인 구매 시 교체.
- ✅ **DNS·인증서 변경 불필요**: `letantonsheriff.com`·`www`는 이미 이 호스트로 해석되고 기존 Let's Encrypt cert SAN(`/etc/letsencrypt/live/letantonsheriff.com/`)에 포함됨. cert는 **와일드카드 아님**(SAN: admin/console/go/mail/manager/www/root) — 그래서 SAN에 없는 새 서브도메인은 피하고 기존 이름 재사용.
- ⚠️ **기존 `lsh_api.conf` 편집 필요**: 443 블록이 `letantonsheriff.com www`를 한 server_name에 묶어 `/app/lsh_react`를 서빙 중. 같은 server_name 중복은 nginx 충돌 → **기존 블록에서 root+www를 떼어내야** 우리 블록이 받는다.
  - 절차: `sudo cp lsh_api.conf lsh_api.conf.bak_260604` 백업 → 기존 server_name에서 `letantonsheriff.com www.letantonsheriff.com` 제거(port80·443 양쪽) → `saigon.conf` 추가.
  - **불가침**: `manager`·`go`·`admin`·`console`·`/lsh_api`(→127.0.0.1:8180)·`/cdn` 등 나머지 lsh 블록은 일절 손대지 않는다.
  - **acme-challenge 보존**: cert 갱신(HTTP-01)이 root+www도 검증하므로, `saigon.conf` port-80 블록에 `location ^~ /.well-known/acme-challenge/ { root /app/nginx/; }`를 반드시 포함(기존과 동일 경로). 누락 시 인증서 갱신 실패.

`saigon.conf` (개념):

```nginx
server {                                  # HTTP → HTTPS + acme
    listen 80;
    server_name letantonsheriff.com www.letantonsheriff.com;
    location ^~ /.well-known/acme-challenge/ { root /app/nginx/; }   # cert 갱신 보존
    location / { return 301 https://$host$request_uri; }
}
server {
    listen 443 ssl;
    server_name letantonsheriff.com www.letantonsheriff.com;
    ssl_certificate     /etc/letsencrypt/live/letantonsheriff.com/fullchain.pem;   # 기존 cert 재사용
    ssl_certificate_key /etc/letsencrypt/live/letantonsheriff.com/privkey.pem;

    client_max_body_size 0;          # ← 컨테이너 nginx와 일치 (업로드 413 방지)
    location / {
        proxy_pass http://127.0.0.1:18090;
        proxy_set_header Host              $host;
        proxy_set_header X-Real-IP         $remote_addr;
        proxy_set_header X-Forwarded-For   $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;   # ← https 스킴 전달
        proxy_http_version 1.1;
        proxy_set_header Connection "";               # upstream keepalive
        proxy_read_timeout 300s;                      # SSE/스트리밍(가챠·MCP) 대비
    }
}
```

**2계층 정합성 6항목** (어긋나면 성능이 아니라 버그):

- [ ] **X-Forwarded-For / -Proto / Host** 전달 — 앱이 실제 IP·https 스킴 인식
- [ ] **client_max_body_size** 양쪽 동일(0) — 바깥 413 방지
- [ ] **proxy_read_timeout** 정합 (≥ 컨테이너 60s, 스트리밍 300s)
- [ ] **upstream keepalive** (`Connection ""` + http 1.1)
- [ ] **gzip 이중압축 방지** — 한 레이어에서만 압축
- [ ] **proxy_buffering off** — SSE/스트리밍 경로(가챠 시네마틱·MCP)에서 지연 방지

---

## 도메인 마이그레이션 규칙 (임시 letantonsheriff → 전용 도메인)

> **현재 `letantonsheriff.com`+`www`는 임시**(미사용 기존 도메인 차용). 전용 도메인 구매 시 아래 절차로 이전한다. 이 규칙은 host가 참조되는 **모든 지점**을 빠짐없이 바꾸기 위한 체크리스트다.

### host 참조 지점 (전수 — 06-04 조사)

| # | 지점 | 파일/위치 | 도메인 변경 시 |
|---|---|---|---|
| 1 | 웹 프론트 | (없음) — 상대경로 `/api/*` (`frontend/src/api/client.ts:44`) | ❌ **변경 불필요**. Dockerfile은 `VITE_USE_MOCK`만 build-arg, host는 vite로 전이 안 됨. same-origin 자동 |
| 2 | **네이티브 앱** | `frontend/capacitor.config.ts` `server.url` (+ `native/android/app/src/main/assets/capacitor.config.json`, `native/ios/App/capacitor.config.json` — `cap sync`로 생성) | ✅ **`server.url` 변경 → `npx cap sync` → 네이티브 재빌드 → 스토어 재배포**. 현재 `https://saigon.doil.me` 가리킴 |
| 3 | 서버측 BFF | `.env` `BFF_PUBLIC_URL`·`IMGPROXY_BASE_URL` (`backend/app/utils.py` os.getenv) | ✅ `.env` 값 수정 → `bff` 재시작 |
| 4 | 호스트 nginx | `deploy/saigon.conf` `server_name` + cert 경로 | ✅ server_name·cert 경로 교체 → cp → reload |
| 5 | SSL 인증서 | `/etc/letsencrypt/live/<도메인>/` | ✅ 신규 도메인 cert 발급 (certbot) |
| 6 | mock 데이터 | `frontend/src/data/quests.ts:6` (`saigon.doil.me` 하드코딩) | ⚪ mock 폴백 전용, 실데이터 무관 (선택 정리) |
| 7 | OAuth redirect URI | (B-2 OAuth 구현 시) | ✅ 추후 OAuth 추가 시 신규 도메인 등록 |

### 마이그레이션 절차 (신규 전용 도메인 D)

1. DNS A레코드 `D` → 운영 호스트 IP.
2. cert 발급: `certbot certonly --nginx --cert-name <name> -d D -d www.D` (또는 단일).
3. `deploy/saigon.conf`: `server_name` → `D www.D`, `ssl_certificate` 경로 → 신규 cert. commit/push/pull → `sudo cp` → `nginx -t` → reload.
4. `.env`: `BFF_PUBLIC_URL`/`IMGPROXY_BASE_URL` → `https://D`. → `docker compose ... up -d bff`(재시작).
5. **네이티브**: `capacitor.config.ts` `server.url` → `https://D` → `npx cap sync` → iOS/Android 재빌드 → **스토어 재배포**(심사 기간 고려).
6. 갱신 스크립트(`/usr/local/bin/saigon-cert-renew.sh`) `--cert-name` 신규 cert로 교체.
7. (선택) 임시 letantonsheriff cert/conf 정리.

> **웹은 무중단 교체 가능**(상대경로). **네이티브는 server.url이 박혀 스토어 재배포 필요** — 도메인 확정 후 한 번에 가는 게 비용 최소. 전용 도메인은 **네이티브 첫 스토어 등록(B-3) 전에** 확정하는 것이 이상적.

## 배포 절차 (git pull + build)

```bash
# 1. 소스 동기화
cd /app/SaigonRider
git pull origin main

# 2. 운영 env 확인 (.env 운영 값 / 시크릿 회전 완료 상태)
#    .env.example 키셋과 일치하는지 점검

# 3. 빌드 + 기동 (운영 override 적용, backend 프로필)
docker compose -f docker-compose.yml -f docker-compose.prod.yml \
  --env-file .env --profile backend up --build -d

# 4. 헬스체크 통과 대기
docker compose ps          # bff(/api/health), engine(/v1/health) healthy 확인

# 5. 호스트 nginx 리로드 (최초 1회 site 등록 후)
sudo nginx -t && sudo systemctl reload nginx
```

> **무중단 비고**: 1차 배포는 신규 호스트라 다운타임 무관. 이후 재배포는 `up --build -d`가 변경 서비스만 재생성(restart unless-stopped). DB 마이그레이션 동반 시 §데이터 참조.

---

## 데이터 / 마이그레이션 (P5)

- `database/init/*` 는 **빈 볼륨 최초 1회만** 실행 (PostgreSQL initdb 규약). 1차 배포 시 스키마 시드.
- **초기 데이터 = dev DB 이관 (마스터/콘텐츠만)** — 결정됨(2026-06-04). 테스트 유저·피드·RP거래는 제외하고 카탈로그·마스터·설정만 운영으로.
  - 방법: dev에서 **`pg_dump --exclude-table-data=<유저/거래/로그 테이블>`** → 스키마는 전부, 데이터는 마스터/콘텐츠만 덤프 → 운영 DB restore.
  - **제외(데이터 비움)**: `sre_user`·`user_*`·`feed_*`·`post_*`·`dm_*`·`rp_balance`·`rp_transaction`·`rp_expiration_schedule`·`*_log`·`ride_*`·`*_report`·`*_event`·`flood_confirmation`·`notifications`·`notification_settings`·`bookmarks`·`support_*`·`idempotency_key`·`mission_recommendation`·`user_quest_expired`·`__DEV_*`
  - **포함(그대로)**: `contents`·`item_definition`·`item_collection`·`item_effect_value`·`gacha_definition`·`lootbox_definition`·`mission_definition`·`action_definition`·`abuse_rule`·`quests`·`quest_pins`·`sre_quest_card`·`sre_seed_config`·`districts`·`reward_catalog`·`reward_partner`·`reward_policy`·`reward_policy_action`·`tier_definition`·`rider_types`·`season`·`badges`·`safety_grades`·`app_config`·`app_versions`·`nickname_words`·`gas_station`·`repair_shop`·`repair_service_type`·`fuel_price_official`·`daily_featured_item`·`admin_accounts`(운영 root 재설정 검토)
  - ⚠️ **`contents/` 파일 동반 이관 필수** — DB의 `content_id`→`file_path` 참조가 깨지지 않도록 `contents/` 디렉터리를 운영 호스트로 rsync. DB-only 이관 시 이미지 전멸.
  - 정확한 테이블 단위 include/exclude 목록은 **컷오버 시점 스키마 기준으로 최종 확정**(P5 실행). 위는 카테고리 초안.
- 이후(2차+) 스키마 변경 마이그레이션 경로 — dev에서 쓰는 도구/순서를 운영에 동일 적용 (P5에서 확정).
- **타이밍**: 운영 DB 컨테이너 기동(P6 배포) 후 restore. dev가 계속 바뀌므로 **컷오버 직전에 덤프**.

### P5 실행 결과 (06-04) + 🔴 스키마 베이스라인 결함 발견

**중대 발견**: `database/init/*.sql`(001~048)을 **fresh DB에 처음부터 순서대로 돌리면 `014_quest_full_mapping.sql`에서 `column "rider_type_id" does not exist`로 실패** → 후속 스크립트 누락 → prod에 **테이블 25개만** 생성(item_definition 등 누락). init은 dev에 점진 적용된 마이그레이션 모음이라 **클린 from-scratch 빌드가 안 됨**. (bff/engine "healthy"는 `/health`만 봐서 스키마 미검증 — 오탐.) → **SOP 결함: 별도 티켓**(init 베이스라인 정리 또는 alembic upgrade 배포 포함).

**해결(이번 적용)**: init 의존 포기 → **dev 전체 dump → prod DB drop&recreate&restore** 로 스키마+데이터를 dev와 동일 복제.
- dev `pg_dump --no-owner --exclude-table-data=spatial_ref_sys -Fc` (전체) → prod `bff/engine/worker stop → DROP/CREATE DATABASE → pg_restore` (exit 0, 에러 0, 테이블 95개).
- 테스트 유저 정리: FK 동작 분석(24 no-action·20 cascade·5 set-null) 후 **① txn/유저 테이블 TRUNCATE ② `DELETE FROM users/sre_user`(contents·repair_shop owner→NULL 보존) ③ `DELETE contents WHERE owner_type='user'`(16건)**.
- 결과: item 140·quest 243·district 41·contents 49·gas_station 759·repair_shop 215 / users·sre_user·feed·xp = 0.
- `contents/` 이미지: 52개 git 추적분이 clone으로 prod 동기화됨(93M). 이미지 서빙 검증 200(image/png).
- ⚠️ 잔여: contents 1건 파일 누락(`official/grand-opening.jpg`) — 고아 참조, 무해.
- dev DB_USER=`wellconn` ≠ prod=`saigon` → `--no-owner`로 처리.

---

## 검증 체크리스트 (1차 배포 후)

- [ ] `https://<도메인>/` 프론트 로드 (SPA 라우팅)
- [ ] `/api/bff/health` 200, `/api/sre/health` 200
- [ ] 로그인 → 세션 쿠키 (X-Forwarded-Proto=https 정상)
- [ ] 이미지 표출 (`/img/` imgproxy 서명 URL)
- [ ] 파일 업로드 (아바타 등) — 413 없이 성공 (client_max_body_size)
- [ ] `/admin/` 어드민 콘솔 로그인
- [ ] 가챠 등 스트리밍 응답 버퍼링 없이 동작
- [ ] DB/Redis 데이터 영속 (컨테이너 재시작 후 유지)
- [ ] 외부에서 DB(5432)·bff·engine 포트 직접 접근 **불가** 확인 (보안)

---

## 롤백

- 코드: `git checkout <직전태그/커밋>` → `compose ... up --build -d`
- 데이터: 마이그레이션 동반 배포는 사전 DB 덤프 → 실패 시 복원
- 1차 배포 실패 시 컨테이너만 정리(`down`)하고 호스트 nginx site는 유지/비활성

---

## Phase 분해 (→ Plane 서브 Todo, SGR-220 하위)

| Phase | 서브태스크 | 검증 |
|---|---|---|
| **P1** | 본 runbook 문서화 (SOP 확정) | 본 문서 리뷰 통과 |
| **P2** | `docker-compose.prod.yml` override 작성 (포트 비노출·소스마운트 제거·mcp_dev 제외·loopback 바인딩) | `config` 렌더 검증 |
| **P3** | 운영 `.env` 구성 + 시크릿 회전 + `.env.example` 키셋 동기화 | 키셋 일치 확인 |
| **P4** | 호스트 nginx site + SSL + 정합성 6항목 | `nginx -t` + 외부 https 접속 |
| **P5** | 마이그레이션/시드 전략 확정 + 적용 | 스키마·시드 검증 |
| **P6** | 1차 실배포 + 검증 체크리스트 | 위 §검증 전 항목 통과 |

---

## 미결 / 결정 대기

- mcp_dev 운영 제외 방식 (legacy 프로필 분리 vs override 미정의) — P2
- 마이그레이션 적용 도구/순서 (dev 현행 방식 확인 필요) — P5
- 초기 데이터 이관: dev 덤프 이관 vs 클린 시드 — P5
- `contents/` 백업 정책 (bind-mount 백업 vs named volume 승격)
- wiki 운영 호스트 기동 여부
