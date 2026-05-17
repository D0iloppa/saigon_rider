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
| `owner_type` | ENUM | `user` / `system` / `mock` / `profile_mock` |
| `file_path` | VARCHAR | 저장 경로 |
| `mime_type` | VARCHAR | MIME 타입 |
| `created_at` | TIMESTAMPTZ | 업로드일 |

:::info owner_type 의미
- `user` — 유저 업로드 (프로필 사진, 피드 이미지)
- `system` — 관리자 배치 (퀘스트 썸네일, 구역 이미지)
- `mock` — 퀘스트·구 폴백용 랜덤 mock 이미지 풀
- `profile_mock` — 프로필 미설정 시 기본 아바타 풀 (seed 기반 결정론적 선택)
:::

### feed_posts
| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | UUID PK | 게시글 ID |
| `user_id` | UUID FK | 작성자 |
| `ride_session_id` | UUID FK (nullable) | 연결된 라이딩 세션 |
| `content` | TEXT | 본문 (`#해시태그` 포함) |
| `image_content_id` | UUID FK→contents | 첨부 이미지 |
| `like_count` | INT | 좋아요 수 |
| `comment_count` | INT | 댓글 수 |
| `is_story` | BOOL | 스토리 여부 |
| `latitude` | DECIMAL | 게시 위치 위도 (nullable) |
| `longitude` | DECIMAL | 게시 위치 경도 (nullable) |
| `district_id` | INT FK→districts | 구역 (nullable) |
| `created_at` | TIMESTAMPTZ | 생성일 |

### user_follows
| 컬럼 | 타입 | 설명 |
|---|---|---|
| `follower_id` | UUID FK PK | 팔로우 하는 사용자 |
| `following_id` | UUID FK PK | 팔로우 받는 사용자 |
| `created_at` | TIMESTAMPTZ | 팔로우 시각 |

### dm_conversations
| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | UUID PK | 대화방 ID |
| `user_a_id` | UUID FK | 참여자 A |
| `user_b_id` | UUID FK | 참여자 B |
| `last_message_at` | TIMESTAMPTZ | 마지막 메시지 시각 |
| `created_at` | TIMESTAMPTZ | 대화 시작일 |

### dm_messages
| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | UUID PK | 메시지 ID |
| `conversation_id` | UUID FK | 대화방 |
| `sender_id` | UUID FK | 발신자 |
| `content` | TEXT | 내용 |
| `read_at` | TIMESTAMPTZ (nullable) | 읽은 시각 |
| `created_at` | TIMESTAMPTZ | 전송 시각 |

### quests
| 컬럼 | 타입 | 설명 |
|---|---|---|
| `id` | UUID PK | 퀘스트 ID |
| `title` | VARCHAR | 제목 (ko 기준) |
| `period` | ENUM | DAILY / WEEKLY / EVENT |
| `district` | VARCHAR | HCM 구 (17개 enum 값) |
| `hero_image_url` | TEXT | 이미지 URL (레거시 폴백, 신규 쓰기 금지) |
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

초기 스키마 파일: `database/init/001_init_schema.sql` ~ `023_dm_messages.sql`  
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
| `008~014` | 마스터 데이터, 라이더 타입, 안전 등급 FK 등 |
| `015_admin_seed.sql` | admin 가상 유저 (`id=00000000-…-0001`) 시드 |
| `016` | 추가 마스터 데이터 |
| `017_feed_image_content.sql` | `feed_posts.image_content_id` FK |
| `018_profile_mock_enum.sql` | `content_owner_type` enum에 `profile_mock` 추가 |
| `019_profile_mock_seed.sql` | profile_mock 풀 6장 시드 |
| `020_feed_location.sql` | `feed_posts.latitude`, `longitude`, `district_id` 컬럼 |
| `021_user_follows.sql` | `user_follows` 테이블 |
| `022_dm_conversations.sql` | `dm_conversations` 테이블 |
| `023_dm_messages.sql` | `dm_messages` 테이블 |

:::caution 수동 적용 필요
`database/init/` 파일은 컨테이너 최초 기동 시에만 자동 실행됩니다.  
기존 환경에서 신규 마이그레이션을 적용하려면 수동으로 실행해야 합니다:
```bash
docker exec -i saigon_db psql -U $DB_USER -d $DB_NAME < database/init/020_feed_location.sql
# 021 ~ 023도 동일하게 적용
```
:::
