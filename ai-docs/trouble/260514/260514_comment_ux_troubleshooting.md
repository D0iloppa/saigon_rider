# 댓글 UX 3종 트러블슈팅

> 작성일: 2026-05-14  
> 발견 경위: 260514 Human UX 점검 중 [FEED-001] 댓글 BottomSheet 직접 확인  
> 관련 기능 ID: F-09-6a · F-09-6b · F-09-6c  

---

## 원인 1 — 댓글 목록에 닉네임 대신 user_id(UUID) 노출

### 증상
댓글 BottomSheet를 열면 작성자 이름란에 닉네임(`thanh_rider`) 대신  
UUID 형태의 user_id(`3f2e1d0c-...`)가 그대로 노출됨.

### 원인
`GET /feed/{post_id}/comments` BFF 핸들러(`feed.py:get_comments`)가  
`PostComment` 테이블만 SELECT하고 `users` 테이블을 JOIN하지 않아  
`user_nickname` 필드가 응답에 포함되지 않음.

프론트 `transformComment()`는 `raw.user_nickname ?? raw.user_id ?? 'unknown'`  
fallback 로직으로 user_id를 표시.

`CommentOut` 스키마에도 `user_nickname`, `user_avatar_url` 필드 자체가 없었음.

### 조치
**BFF `backend/app/schemas.py`**: `CommentOut`에 `user_nickname: str | None = None`, `user_avatar_url: str | None = None` 필드 추가.

**BFF `backend/app/routers/feed.py`**:
- `_enrich_comment(comment, user)` 헬퍼 함수 신설 — `_enrich()` 패턴과 동일하게 `user.nickname`, `user.avatar_url` 매핑
- `get_comments()` SELECT를 `PostComment, User` JOIN(`outerjoin(User, PostComment.user_id == User.id)`)으로 변경
- `post_comment()` 응답도 `_enrich_comment()` 경유로 통일

```python
# 변경 전
select(PostComment).where(PostComment.post_id == post_id)

# 변경 후
select(PostComment, User)
    .outerjoin(User, PostComment.user_id == User.id)
    .where(PostComment.post_id == post_id)
```

---

## 원인 2 — 댓글 프로필 사진 미표시 (`<img src="undefined">`)

### 증상
댓글 목록의 아바타 이미지가 모두 파손(broken image)으로 표시됨.  
피드 카드의 아바타는 동일한 imgproxy URL 방식으로 정상 표시됨.

### 원인
원인 1과 동일 — BFF 댓글 응답에 `user_avatar_url` 미포함.  
프론트 `transformComment()`에서 `raw.user_avatar_url ?? undefined` → `undefined`.  
`<img src={c.userAvatarUrl}>` → `<img src="undefined">` → 404.

### 조치
원인 1의 BFF JOIN 수정으로 함께 해결.  
`_enrich_comment()`에서 `default_avatar_url()` fallback 적용  
(`user.avatar_url if user and user.avatar_url else default_avatar_url()`)  
— 사용자 아바타가 null이어도 기본 이미지 보장.

---

## 원인 3 — 댓글 좋아요 버튼 무반응

### 증상
댓글 목록의 ♥ 버튼 클릭 시 카운트 변화 없음, 네트워크 호출 없음.

### 원인 (2건 동시)

**① 프론트**: `FeedList.tsx:216` `<button className={styles.commentLike}>` 에 `onClick` 핸들러 없음.  
`handleCheer`(게시물 좋아요)와 달리 댓글 좋아요 handler 자체가 미구현 상태.

**② BFF**: `POST /feed/{post_id}/comments/{comment_id}/like` 엔드포인트 자체 미존재.  
게시물 좋아요(`POST /feed/{post_id}/like`)는 있었으나 댓글용은 누락.  
`PostComment` 모델에 `like_count` 컬럼도 없었음.

### 조치

**DB 마이그레이션** (`database/init/004_comment_likes.sql` 추가 + 운영 DB에 직접 적용):
```sql
ALTER TABLE post_comments ADD COLUMN IF NOT EXISTS like_count INTEGER NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS post_comment_likes (
    comment_id  UUID  PRIMARY KEY REFERENCES post_comments(id) ON DELETE CASCADE,
    user_id     UUID  NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    PRIMARY KEY (comment_id, user_id)
);
```

**BFF `backend/app/models.py`**:
- `PostComment`에 `like_count: Mapped[int]` 필드 추가
- `PostCommentLike` 모델 신설 (`post_likes`와 동일 패턴)

**BFF `backend/app/routers/feed.py`**:
- `toggle_comment_like()` 엔드포인트 신설 (`POST /{post_id}/comments/{comment_id}/like`)
- `PostCommentLike` toggle 로직 — 기존 `toggle_like()`와 동일 패턴 적용

**프론트 `frontend/src/api/feed.ts`**:
- `toggleCommentLike(postId, commentId)` 함수 신설

**프론트 `frontend/src/api/types.ts`**:
- `Comment` 인터페이스에 `iLiked: boolean` 필드 추가

**프론트 `frontend/src/pages/feed/FeedList.tsx`**:
- `handleCommentLike(c, e)` 핸들러 추가 → `toggleCommentLike()` 호출 후 해당 댓글 state 갱신
- 댓글 ♥ 버튼에 `onClick={handleCommentLike}` 연결
- `iLiked` 상태일 때 `styles.commentLikeActive` CSS class 적용

**프론트 `frontend/src/pages/feed/FeedList.module.css`**:
- `.commentLikeActive { color: var(--brand); }` 추가

---

## 확인

```bash
# BFF 댓글 목록 — user_nickname, user_avatar_url 포함 여부
curl http://localhost:18090/api/bff/feed/{post_id}/comments

# BFF 댓글 좋아요 토글
curl -X POST http://localhost:18090/api/bff/feed/{post_id}/comments/{comment_id}/like \
  -H "Content-Type: application/json" \
  -d '{"user_id": "<uuid>"}'
# → {"liked": true, "like_count": 1}

# DB 확인
docker exec saigon_db psql -U wellconn -d saigon_rider -c \
  "SELECT like_count FROM post_comments LIMIT 5;"
docker exec saigon_db psql -U wellconn -d saigon_rider -c \
  "SELECT COUNT(*) FROM post_comment_likes;"
```
