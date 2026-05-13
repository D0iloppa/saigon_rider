# 회원가입 & 인증 구조

## 전체 흐름

```
[Splash] → 시작하기 → [PhoneInput]
                          │ 국가코드 선택 + 번호 입력
                          │
                    POST /api/auth/register { phone }
                          │
                    ┌─────┴──────────────────────────┐
               신규 가입                      기존 번호 (쿠키 없음)
                    │                               │
             passcode 생성 & DB 저장          passcode 재발급 & DB 갱신
                    │                               │
             쿠키 저장 { phone, passcode, userId }
                    │
              is_new=true          is_new=false & nickname 없음
                    │                               │
            [ProfileSetup]                  [ProfileSetup]

[앱 재기동]
    │
 쿠키 읽기 { phone, passcode }
    │
POST /api/auth/login
    │
 성공 → [Home] (자동 로그인)
 실패 → [Splash]
```

## API 명세

### POST `/api/auth/register`

신규 가입. 이미 가입된 번호면 passcode 재발급.

**Request**
```json
{ "phone": "+84901234567" }
```

**Response**
```json
{
  "passcode": "aeaee462681f450bab6c7f0f9da24935",
  "is_new": true,
  "user": {
    "id": "uuid",
    "phone": "+84901234567",
    "nickname": null,
    "rider_type": null,
    "level": 1,
    "exp": 0, "xp": 0, "gold": 0, "skill_pt": 0,
    "avatar_url": null,
    "created_at": "2026-05-13T06:04:26Z"
  }
}
```

### POST `/api/auth/login`

**Request**
```json
{ "phone": "+84901234567", "passcode": "aeaee462681f450bab6c7f0f9da24935" }
```

**Response**
```json
{ "user": { ... } }
```

**Errors**
- `401 User not found` — 번호 미등록
- `401 Invalid passcode` — passcode 불일치

### GET `/api/auth/me?phone=+84901234567`

현재 유저 정보 조회 (프로필 저장 후 새 데이터 로드 등에 활용).

---

## 프론트엔드 구조

| 파일 | 역할 |
|---|---|
| `src/data/countryCodes.ts` | 65개국 국가코드 + 유니코드 국기 이모지 (기본: 🇻🇳 +84) |
| `src/lib/session.ts` | 쿠키 기반 세션 관리 (`saveSession`, `loadSession`, `clearSession`) |
| `src/api/auth.ts` | `apiRegister`, `apiLogin` fetch 래퍼 |
| `src/pages/auth/PhoneInput.tsx` | 국가코드 피커 + 번호 입력 + 가입/로그인 분기 |
| `src/store/useUserStore.ts` | `loginFromBackend(dto)` 액션으로 상태 갱신 |
| `src/App.tsx` | 앱 기동 시 쿠키 → 자동 로그인 bootstrap |

---

## 보안 현황 & 개선 계획

| 항목 | 현재 | 목표 |
|---|---|---|
| passcode 저장 | 클라이언트 쿠키 (평문) | HttpOnly cookie + JWT |
| passcode 해싱 | PBKDF2-SHA256 | 유지 (충분) |
| OTP 인증 | 생략 (개발 단계) | Twilio/AWS SNS 연동 |
| HTTPS | 없음 (개발) | Let's Encrypt |

> 세션 교체 시: `src/lib/session.ts`의 `saveSession` / `loadSession` 내부만 변경하면  
> PhoneInput, App.tsx 등 다른 코드 변경 없음.

---

## DB 연동

`users` 테이블에 `passcode_hash VARCHAR(255)` 컬럼 추가 (migration 002).

```sql
-- database/init/002_add_passcode.sql
ALTER TABLE users ADD COLUMN IF NOT EXISTS passcode_hash VARCHAR(255);
```

> **초기화된 DB에 적용**: `docker exec saigon_db psql -U <DB_USER> -d <DB_NAME> -f /docker-entrypoint-initdb.d/002_add_passcode.sql`  
> 또는 볼륨 초기화 후 재기동: `docker compose down -v && docker compose --profile backend up -d`
