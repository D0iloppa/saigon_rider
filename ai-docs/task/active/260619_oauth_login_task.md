# OAuth 로그인 전환 기획 (Google / Apple / Facebook)

> **상태**: 기획 완료 · 구현 미착수 (다음 스레드 착수 기준 문서)
> **작성**: 2026-06-19
> **연관**: TODO B-2 (회원가입 OAuth 연동), `ai-docs/schema/auth.md`(현행 phone 인증)
> **목적**: 전화번호 가입을 폐기하고 **OAuth 계정으로만 가입·로그인**하도록 전환한다. 내부 user UUID는 가입 시 계속 발급하되, 로그인은 OAuth 연동으로 사용자를 식별한다.

---

## 0. 한눈에 보는 결론 (TL;DR)

- **인증 방식**: 네이티브/웹 SDK가 provider에서 **ID 토큰(또는 access token)**을 받아 BFF로 전달 → **BFF가 토큰을 검증**하고 내부 세션을 발급하는 "토큰 검증(verify-on-server)" 패턴. 서버사이드 OAuth 리다이렉트 콜백을 BFF에 두지 않는다 (모바일 앱 환경에 부적합).
- **identity 모델**: `(provider, provider_user_id)` → 내부 `users.id` 매핑 테이블 신설. 한 유저가 여러 provider 연결 가능(P1 계정 연동). P0는 provider별 find-or-create.
- **세션 규약**: 기존 passcode 메커니즘(서버생성 secret + pbkdf2 해시)을 **그대로 재사용**해 `{userId, sessionToken}` 쌍으로 전환. JWT는 P1 옵션 (§4-B).
- **API 키 배치**: **모든 OAuth 키(공개 client_id + Facebook app_secret + Apple .p8 포함)를 `app_config(group_name='oauth')`에 단일화**한다. git-tracked seed SQL에는 **`CHANGE_ME` placeholder만** 넣고, 실제 값은 사용자가 런타임에 `UPDATE`/admin으로 주입한다 → git 누출 없음(§6).
- **마이그레이션**: `users.phone` NOT NULL 해제 + identity 테이블 추가(마이그 **100**). 기존 phone 유저 처리는 §7에서 옵션 제시 — **권장: dev 데이터 초기화 후 OAuth-only 신규 시작**.
- **⚠️ Apple 규정(App Store 4.8)**: iOS에서 Google/Facebook 등 제3자 로그인을 제공하면 **Sign in with Apple 제공이 의무**. iOS 빌드에 Apple 미포함 시 리젝.
- **⚠️ 네이티브 빌드 의존**: Google(Android/iOS)·Apple(iOS) 네이티브 SDK는 Mac 빌드 머신 필요(기존 병목). 웹 리다이렉트 폴백은 §5-C.

---

## 1. 현재 상태 분석 (코드 기준)

| 구성요소 | 현재 구현 | 파일 |
|---|---|---|
| 가입 | `POST /auth/register {phone}` → 신규면 User 생성+랜덤닉네임, 기존이면 passcode 재발급 | `backend/app/routers/auth.py:37` |
| 로그인 | `POST /auth/login {phone, passcode}` → pbkdf2 검증 | `auth.py:79` |
| 조회 | `GET /auth/me?phone=` | `auth.py:121` |
| 세션 | 클라 쿠키 `sr_session = {phone, passcode, userId}` (180일) | `frontend/src/lib/session.ts` |
| User 모델 | `id UUID PK` / `phone String(20) UNIQUE NOT NULL` / `passcode_hash String(255) nullable` / `nickname unique` | `backend/app/models.py:92` |
| 내부 앵커 | `users.id`(UUID) — 엔진 `device_user_map.external_uuid`, FCM, 모든 FK가 이 UUID 참조 | — |
| app_config | `(group_name, key)` PK, value TEXT. env 우선 → DB fallback 패턴 | `models.py:735`, `services/translate.py:80` |

**핵심 불변식**: 내부 `users.id`(UUID)는 **모든 하위 시스템(엔진/FCM/피드/마켓/DM)의 외래키 앵커**다. OAuth 전환은 *식별·세션 계층만* 교체하고 이 UUID는 가입 시 그대로 발급·유지한다 → 엔진·기존 데이터 무영향.

**전환 대상(폐기/변경)**:
- `phone` 입력 가입 플로우 (PhoneInput 화면) → OAuth 버튼 화면으로 교체.
- `phone` 컬럼 `NOT NULL` 제약 해제 (OAuth 가입 시 phone 없음).
- 세션 쿠키 payload `{phone, passcode}` → `{userId, sessionToken}`.
- 자동 로그인 bootstrap (`App.tsx`) → phone+passcode 대신 sessionToken 검증.

---

## 2. 인증 플로우 설계 (verify-on-server)

```
[OAuth 버튼 화면]
   │ 사용자가 Google/Apple/Facebook 선택
   ▼
native.signInWith(provider)         ← 네이티브 SDK가 provider 로그인 UI 표시
   │ → returns { idToken | accessToken, provider }
   ▼
POST /auth/oauth/login { provider, token }
   │
   ├─ BFF: provider별 토큰 검증 (§3)
   │     → 검증 성공 시 표준화된 프로필 추출:
   │        { provider, provider_user_id(sub), email?, name?, picture? }
   │
   ├─ user_oauth_identities 에서 (provider, provider_user_id) 조회
   │     ├─ 있음 → 기존 user_id 로그인
   │     └─ 없음 → users 신규 생성(내부 UUID 발급) + identity row 생성 (가입)
   │
   ├─ 세션 토큰 발급 (server secret 생성 → pbkdf2 해시 저장)
   ▼
응답 { user, session_token, is_new }
   │
   ▼
프론트: saveSession({ userId, sessionToken }) + useUserStore 갱신
```

**자동 로그인(앱 재기동)**:
```
쿠키 { userId, sessionToken } 읽기
   → POST /auth/session/verify { userId, session_token }
   → 성공: Home / 실패: OAuth 버튼 화면
```

**왜 verify-on-server인가** (대안 반박): 서버 OAuth authorization-code 리다이렉트 플로우는 콜백 URL·세션 state·CSRF 보호가 필요하고 WebView 리다이렉트가 불안정하다. 모바일 네이티브 SDK는 이미 OS 레벨에서 안전하게 토큰을 받아오므로, BFF는 **받은 토큰의 진위만 검증**하면 된다. 더 단순하고 모바일에 정합적이다.

---

## 3. Provider별 토큰 검증 (BFF)

신규 모듈 `backend/app/services/oauth.py` — provider별 검증기 + 표준 프로필 추출.

### 3-A. Google (ID 토큰 검증)
- 네이티브 SDK가 **ID 토큰(JWT)** 반환.
- 검증: Google 공개키로 서명 검증 + `aud == GOOGLE_OAUTH_CLIENT_ID_WEB` + `iss in (accounts.google.com, https://accounts.google.com)` + 만료.
- 라이브러리: `google-auth` (`google.oauth2.id_token.verify_oauth2_token`).
- 필요 키: **client_id (web)** — 공개값. → `app_config`.
- `sub` = provider_user_id, `email`/`name`/`picture` 추출.

### 3-B. Apple (ID 토큰 검증)
- 네이티브 Sign in with Apple이 **ID 토큰(JWT)** 반환.
- 검증: Apple 공개키(`https://appleid.apple.com/auth/keys`, JWKS)로 서명 검증 + `aud == APPLE_BUNDLE_ID(또는 Services ID)` + `iss == https://appleid.apple.com` + 만료.
- 라이브러리: `pyjwt[crypto]` + JWKS 캐시.
- 필요 키(P0): **bundle id / services id** — 공개값. → `app_config`.
- **주의**: Apple은 최초 로그인에만 email/name을 주고 이후엔 안 줌 → 최초 응답에서 반드시 저장. email은 private relay일 수 있음. `.p8`(서버 client_secret 생성, 토큰 폐기)은 **P1**에서만 필요.

### 3-C. Facebook (access token 검증)
- 네이티브 SDK가 **access token** 반환.
- 검증: Graph API `GET /debug_token?input_token=<token>&access_token=<app_id>|<app_secret>` → `data.is_valid && data.app_id == 우리 app_id` 확인 → `GET /me?fields=id,name,email&access_token=<token>`.
- 필요 키: **app_id**(공개) → `app_config`, **app_secret**(시크릿) → **`.env`**.
- email 미동의 가능 → nullable 처리.

> 표준 프로필 인터페이스(공통): `OAuthProfile { provider, provider_user_id, email: str|None, display_name: str|None, picture_url: str|None }`. 각 검증기가 이 형태로 반환.

---

## 4. DB 마이그레이션 + 세션 규약

### 4-A. 마이그 `database/init/100_oauth_identities.sql`

> ⚠️ asyncpg 단일 호출 다중문장 금지 — 문장 분리 ([[project_asyncpg_multistatement_migration]]).

```sql
-- 1) phone NOT NULL 해제 (OAuth 가입 시 phone 없음). UNIQUE는 유지(NULL 복수 허용).
ALTER TABLE users ALTER COLUMN phone DROP NOT NULL;

-- 2) OAuth identity 매핑 테이블
CREATE TABLE IF NOT EXISTS user_oauth_identities (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider        VARCHAR(20) NOT NULL,          -- 'google' | 'apple' | 'facebook' | 'zalo'
    provider_user_id VARCHAR(255) NOT NULL,        -- provider 의 sub
    email           VARCHAR(255),
    raw_profile     JSONB,                         -- 최초 응답 보존(Apple email/name 1회성 대비)
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (provider, provider_user_id)
);
CREATE INDEX IF NOT EXISTS idx_oauth_identity_user ON user_oauth_identities(user_id);
```

- 세션 토큰은 **기존 `users.passcode_hash` 컬럼 재사용**(서버 secret의 pbkdf2 해시 저장) → 신규 컬럼 불필요. (멀티 디바이스 동시 세션이 P1 요구가 되면 별도 `user_sessions` 테이블로 분리)

### 4-B. 세션 규약 (권장 = passcode 메커니즘 재사용)

- 로그인 검증 성공 → `secret = uuid4().hex` 생성 → `users.passcode_hash = pbkdf2(secret)` 저장 → 응답 `session_token = secret`.
- 프론트 `session.ts`: `Session { userId, sessionToken }` 로 인터페이스 교체. **session.ts 내부만 변경**하면 PhoneInput/App.tsx 호출부 영향 최소 (auth.md 설계 의도 유지).
- bootstrap: `POST /auth/session/verify { userId, session_token }` → `pbkdf2.verify`.
- **장점**: 기존 `pwd_ctx`/`_hash`/`_verify` 그대로 재사용, 신규 인프라 0. **단점**: 단일 세션(재로그인 시 이전 토큰 무효) — 모바일 단일 단말 가정에서 충분.
- **P1 옵션(JWT)**: 멀티 디바이스/만료/무상태 필요 시 `ENGINE_ADMIN_JWT_SECRET`류 HS256 JWT로 승격. 인터페이스는 동일(`session.ts` 내부만 교체).

> **Karpathy #2(단순성)**: P0에서 JWT 인프라 신설은 과설계. passcode 재사용이 최소 변경. JWT는 멀티세션 요구가 실제로 생길 때 도입.

---

## 5. 프론트엔드 / 네이티브

### 5-A. native.ts 브리지 (CLAUDE.md §8 — navigator.* 금지, native.ts 경유)
신규 메서드 추가:
```ts
signInWith(provider: 'google' | 'apple' | 'facebook'):
    Promise<{ provider: string; token: string; tokenType: 'id_token' | 'access_token' }>
signOut(): Promise<void>   // provider 세션 정리(선택)
```
- 내부에서 플랫폼별 Capacitor 플러그인 호출. [[feedback_native_bridge]] — 네이티브 native 코드는 가급적 건드리지 않고 web(native.ts)에서 기존/신규 플러그인 인터페이스에 흡수.

### 5-B. 네이티브 SDK (권장 — 모바일 UX 최적)
| Provider | Android | iOS | 비고 |
|---|---|---|---|
| Google | Credential Manager / Google Sign-In | GIDSignIn | Capacitor 커뮤니티 플러그인 또는 커스텀 플러그인 |
| Apple | (Android는 웹폴백) | ASAuthorizationController | **iOS 필수**(4.8) |
| Facebook | Facebook Login SDK | Facebook Login SDK | app_secret은 서버에만 |
- **⚠️ 네이티브 빌드는 Mac 의존**([[project_native_repo_topology]]) — 플러그인 추가/등록 후 각 origin main 직접 push, 실기기 빌드 검증 필요.

### 5-C. 웹 리다이렉트 폴백 (네이티브 빌드 전 / 데스크톱 검증용)
- `@capacitor/browser`로 provider authorize URL 오픈 → 커스텀 스킴 딥링크로 토큰 회수. 플러밍이 더 많고 Apple은 사실상 네이티브 필요 → **P0는 네이티브 우선, 웹폴백은 dev 브라우저 검증 한정**.

### 5-D. 화면
- `PhoneInput.tsx` → `OAuthLogin.tsx`(가칭)로 교체: [Google][Apple][Facebook] 버튼. iOS는 Apple 버튼 우선 노출.
- `App.tsx` bootstrap: `{userId, sessionToken}` 검증으로 교체.
- i18n: ko/en/vi 3종 — 버튼 라벨/약관 동의 문구.

---

## 6. API 키 배치 (app_config 단일화)

> **위협 모델 정정**: `.env`를 쓰는 실익은 "런타임에 못 읽게"가 아니라 **git 추적 회피**(`.env`는 `.gitignore`)다. app_config seed SQL(`database/init/*.sql`)은 **git 추적 대상**이므로, 거기에 실제 시크릿을 박으면 리포에 커밋되는 게 진짜 위험이다. → **seed엔 `CHANGE_ME` placeholder만, 실제 값은 런타임 `UPDATE`로 주입**하면 git 누출이 없고, 런타임 노출은 .env와 동일하다. 따라서 **시크릿 포함 전 키를 app_config로 단일화**한다(사용자 요구 직접 충족). CLAUDE.md §4의 의도(=추적 파일에 평문 시크릿 금지)는 placeholder-only seed로 그대로 지켜진다.

### 6-A. app_config 적재 (group_name = `oauth`)
| key | 분류 | 용도 |
|---|---|---|
| `google_client_id_web` | 공개 | Google ID 토큰 검증 audience |
| `google_client_id_ios` | 공개 | iOS 네이티브 SDK |
| `google_client_id_android` | 공개 | Android 네이티브 SDK |
| `apple_client_id` | 공개 | Apple ID 토큰 검증 audience (bundle/services id) |
| `facebook_app_id` | 공개 | FB access token 검증 |
| `facebook_app_secret` | **시크릿** | FB `debug_token` 검증용 |
| `apple_signin_key_p8` | **시크릿·P1** | 서버 client_secret/토큰폐기용 (.p8 본문) |
| `apple_signin_key_id` / `apple_signin_team_id` | P1 | Apple 키 메타 |

seed 마이그 `database/init/101_oauth_config_seed.sql` — **placeholder만 커밋**:
```sql
INSERT INTO app_config (group_name, key, value, description) VALUES
  ('oauth', 'google_client_id_web',  'CHANGE_ME', 'Google ID token audience (web client)'),
  ('oauth', 'google_client_id_ios',  'CHANGE_ME', 'Google iOS client id'),
  ('oauth', 'google_client_id_android','CHANGE_ME', 'Google Android client id'),
  ('oauth', 'apple_client_id',        'CHANGE_ME', 'Apple Sign in audience (bundle/services id)'),
  ('oauth', 'facebook_app_id',        'CHANGE_ME', 'Facebook app id'),
  ('oauth', 'facebook_app_secret',    'CHANGE_ME', 'Facebook app secret (runtime update only)')
ON CONFLICT (group_name, key) DO NOTHING;   -- 기존 실값 덮어쓰기 방지
```
- 사용자 런타임 주입: `UPDATE app_config SET value='<실제값>' WHERE group_name='oauth' AND key='facebook_app_secret';` (또는 admin UI).
- **불변 규칙**: seed SQL에 실제 값 **절대 커밋 금지**(placeholder만). `ON CONFLICT DO NOTHING`으로 사용자가 넣은 실값이 재배포 때 placeholder로 덮이지 않게 한다.
- 읽기: translate 패턴 동일 — `app_config WHERE group_name='oauth'` 로드 후 메모리 캐시. env override가 필요하면 env 우선 폴백 추가 가능(선택).

---

## 7. 각 Provider API 키 발급 가이드

### 7-A. Google (Google Cloud Console)
1. https://console.cloud.google.com → 프로젝트 생성/선택 (FCM `saigon-rider-af3c9` 재사용 가능).
2. **OAuth 동의 화면** 구성(앱 이름·로고·지원 이메일·도메인·스코프 `email profile openid`). 외부 사용자 → 게시 상태 전환.
3. **사용자 인증 정보 → OAuth 2.0 클라이언트 ID** 3종 생성:
   - **웹 애플리케이션**: 토큰 검증 audience용 (`google_client_id_web`).
   - **Android**: 패키지명 + 서명 인증서 **SHA-1 지문**(`keytool -list -v -keystore ...`) 입력 → `google_client_id_android`.
   - **iOS**: Bundle ID 입력 → `google_client_id_ios`.
4. 발급된 client_id 3종을 `app_config(group_name='oauth')`에 적재.

### 7-B. Apple (Apple Developer, 유료 계정 필요)
1. https://developer.apple.com → Certificates, IDs & Profiles.
2. **App ID**에 **Sign In with Apple** capability 활성화.
3. (웹/Android 폴백 쓰면) **Services ID** 생성 + Return URLs 등록.
4. `apple_client_id` = iOS는 **Bundle ID**, 웹은 **Services ID** → app_config.
5. **P1(토큰 폐기/서버 client_secret)**: **Key(.p8)** 생성 → Key ID·Team ID와 함께 app_config(`apple_signin_*`)에 런타임 주입. P0 ID토큰 검증엔 불필요.
6. Xcode: Signing & Capabilities에 **Sign In with Apple** 추가(Mac 빌드).

### 7-C. Facebook (Meta for Developers)
1. https://developers.facebook.com → 앱 생성(유형: Consumer).
2. **Facebook Login** 제품 추가.
3. 설정 → 기본: **앱 ID**(`facebook_app_id`) + **앱 시크릿**(`facebook_app_secret`) → 둘 다 app_config에 런타임 주입.
4. Android: 패키지명 + 키 해시 등록. iOS: Bundle ID 등록.
5. 앱 검수(email 권한)·라이브 모드 전환 필요.

### 7-D. Zalo (향후 — 협의 완료 시 메인)
- Zalo OAuth(`https://oauth.zaloapp.com`)는 access token 방식. `provider='zalo'` 검증기를 `oauth.py`에 추가 + app_config `zalo_app_id`/`zalo_app_secret`. 테이블·세션 규약은 **변경 없이 그대로 확장**(identity 테이블 provider 컬럼만 추가 사용). → P0 설계가 Zalo 확장을 이미 수용.

---

## 8. 기존 phone 유저 마이그레이션 (결정 필요)

| 옵션 | 내용 | 장단 |
|---|---|---|
| **(A) dev 초기화 (권장)** | dev는 테스트 데이터 위주 → phone 유저 폐기, OAuth-only로 새 시작 | 가장 단순. 운영 미런칭 가정 시 최적 |
| (B) 링크 강제 | 기존 유저 첫 진입 시 OAuth 연결 화면 → identity row 생성해 phone 유저와 병합 | phone 보존, 구현·UX 비용↑ |
| (C) phone 로그인 레거시 유지 | 신규는 OAuth-only, 기존은 phone+passcode 계속 허용 | 두 경로 병존(부채). 사용자 의도("아예 OAuth만")와 상충 |

- **권장 = (A)**. 운영에 실유저가 있다면 (B). **이 선택은 다음 스레드 착수 시 사용자 확인 필요.**

---

## 9. Phase 분해 + 검증 기준

```
P1. DB/모델          → 마이그 100 적용, user_oauth_identities + phone nullable
    검증: psql \d user_oauth_identities, users.phone is nullable
P2. BFF 검증기        → oauth.py(google/apple/facebook verify) + /auth/oauth/login, /auth/session/verify
    검증: 각 provider mock 토큰 단위테스트(유효=프로필추출/위조=401), find-or-create E2E
P3. 세션 규약 전환     → session.ts {userId,sessionToken}, App.tsx bootstrap, register/login 폐기 정리
    검증: tsc -b 0, eslint 0, 자동로그인 라운드트립
P4. native.ts + 화면   → signInWith 브리지, OAuthLogin 화면, i18n 3종
    검증: dev 브라우저 mock 로그인 플로우, 빌드
P5. 네이티브 SDK 통합  → Android/iOS 플러그인(Mac 빌드), Apple capability
    검증: 실기기 provider 로그인 → 내부세션 발급 (Mac 의존)
P6. app_config 키     → 101 seed(placeholder만), 사용자 런타임 UPDATE 안내, 운영 배포 노트
    검증: 실 client_id 주입 후 토큰 검증 통과
```

**검증 가능 목표(Karpathy #4)**: "OAuth 추가" → "각 provider의 유효 토큰으로 `/auth/oauth/login` 호출 시 내부 user 생성·세션 발급, 위조/만료 토큰은 401" 테스트 통과.

---

## 10. 미결정 / 사용자 확인 필요 (착수 전)

1. **기존 phone 유저 처리** — §8 옵션 (A)/(B)/(C) 중 선택. (권장 A)
2. **세션 방식** — passcode 재사용(P0 권장) vs JWT(P1). (권장 passcode 재사용)
3. **P0 provider 범위** — 3종 동시 vs Google 먼저 단계 도입. iOS 빌드한다면 Apple 동반 필수(4.8).
4. **앱 식별자 확정** — Android packageName / iOS Bundle ID(키 발급에 필요). 현재 추정 `com.wellconn.saigonrider` 확인 요망.
5. **Google Cloud 프로젝트** — FCM `saigon-rider-af3c9` 재사용 여부.

---

## 11. 다음 스레드 착수 절차

1. 본 문서 기준으로 §10 항목 사용자 확인.
2. 워크플로우 등록([[feedback_follow_full_workflow]]): Plane Feature(B-2) IN_PROGRESS + 서브 Todo(P1~P6) + Notion 미러 페이지 + `current.md` 활성 태스크 라인.
3. P1부터 순차 구현, 각 Phase 검증 기준 통과 후 다음 단계.
4. push 전 `/code-review` (인증 영역 고위험 → effort `high`).
