# 게이트 6 잔여 — 외부에서의 운영 재검증 (2026-08-02)

## 배경

2026-08-02 운영 배포(`ssh saigon-prod`, `/app/SaigonRider`) 완료 후, 지금까지의 검증은 전부 서버 내부 curl(컨테이너 nginx 는 `127.0.0.1:18090` loopback 바인딩)이었다. 게이트 6 을 닫으려면 **외부에서** strict CORS·보안헤더·운영 endpoint 비공개를 확인해야 한다.

원 감사 문서(`260731_prelaunch_go_no_go_audit.md` L177, `260731_remediation_final_report.md` L197, `260801_owner_action_items.md` L97)가 `app.saigon-rider.com` 에서 관측했다고 주장한 3가지:

1. readiness 404
2. 임의 Origin 반사 CORS (credentials 허용 포함)
3. OpenAPI·metrics·개발 테스트 경로 공개

본 문서는 이 개발 머신에서 공개 인터넷 경유로 위 3가지가 **지금도 재현되는지**, 그리고 관련 항목 전반을 측정한 결과다. **읽기/측정 전용** — 서버 상태 변경 명령 없음, `curl` 은 GET/OPTIONS/HEAD 만 사용, 시크릿 값은 기록하지 않았다.

측정 시각: 2026-08-02 09:03 UTC (KST 18:03) 경.

---

## 1. 감사 문서가 주장한 3건 — 지금 재현되는가

| # | 원 주장 | 지금 실측 | 재현 여부 |
|---|---|---|---|
| 1 | readiness 404 | `GET https://app.saigon-rider.com/api/bff/ready` → **200**, `{"status":"ready","checks":{"database":"ready","redis":"ready","schema":"ready","engine":"ready"}}` | **미재현 (해소됨)** |
| 2 | 임의 Origin 반사 CORS (credentials 허용) | `Origin: https://evil.example.com` 으로 preflight(OPTIONS) 시 **400 "Disallowed CORS origin"**, `Access-Control-Allow-Origin` 헤더 자체가 응답에 없음. 실제 GET 요청도 evil Origin 에 대해 `Access-Control-Allow-Origin` 헤더 미부착(200 이지만 CORS 미허용 = 브라우저에서 크로스오리진 읽기 불가). 허용 Origin(`https://app.saigon-rider.com`)으로는 정확히 그 값만 반사(`access-control-allow-origin: https://app.saigon-rider.com`, `access-control-allow-credentials: true`) | **미재현 (해소됨)** |
| 3 | OpenAPI·metrics·개발 테스트 경로 공개 | `/api/bff/openapi.json` → 200 (스키마 전문 노출), `/api/bff/docs` → 200 (Swagger UI), `/api/bff/redoc` → 200. `/metrics` (루트) → 200이지만 **SPA index.html 폴백**(진짜 Prometheus 메트릭 아님, `Content-Type: text/html`). `/api/bff/metrics`, `/api/sre/openapi.json`, `/api/sre/docs`, `/api/sre/metrics` → 전부 404. | **부분 재현 — OpenAPI/docs/redoc 만 남음, metrics 는 애초에 오인/해소** |

**결론**: 3건 중 readiness·CORS 반사 2건은 **해소 확인(PASS)**. OpenAPI 계열(BFF 의 `/docs`, `/redoc`, `/openapi.json`)은 **지금도 공개돼 있다(FAIL)** — 이것이 이번 재검증에서 가장 심각한 잔여 FAIL.

---

## 2. 항목별 상세

### 2.1 readiness

| 검사 | 기대값 | 실측 | 판정 | 재현 명령 |
|---|---|---|---|---|
| `GET /api/bff/ready` | 200 + ready 상태 | `200`, `{"status":"ready","checks":{"database":"ready","redis":"ready","schema":"ready","engine":"ready"}}` | **PASS** | `curl -s -o /tmp/ready.txt -w "HTTP_CODE:%{http_code}\n" https://app.saigon-rider.com/api/bff/ready; cat /tmp/ready.txt` |

### 2.2 CORS

| 검사 | 기대값 | 실측 | 판정 | 재현 명령 |
|---|---|---|---|---|
| Preflight, evil Origin | 임의 Origin 차단(비반사) | `400 Bad Request`, body `Disallowed CORS origin`, `Access-Control-Allow-Origin` 헤더 없음 | **PASS** | `curl -s -i -X OPTIONS https://app.saigon-rider.com/api/bff/ready -H "Origin: https://evil.example.com" -H "Access-Control-Request-Method: GET" -H "Access-Control-Request-Headers: content-type"` |
| 실제 요청, evil Origin | `Access-Control-Allow-Origin` 미부착(브라우저 읽기 차단) | `200` (엔드포인트 자체는 응답하지만) `Access-Control-Allow-Origin` 헤더 없음 → 브라우저에서 크로스오리진 fetch 시 CORS 위반으로 응답 차단됨 | **PASS** | `curl -s -i https://app.saigon-rider.com/api/bff/ready -H "Origin: https://evil.example.com"` |
| 실제 요청, 허용 Origin(`app.saigon-rider.com`) | 정확히 그 값만 반사 | `access-control-allow-origin: https://app.saigon-rider.com`, `access-control-allow-credentials: true` | **PASS** | `curl -s -i https://app.saigon-rider.com/api/bff/ready -H "Origin: https://app.saigon-rider.com"` |

참고: `.env` 의 `CORS_ALLOWED_ORIGINS=https://app.saigon-rider.com,capacitor://localhost,http://localhost` 반영과 일치하는 동작.

### 2.3 보안 헤더

`app.saigon-rider.com` 응답(정상/evil Origin 요청 모두 동일하게 부착돼 있음 확인):

| 헤더 | 값 | 판정 |
|---|---|---|
| Strict-Transport-Security | `max-age=31536000; includeSubDomains` | **PASS** |
| X-Content-Type-Options | `nosniff` | **PASS** |
| X-Frame-Options | `SAMEORIGIN` (+ CSP `frame-ancestors 'self'` 중복 방어) | **PASS** |
| Referrer-Policy | `strict-origin-when-cross-origin` | **PASS** |
| Content-Security-Policy | `default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval' https:; ...; frame-ancestors 'self'; base-uri 'self'; object-src 'none';` 존재 | **PASS** (단, `script-src` 에 `'unsafe-inline' 'unsafe-eval'` 포함 — XSS 방어력은 제한적이나 이번 게이트의 검사 항목인 "유무" 기준으로는 PASS) |

재현: `curl -s -i https://app.saigon-rider.com/api/bff/ready -H "Origin: https://evil.example.com" | grep -iE "strict-transport|x-content-type|x-frame|referrer-policy|content-security-policy"`

### 2.4 운영 endpoint 비공개

| 경로 | 기대값 | 실측 | 판정 | 재현 명령 |
|---|---|---|---|---|
| `/api/bff/openapi.json` | 비공개(404/401) | **200**, 전체 스키마 노출 (`{"openapi":"3.1.0","info":{"title":"Saigon Rider API",...` 로 시작) | **FAIL** | `curl -s -o /dev/null -w "%{http_code}\n" https://app.saigon-rider.com/api/bff/openapi.json` |
| `/api/bff/docs` | 비공개 | **200**, Swagger UI 정상 렌더 | **FAIL** | `curl -s -o /dev/null -w "%{http_code}\n" https://app.saigon-rider.com/api/bff/docs` |
| `/api/bff/redoc` | 비공개 | **200** | **FAIL** | `curl -s -o /dev/null -w "%{http_code}\n" https://app.saigon-rider.com/api/bff/redoc` |
| `/metrics` (루트) | 비공개 또는 무의미 | **200**이나 `Content-Type: text/html`, 내용은 프론트 SPA `index.html` 폴백(진짜 Prometheus 메트릭 아님) | **PASS(사실상)** — 실제 메트릭 미노출, nginx catch-all 이 SPA 로 흡수 | `curl -s -I https://app.saigon-rider.com/metrics` |
| `/api/bff/metrics` | 비공개 | **404** | **PASS** | `curl -s -o /dev/null -w "%{http_code}\n" https://app.saigon-rider.com/api/bff/metrics` |
| `/api/sre/openapi.json` | allowlist 밖 → 비공개 | **404** | **PASS** | `curl -s -o /dev/null -w "%{http_code}\n" https://app.saigon-rider.com/api/sre/openapi.json` |
| `/api/sre/docs` | allowlist 밖 → 비공개 | **404** | **PASS** | `curl -s -o /dev/null -w "%{http_code}\n" https://app.saigon-rider.com/api/sre/docs` |
| `/api/sre/metrics` | allowlist 밖 → 비공개 | **404** | **PASS** | `curl -s -o /dev/null -w "%{http_code}\n" https://app.saigon-rider.com/api/sre/metrics` |
| `/admin/api/users` (무인증) | 401/403 | **401** | **PASS** | `curl -s -o /dev/null -w "%{http_code}\n" https://app.saigon-rider.com/admin/api/users` |

### 2.5 TLS

| 검사 | 기대값 | 실측 | 판정 | 재현 명령 |
|---|---|---|---|---|
| 유효기간 | 만료 전 | `notBefore=Jul 16 05:06:22 2026 GMT`, `notAfter=Oct 14 05:06:21 2026 GMT` (측정일 기준 유효) | **PASS** | `echo \| openssl s_client -connect app.saigon-rider.com:443 -servername app.saigon-rider.com 2>/dev/null \| openssl x509 -noout -dates -subject -ext subjectAltName` |
| SAN | root/www/app/business 전부 포함 | `CN=saigon-rider.com`, SAN: `DNS:app.saigon-rider.com, DNS:business.saigon-rider.com, DNS:saigon-rider.com, DNS:www.saigon-rider.com` | **PASS** | 위 명령과 동일 |

### 2.6 `/admin/` 및 `/admin-legacy/`

| 경로 | 실측 | 판정 | 재현 명령 |
|---|---|---|---|
| `/admin/` | **200** — admin_frontend SPA 진입 (JS 로 로그인 게이트, 무인증 API 는 §2.4 에서 401 확인) | **PASS** (SPA shell 노출은 설계상 정상, 데이터 API 는 인증 요구) | `curl -s -o /dev/null -w "%{http_code}\n" https://app.saigon-rider.com/admin/` |
| `/admin-legacy/` | **307** → `Location: /admin-legacy/login`, 최종 **200** (로그인 페이지) | **PASS** — 무인증 접근이 로그인 페이지로만 귀결, 데이터 미노출 | `curl -s -D - -o /dev/null https://app.saigon-rider.com/admin-legacy/` |

### 2.7 참고 — 다른 도메인

| 도메인 | 확인 | 비고 |
|---|---|---|
| `saigon-rider.com`, `www.saigon-rider.com` | `/` → 200, 랜딩 SPA(정적, `/var/www/saigon-rider`) | 컨테이너 앱과 별개 서버 — 게이트 6 대상 아님. `/api/bff/ready` 를 이 도메인에 쳐도 200 이지만 이는 랜딩 SPA 의 catch-all 폴백(HTML)일 뿐, BFF 응답이 아님(확인: `Content-Type: text/html`, 본문이 랜딩 index.html) — 착오 방지용으로만 기록, PASS/FAIL 대상 아님 |
| `business.saigon-rider.com` | `/` → 200 | 동일 랜딩 SPA, 도메인 분기(client-side) — 게이트 6 대상 아님 |

---

## 3. 요약

| 영역 | 판정 |
|---|---|
| readiness | PASS |
| CORS (임의 Origin 반사) | PASS |
| 보안 헤더 | PASS |
| OpenAPI/docs/redoc 노출 | **FAIL** |
| metrics 노출 | PASS (실제 메트릭 아님, SPA 폴백) |
| sre allowlist 밖 경로 | PASS |
| admin 무인증 API | PASS |
| TLS 유효기간/SAN | PASS |
| `/admin/`, `/admin-legacy/` | PASS |

**가장 심각한 FAIL**: `/api/bff/openapi.json`, `/api/bff/docs`, `/api/bff/redoc` 이 운영에서 인증 없이 공개돼 전체 API 스키마(엔드포인트·파라미터·모델 구조)가 노출된다.

### 무엇을 고쳐야 닫히는지

- **앱 코드(BFF) 쪽**: FastAPI 앱 생성 시 운영 환경에서 `docs_url`/`redoc_url`/`openapi_url` 을 `None` 으로 비활성화(또는 env 플래그로 dev 에서만 노출)해야 한다. nginx 레벨에서 이 3개 경로만 차단하는 것도 가능하지만, 스키마 자체를 앱이 생성하지 않게 하는 편이 더 확실하다.
- 원 감사가 지적한 나머지 2건(readiness 404, CORS 반사)은 이미 해소돼 있어 추가 조치 불필요.
- metrics 는 실측상 문제 없음(SPA 폴백) — 별도 조치 불필요, 다만 명칭상 혼동 방지를 위해 "메트릭 노출 문제 없음"으로 게이트 문서에 명확히 기록 권장.

## 4. 확인불가 항목

없음 — 이번 재검증 범위(§2) 전부 측정 가능했고 결과가 명확했다.
