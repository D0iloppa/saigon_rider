# Auth / Imgproxy 트러블슈팅

> 작성일: 2026-05-13  
> 증상: `/api/auth/login` → 401 "User not found", `/api/profile/avatar` → 404 "User not found"

---

## 원인 1 — `001_init_schema.sql`에 `passcode_hash` 컬럼 누락

### 경위
`database/init/002_add_passcode.sql` 파일이 `002_contents_schema.sql`로 대체되면서 `passcode_hash VARCHAR(255)` 컬럼이 `001_init_schema.sql`에 추가되지 않은 채 사라짐.

DB 볼륨을 초기화(재생성)하면 users 테이블에 `passcode_hash` 컬럼이 없어 auth 쿼리가 실패.

### 조치
`database/init/001_init_schema.sql`의 `users` 테이블에 `passcode_hash VARCHAR(255)` 컬럼 추가.

---

## 원인 2 — Zustand persist가 만료 세션을 복원해 home으로 진입

### 경위
`useUserStore`는 `persist` 미들웨어로 `isAuthenticated: true` 상태를 localStorage에 보관.  
DB 초기화 후 앱을 재기동하면:
1. Zustand가 localStorage에서 `isAuthenticated: true` 복원
2. `App.tsx` bootstrap에서 `apiLogin` 실패 → `catch`에서 아무 것도 하지 않음
3. `isAuthenticated`가 여전히 `true`이므로 `Splash`의 `useEffect`가 `/home`으로 이동

### 조치
`App.tsx` catch 블록에서 `clearSession()` + `logout()` 동시 호출.

```typescript
// App.tsx
.catch(() => {
  clearSession();
  logout();
})
```

---

## 원인 3 — nginx `merge_slashes`가 `local:///` 경로를 압축

### 경위
imgproxy 소스 URL로 `local:///system/saigon-default.jpg`를 plain 형식으로 사용할 때,  
nginx가 연속 슬래시를 합쳐 `local:/system/...`으로 변환 → imgproxy가 파일을 인식 못함.

### 조치
`backend/app/utils.py`의 `build_imgproxy_url`에서 소스 URL을 **base64url 인코딩**으로 전환.

```python
# 변경 전 (plain — nginx slash merge 취약)
path = f"/plain/{source}"

# 변경 후 (base64url — nginx를 통과해도 안전)
encoded = urlsafe_b64encode(source.encode()).rstrip(b"=").decode()
path = f"/{encoded}"
```

---

## 원인 4 — `.env`의 `IMGPROXY_BASE_URL`이 LAN IP

### 경위
`IMGPROXY_BASE_URL=http://192.168.0.43:18090/img`  
API 응답에 LAN IP가 포함된 이미지 URL이 내려와 외부 클라이언트에서 이미지 로드 불가.

### 조치
`.env`의 `IMGPROXY_BASE_URL`을 공개 도메인으로 변경.

```env
IMGPROXY_BASE_URL=http://saigon.doil.me/img
VITE_API_BASE=http://saigon.doil.me/api
VITE_USE_MOCK=false
```

---

## 적용된 변경 파일 목록

| 파일 | 변경 내용 |
|---|---|
| `database/init/001_init_schema.sql` | users 테이블에 `passcode_hash VARCHAR(255)` 추가 |
| `backend/app/utils.py` | `build_imgproxy_url` — plain → base64url 인코딩 |
| `frontend/src/App.tsx` | 자동 로그인 실패 시 `clearSession()` + `logout()` 호출 |
| `.env` | `IMGPROXY_BASE_URL`, `VITE_API_BASE` 도메인으로 변경, `VITE_USE_MOCK=false` |

---

## DB 재초기화 절차 (테스트 환경)

```bash
cd /home/doil/workspace/w_dev/saigon_rider
docker compose --profile backend down -v
docker compose --env-file .env --profile backend up -d
docker compose --env-file .env up --build -d frontend
```
