---
sidebar_position: 2
title: DB 스키마
---

# DB 스키마

:::warning 접근 제한
이 섹션은 Nginx HTTP Basic Auth로 보호됩니다.
:::

## 연결 정보

| 항목 | 값 |
|---|---|
| 호스트 | `localhost:5435` (호스트) / `database:5432` (컨테이너) |
| DB | `saigon_rider` (`.env` `DB_NAME`) |
| 유저 | `saigon` (`.env` `DB_USER`) |
| 익스텐션 | PostGIS |

```bash
# DB 클라이언트 접속
psql -h localhost -p 5435 -U saigon -d saigon_rider
```

## 주요 테이블

### users
| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | UUID PK | 사용자 ID |
| `phone` | VARCHAR UNIQUE | 전화번호 |
| `passcode` | VARCHAR | 인증 코드 |
| `nickname` | VARCHAR | 닉네임 |
| `avatar_content_id` | UUID FK | 프로필 사진 |
| `user_type` | ENUM | standard / driver |
| `created_at` | TIMESTAMPTZ | 가입일 |

### contents
| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | UUID PK | 콘텐츠 ID |
| `owner_id` | UUID | 소유자 ID |
| `owner_type` | ENUM | user / system |
| `file_path` | VARCHAR | 저장 경로 |
| `mime_type` | VARCHAR | MIME 타입 |
| `created_at` | TIMESTAMPTZ | 업로드일 |

### quests
| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | UUID PK | 퀘스트 ID |
| `title` | VARCHAR | 제목 (ko 기준) |
| `period` | ENUM | DAILY / WEEKLY / EVENT |
| `district` | VARCHAR | HCM 구 (17개 enum 값) |
| `hero_image_url` | TEXT | 이미지 URL (폴백) |
| `thumbnail_content_id` | UUID FK→contents | 퀘스트 이미지 (owner_type=system) |
| `reward_exp` | INT | 경험치 보상 |

### user_quests
| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | UUID PK | 수락 레코드 ID |
| `user_id` | UUID FK | 사용자 |
| `quest_id` | UUID FK | 퀘스트 |
| `status` | ENUM | ACCEPTED / ACTIVE / COMPLETED / FAILED |
| `period_key` | VARCHAR(20) | 중복 방지 키 (DAILY: `2026-05-15`, WEEKLY: `2026-W20`, EVENT: `ONCE`) |
| `accepted_at` | TIMESTAMPTZ | 수락 시각 |
| `completed_at` | TIMESTAMPTZ | 완료 시각 |

:::info period_key 규칙
`(user_id, quest_id, period_key)` UNIQUE 인덱스 (`WHERE status='COMPLETED'`) — 같은 기간에 같은 퀘스트 중복 완료 차단. accept 시 이미 COMPLETED 레코드 존재하면 409 반환.
:::

### point_ledger (Engine 관리)
| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | UUID PK | 레코드 ID |
| `user_id` | UUID FK | 사용자 |
| `amount` | BIGINT | 포인트 금액 |
| `event_type` | ENUM | ride / quest / bonus / expire |
| `idempotency_key` | VARCHAR | 중복 방지 키 |
| `expires_at` | TIMESTAMPTZ | 만료일 |
| `created_at` | TIMESTAMPTZ | 생성일 |

## 마이그레이션

Engine은 Alembic을 사용합니다.

```bash
# 마이그레이션 실행
docker compose --profile backend exec engine alembic upgrade head

# 이력 확인
docker compose --profile backend exec engine alembic history
```

초기 스키마 파일: `database/init/001_init_schema.sql` ~ `007_quest_thumbnail_content.sql`  
Engine 마이그레이션: `engine/alembic/versions/` (리비전 001~009)

| 파일 | 내용 |
|---|---|
| `001_init_schema.sql` | 기본 스키마 |
| `002_add_passcode.sql` | passcode 컬럼 |
| `002_contents_schema.sql` | contents 테이블 |
| `003_profile_avatar.sql` | 프로필 아바타 FK |
| `004_comment_likes.sql` | 댓글·좋아요 |
| `005_app_config.sql` | 앱 설정 KV |
| `006_quest_period_key.sql` | `user_quests.period_key` + unique index |
| `007_quest_thumbnail_content.sql` | `quests.thumbnail_content_id` FK |
