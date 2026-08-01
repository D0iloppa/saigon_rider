# 관리자 콘솔 — 콘텐츠 contents 중개 / 피드 CRUD 보강 (260516)

> [관리자 콘솔 전체 구현](260516_admin_console_full.md) 후속 — 기능 오류 6종 수정.
> 핵심 원칙: **모든 콘텐츠는 `contents` 테이블로 중개되고 `content_id` 로 매핑된다 (관리자·프론트 공통).**

## 결과

피드/프로필 이미지가 imgproxy URL 을 컬럼에 직접 저장하던 방식 → `content_id` 저장 + 출력 시 해석 방식으로 전환. 관리자 피드 리스트를 인스타그램 카드형으로 재구성하고 수정 기능을 추가. 8개 admin 페이지 200 + 피드 CRUD(이미지) 스모크 검증 통과.

## 수정 항목 (요구사항 6종)

| # | 요구 | 처리 |
|---|---|---|
| 1 | 사용자 프로필 이미지 = 프론트 default 이미지 참조 | admin 의 mock-seed 폴백 제거 → `resolve_avatar_url()` (contents > 레거시 url > `default_avatar_url()`) |
| 2 | 피드 사진 등록 → contents 중개 | `admin_feed_create` 가 `feed_posts.image_content_id` 저장 (URL 직접 저장 폐지) |
| 3 | 프로필 사진 등록 → contents 중개 | `admin_settings_avatar` / `profile.upload_avatar` 가 `avatar_content_id` 만 저장 (`avatar_url` 쓰기 폐지) |
| 4 | 피드 리스트 인스타형 + 등록/수정/삭제 + 해시태그 | `feed_list.html` 카드 그리드 재작성, `/admin/feed/{id}/edit` GET·POST 신설, `_render_caption()` 해시태그 강조 |
| 5 | 퀘스트 이미지 우선순위 | `quests._to_out` / `admin._resolve_thumb_url` 체인을 `thumbnail_content > district.image_content > mock` 으로 축소 (`hero_image_url`·`district.image_url` 제거) |
| 6 | 모든 콘텐츠 contents 중개 + id 매핑 (관리자·프론트 공통) | 마이그레이션 017, 모델 관계, 스키마 resolver 로 BFF 출력 일원화 |

## 신규 / 수정 파일

| 영역 | 경로 | 비고 |
|---|---|---|
| 마이그레이션 | `database/init/017_feed_image_content.sql` | 신규 — `feed_posts.image_content_id UUID FK` |
| 모델 | `backend/app/models.py` | `FeedPost.image_content`, `User.avatar_content` 관계 추가 (avatar_content_id 에 FK 명시) |
| 유틸 | `backend/app/utils.py` | `resolve_avatar_url()`, `resolve_feed_image_url()` 신규 |
| 스키마 | `backend/app/schemas.py` | `UserOut`/`FeedPostOut` model_validator 로 콘텐츠 해석, `FeedCreateRequest.image_content_id` 추가 |
| 라우터 | `backend/app/routers/admin.py` | 피드 카드 리스트·수정 CRUD, 콘텐츠 중개, 아바타 default, 퀘스트 썸네일 체인 |
| 라우터 | `backend/app/routers/feed.py` | `_enrich` 콘텐츠 해석, `create_feed_post` image_content_id 지원 |
| 라우터 | `backend/app/routers/profile.py` | `upload_avatar` content_id 만 저장 |
| 라우터 | `backend/app/routers/quests.py` | `_to_out` 썸네일 체인 축소, 참여자 아바타 `resolve_avatar_url` |
| 라우터 | `backend/app/routers/auth.py` | register 후 재조회 (UserOut 직렬화 시 `avatar_content` selectin 로드) |
| 템플릿 | `backend/app/templates/admin/feed_list.html` | 인스타형 카드 그리드 재작성 |
| 템플릿 | `backend/app/templates/admin/feed_form.html` | 신규/수정 공용 + 해시태그 안내 |

## 설계 결정

- **URL 해석 위치**: DB 는 `content_id` 만 저장, BFF 출력 시점에 imgproxy URL 로 해석. quests/districts 의 기존 `_to_out` 패턴과 동일.
- **레거시 `image_url`/`avatar_url` 컬럼**: 폴백으로 유지 (resolver 우선순위 = content_id > 레거시 url > default). 신규 쓰기는 금지.
- **async lazy-load 회피**: `UserOut`/`FeedPostOut` 가 관계(`avatar_content`/`image_content`)를 참조하므로, commit 후 직렬화하는 엔드포인트(register/update_nickname/save_profile/upload_avatar/create_feed_post)는 `db.refresh` 대신 재조회(selectin 로드 보장).
- **해시태그**: 별도 필드 없이 본문 텍스트 내 `#태그` 를 정규식(`#[^\s#.,!?]+`, 한글 허용) 으로 추출·강조. 인스타그램 캡션 방식.
- **피드 이미지 owner_type**: `user` + `ADMIN_USER_ID` (피드는 유저 콘텐츠).

## 검증

```
8개 admin 페이지 200
/api/feed 200 — image_content_id → imgproxy URL 해석 확인
피드 등록(이미지) → 302, image_content_id 저장 확인
피드 수정 GET 200 (본문·현재이미지 prefill) / POST 302
피드 삭제 → 302
admin 아바타 업로드 → 302, avatar_content_id 저장 / avatar_url 미기록 확인
```

## 후속

- ⚠ 마이그레이션 017 은 `database/init/` 자동 실행이 안 된 기존 환경에서 수동 적용 필요:
  `docker exec -i saigon_db psql -U $DB_USER -d $DB_NAME < database/init/017_feed_image_content.sql`
- 레거시 `feed_posts.image_url` / `users.avatar_url` 잔존 값은 read-only 폴백으로만 사용 — 정리 마이그레이션은 별도 태스크 시 진행.
- 프론트 피드 작성 UI 에서 이미지 첨부 시 `/contents/upload` → `image_content_id` 전달 경로는 프론트 작업 필요 (BFF 는 이미 지원).
