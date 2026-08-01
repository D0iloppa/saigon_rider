# Contents 이미지 서빙 기능 구현 계획

> 작성일: 2026-05-13  
> 목적: 사진 컨텐츠를 DB에 등록하고, 컨텐츠 ID로 imgproxy를 통해 이미지를 서빙하는 기능 구현

---

## 아키텍처 요약

```
Client
  │
  ▼
Nginx (:18090)
  ├── /api/  →  Backend (FastAPI)
  │               ├── POST /api/contents/upload  →  파일 저장 + DB 등록
  │               └── GET  /api/contents/{id}    →  imgproxy URL 반환
  └── /img/  →  imgproxy
                  └── local:///  →  ./contents (호스트 볼륨)
```

### 파일 저장 경로 규칙

| owner_type | 저장 경로 | 업로드 주체 |
|---|---|---|
| `user` | `/contents/user-contents/yyyy/mm/{uuid}.{ext}` | 사용자 업로드 |
| `system` | `/contents/system/{filename}` | 직접 업로드 (정적 리소스) |

- imgproxy 내부 기준 경로: `local:///{file_path}` (file_path = contents 볼륨 기준 상대경로)
- imgproxy 외부 URL: `{IMGPROXY_BASE_URL}/insecure/plain/local:///{file_path}` (KEY/SALT 미설정 시)

---

## 구현 태스크 목록

### [x] 1. DB 스키마 — `contents` 테이블
- 파일: `database/init/002_contents_schema.sql`
- ENUM: `content_owner_type` (system / user)
- 컬럼: id (UUID PK), owner_type, owner_id (nullable FK → users), file_path, mime_type, original_filename, file_size, created_at, updated_at
- **완료: 2026-05-13**

### [x] 2. SQLAlchemy 모델 — `Content`
- 파일: `backend/app/models.py`
- `Content` 클래스 추가
- **완료: 2026-05-13**

### [x] 3. Pydantic 스키마
- 파일: `backend/app/schemas.py`
- `ContentOut` 추가
- **완료: 2026-05-13**

### [x] 4. Contents 라우터
- 파일: `backend/app/routers/contents.py`
- `POST /api/contents/upload` — multipart 파일 수신, 디스크 저장, DB 등록
- `GET  /api/contents/{id}` — DB 조회 + imgproxy URL 생성 반환
- imgproxy URL 서명 유틸 포함 (KEY/SALT 설정 시 HMAC-SHA256 서명, 미설정 시 /insecure/ 경로)
- **완료: 2026-05-13**

### [x] 5. main.py — 라우터 등록
- 파일: `backend/app/main.py`
- contents 라우터 include
- **완료: 2026-05-13**

### [x] 6. requirements.txt — python-multipart 추가
- 파일: `backend/requirements.txt`
- **완료: 2026-05-13**

### [x] 7. docker-compose.yml — backend 볼륨 추가
- 파일: `docker-compose.yml`
- backend 서비스에 `./contents:/data` (rw) 마운트 추가
- 환경변수 `IMGPROXY_BASE_URL`, `CONTENTS_BASE_PATH=/data`, `IMGPROXY_KEY/SALT` 추가
- **완료: 2026-05-13**

### [x] 8. .env — IMGPROXY_BASE_URL 추가
- 파일: `.env`
- `IMGPROXY_BASE_URL=http://192.168.0.43:18090/img` 추가
- **완료: 2026-05-13**

---

## API 명세

### POST /api/contents/upload

**Request** (multipart/form-data)

| 필드 | 타입 | 필수 | 설명 |
|---|---|---|---|
| file | File | Y | 업로드할 이미지 파일 |
| owner_type | string | Y | `system` 또는 `user` |
| owner_id | UUID | N | user일 때 유저 UUID |

**Response** `201`

```json
{
  "id": "uuid",
  "owner_type": "user",
  "owner_id": "user-uuid",
  "file_path": "user-contents/2026/05/uuid.jpg",
  "mime_type": "image/jpeg",
  "original_filename": "photo.jpg",
  "file_size": 102400,
  "imgproxy_url": "http://192.168.0.43:18090/img/insecure/plain/local:///user-contents/2026/05/uuid.jpg",
  "created_at": "2026-05-13T..."
}
```

### GET /api/contents/{id}

**Response** `200` — 위와 동일한 구조

---

## ERD 업데이트

```
contents {
    UUID id PK
    content_owner_type owner_type
    UUID owner_id FK(nullable)
    TEXT file_path
    VARCHAR mime_type
    VARCHAR original_filename
    INTEGER file_size
    TIMESTAMPTZ created_at
    TIMESTAMPTZ updated_at
}

users ||--o{ contents : "업로드"
```
