# 인증 체계 구현 필요 (TODO)

## 현재 상태 (임시)

로그인 시 전화번호만으로 `apiRegister`를 호출해 기존 계정 여부를 확인하는 방식.
- 기존 계정이면 passcode를 재발급하고 로그인
- 신규 번호면 "가입되지 않은 번호" 에러

**보안 없음**: 전화번호만 알면 누구나 타인 계정으로 로그인 가능.

## 반드시 구현해야 할 사항

### 1. OTP 인증 (SMS)
- 로그인/회원가입 시 전화번호로 6자리 OTP 발송
- 사용자가 OTP 입력 → 서버 검증 후 passcode 발급
- 현재 `OtpInput.tsx` 화면이 있으나 더미 구현 상태

### 2. 세션 토큰 (JWT 또는 HttpOnly Cookie)
- 현재: passcode를 localStorage/cookie에 평문 저장
- 개선: 로그인 성공 시 JWT 발급, HttpOnly Cookie로 관리
- `session.ts`의 cookie 방식은 보안 취약 (XSS에 노출)

### 3. 토큰 갱신 (Refresh Token)
- Access Token 만료 시 자동 갱신
- 현재 만료 로직 없음

### 4. 인증 미들웨어 (BFF 전체)
- 현재 `/api/complete` 엔드포인트만 `X-Passcode` 헤더 검증
- 나머지 모든 BFF 엔드포인트는 인증 없이 접근 가능
- FastAPI Depends를 활용한 전체 라우터 인증 미들웨어 필요

## 관련 파일
- `frontend/src/pages/auth/PhoneInput.tsx` — 현재 임시 로그인 로직
- `frontend/src/pages/auth/OtpInput.tsx` — 더미 OTP 화면 (실제 연동 필요)
- `frontend/src/lib/session.ts` — 세션 관리 (보안 개선 필요)
- `backend/app/routers/auth.py` — register/login 엔드포인트
- `backend/app/routers/quests.py` — `_verify_passcode` (complete 엔드포인트만 적용)
