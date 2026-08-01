# 앱 버전 관리 시스템

> **생성**: 2026-05-18  
> **상태**: IN_PROGRESS

## 목표

앱 버전정보를 트리 구조로 관리하고 릴리스 노트를 발행할 수 있는 시스템 구축.

## 설계

### 테이블 구조 (`app_versions`)

```
app_versions
├── id: SERIAL PK
├── version: VARCHAR(50) — 버전 문자열 (e.g., "1.0.0")
├── platform: ENUM('primary', 'ios', 'android')
├── parent_id: INT FK → app_versions(id) — primary는 NULL, ios/android는 primary를 가리킴
├── build_number: VARCHAR(50) — 빌드 번호 (optional)
├── release_note: TEXT — 릴리스 노트 (Markdown)
├── is_force_update: BOOLEAN DEFAULT false — 강제 업데이트 여부
├── is_active: BOOLEAN DEFAULT true — 현재 활성 버전 여부
├── released_at: TIMESTAMPTZ — 릴리스 일시
├── created_at: TIMESTAMPTZ DEFAULT NOW()
└── updated_at: TIMESTAMPTZ DEFAULT NOW()
```

### 트리 구조 예시

```
primary v1.0.0
├── ios v1.0.0 (build 100)
└── android v1.0.0 (build 2024051801)

primary v1.1.0
├── ios v1.1.0 (build 110)
└── android v1.1.0 (build 2024060101)
```

- primary = 프론트엔드(웹뷰) 버전 → iOS/Android 공통
- ios/android = 네이티브 쉘 버전 → 각각 다를 수 있음
- parent_id로 primary-native 연결

### API 엔드포인트

| 메서드 | 경로 | 용도 |
|--------|------|------|
| GET | `/api/app-version/current` | 현재 활성 버전 조회 (프론트 Settings 연동) |
| GET | `/api/app-version/releases` | 릴리스 노트 목록 |
| GET | `/api/app-version/{id}` | 버전 상세 (릴리스 노트 포함) |

### 관리자 엔드포인트

| 메서드 | 경로 | 용도 |
|--------|------|------|
| GET | `/admin/versions` | 버전 목록 페이지 |
| POST | `/admin/versions` | 신규 버전 등록 |
| PUT | `/admin/versions/{id}` | 버전 수정 |

### 프론트엔드

- Settings 페이지의 "앱 정보" 행에서 하드코딩된 `v1.0.0` → API 조회로 교체
- `useAppVersion` 훅 또는 직접 fetch

## 변경 파일

- `database/init/029_app_versions.sql`
- `backend/app/models.py` — `AppVersion` 모델
- `backend/app/schemas.py` — 버전 관련 스키마
- `backend/app/routers/admin.py` — 관리자 CRUD
- `backend/app/routers/app_version.py` — 공개 API (신규)
- `frontend/src/api/appVersion.ts` — API 함수 (신규)
- `frontend/src/pages/settings/Settings.tsx` — 버전 표시 연동
