# 피드 소셜 기능 확장 (12차)

> 완료: 2026-05-16

## 개요

피드에 소셜 기능(팔로우, DM, 위치기반 필터, 피드 작성)을 추가하고 피드 헤더 UI를 재구성.

## 구현 범위

### DB 마이그레이션 (020–023)

| 파일 | 내용 |
|------|------|
| `020_feed_location.sql` | `feed_posts`에 `latitude`, `longitude`, `district_id` 추가 + PostGIS 공간 인덱스 |
| `021_user_follows.sql` | `user_follows` 테이블 (composite PK, 자기팔로우 방지 CHECK) |
| `022_dm_conversations.sql` | `dm_conversations` 테이블 (participant 정규화 CHECK) |
| `023_dm_messages.sql` | `dm_messages` 테이블 (read_at, image_content_id FK) |

### 백엔드

- **모델**: `UserFollow`, `DmConversation`, `DmMessage` 신규 + `FeedPost` 위치 컬럼 확장
- **스키마**: `FollowUserOut`, `FollowCountsOut`, `DmConversationOut`, `DmMessageOut` 등
- **라우터 신규 2개**:
  - `follows.py` — POST/DELETE /follows/{user_id}, GET /users/{user_id}/followers|following|follow-counts
  - `dm.py` — GET/POST /dm/conversations, GET/POST /dm/conversations/{id}/messages, POST /dm/conversations/{id}/read
- **피드 라우터 확장**: `filter=neighborhood` → PostGIS ST_DWithin(5km), `filter=friends` → user_follows 서브쿼리

### 프론트엔드

- **TopBar 확장**: `leftContent` prop 추가
- **피드 헤더 재구성**: 좌측 `+` 버튼 → `/feed/new`, 우측 프로필 아이콘 → `/profile`, DM 아이콘 → `/dm`
- **신규 페이지 5개**: FeedCreate, DmList, DmDetail, FollowerList, FollowingList
- **ProfileMain**: 팔로워/팔로잉 카운트 + 네비게이션
- **i18n**: ko/en/vi에 `feedCreate`, `dm`, `follow` 키 추가
- **라우트**: `/feed/new`, `/dm`, `/dm/:conversationId`, `/followers/:userId`, `/following/:userId`

## 주요 파일

| 구분 | 파일 |
|------|------|
| DB | `database/init/020~023_*.sql` |
| 백엔드 수정 | `models.py`, `schemas.py`, `routers/feed.py`, `main.py` |
| 백엔드 신규 | `routers/follows.py`, `routers/dm.py` |
| 프론트 수정 | `TopBar.tsx`, `FeedList.tsx`, `ProfileMain.tsx`, `api/feed.ts`, `api/types.ts`, `App.tsx` |
| 프론트 신규 | `FeedCreate.tsx`, `DmList.tsx`, `DmDetail.tsx`, `FollowerList.tsx`, `FollowingList.tsx`, `api/follows.ts`, `api/dm.ts` |

## 검증 결과

- 마이그레이션 020-023 적용 완료
- BFF 컨테이너 빌드 + 기동 확인 (health OK)
- 프론트엔드 빌드 + 기동 확인 (port 5174 서빙)
- API 응답 확인: `/api/users/{id}/follow-counts` 200, `/api/dm/conversations` 200, `/api/feed?filter=all` 200
