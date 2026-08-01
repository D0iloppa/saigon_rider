# 프로필 사진 & 닉네임 수정 기능 구현 계획

> 작성일: 2026-05-13  
> 목적: 계정별 프로필 사진 업로드/변경, 닉네임 변경 기능 추가

---

## 설계 개요

### 기본 프로필 사진
- 파일: `contents/system/saigon-default.jpg`
- `users.avatar_url`이 NULL일 때 자동으로 이 파일의 imgproxy URL 반환
- DB에 별도 등록 없이 파일 경로를 상수로 관리

### 프로필 사진 업로드 흐름

```
Client
  │ POST /api/profile/avatar (multipart: file + user_id)
  ▼
Backend
  ├── 1. contents 테이블에 이미지 등록 (owner_type=user, owner_id=user_id)
  ├── 2. users.avatar_content_id = content.id
  ├── 3. users.avatar_url = imgproxy URL (캐시 목적)
  └── 4. 업데이트된 UserOut 반환
```

### DB 변경
- `users` 테이블에 `avatar_content_id UUID FK → contents(id)` 컬럼 추가
- `avatar_url TEXT`는 유지 (imgproxy URL 저장용, NULL이면 기본 사진 URL 반환)

---

## 구현 태스크 목록

### [x] 1. DB 마이그레이션 — users에 avatar_content_id 추가
- 파일: `database/init/003_profile_avatar.sql`
- `ALTER TABLE users ADD COLUMN avatar_content_id UUID REFERENCES contents(id) ON DELETE SET NULL`

### [x] 2. imgproxy URL 빌더 유틸 분리
- 파일: `backend/app/utils.py` (신규)
- `build_imgproxy_url(file_path: str) -> str` 함수
- `DEFAULT_AVATAR_URL` 상수 (system/saigon-default.jpg 경로)
- contents.py에서 중복 제거 후 utils.py 임포트로 교체

### [x] 3. SQLAlchemy 모델 업데이트
- 파일: `backend/app/models.py`
- `User.avatar_content_id: UUID | None` 필드 추가

### [x] 4. Pydantic 스키마 업데이트
- 파일: `backend/app/schemas.py`
- `UserOut.avatar_url`: NULL 시 기본 사진 URL 자동 반환 (field_validator)
- `NicknameUpdateRequest` 추가
- `ProfileAvatarResponse` 추가 (= ContentOut + 업데이트된 UserOut)

### [x] 5. 프로필 라우터 신규 작성
- 파일: `backend/app/routers/profile.py`
- `POST /api/profile/avatar` — 사진 업로드 + users 업데이트
- `PUT  /api/profile/nickname` — 닉네임 변경

### [x] 6. main.py — 프로필 라우터 등록
- 파일: `backend/app/main.py`

### [x] 7. docs 및 spec 업데이트
- `docs/index.md` 색인 등록
- `docs/spec.md` F-03, F-10, F-12 업데이트

---

## API 명세

### POST /api/profile/avatar

**Request** (multipart/form-data)

| 필드 | 타입 | 설명 |
|---|---|---|
| file | File | 업로드할 이미지 |
| user_id | UUID | 대상 유저 ID |

**Response** `200`

```json
{
  "user": { "id": "...", "nickname": "...", "avatar_url": "http://.../img/insecure/plain/local:///user-contents/2026/05/uuid.jpg", ... },
  "content_id": "uuid"
}
```

### PUT /api/profile/nickname

**Request** (JSON)

```json
{ "user_id": "uuid", "nickname": "새닉네임" }
```

**Response** `200`

```json
{ "id": "...", "nickname": "새닉네임", "avatar_url": "...", ... }
```

---

## 관련 파일 목록

| 파일 | 역할 |
|---|---|
| `database/init/003_profile_avatar.sql` | users 테이블 avatar_content_id 컬럼 추가 |
| `backend/app/utils.py` | imgproxy URL 빌더, 기본 사진 URL 상수 |
| `backend/app/models.py` | User.avatar_content_id 필드 추가 |
| `backend/app/schemas.py` | UserOut 기본 아바타 validator, 요청 스키마 추가 |
| `backend/app/routers/profile.py` | 프로필 사진·닉네임 변경 API |
| `contents/system/saigon-default.jpg` | 기본 프로필 사진 (git 추적) |
