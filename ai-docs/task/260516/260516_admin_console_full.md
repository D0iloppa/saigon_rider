# 관리자 콘솔 — 전체 기능 구현 (260516)

> 기존 `dashboard.html` + `login.html` 만 있던 admin 콘솔에 5개 메뉴(대시보드 / 퀘스트 / 피드 / 유저 / 설정) 전체 구현.

## 결과

5개 메뉴 + 사이드바 공통 레이아웃 + 관리자 시드 user 도입까지 단일 세션에서 완수. 7개 admin 페이지 모두 HTTP 200 + 핵심 동작(피드 등록 [이미지], 퀘스트 등록, 아바타 업로드) 스모크 검증 통과.

## 신규 / 수정 파일

| 영역 | 경로 | 비고 |
|---|---|---|
| 라우터 | `backend/app/routers/admin.py` | quest CRUD, feed CRUD, user list, settings, layout 헬퍼 추가 |
| 템플릿 | `backend/app/templates/admin/_layout.html` | 사이드바 공통 wrap (5 메뉴 + 로그아웃) |
| 템플릿 | `backend/app/templates/admin/dashboard.html` | 본문만 남도록 리팩토링, total_feeds 카드 추가 |
| 템플릿 | `backend/app/templates/admin/quests_list.html` | 신규 — 리스트 + 검색/필터 |
| 템플릿 | `backend/app/templates/admin/quests_form.html` | 신규 — 등록/수정 공용 |
| 템플릿 | `backend/app/templates/admin/feed_list.html` | 신규 |
| 템플릿 | `backend/app/templates/admin/feed_form.html` | 신규 — 관리자 피드 게시 (이미지) |
| 템플릿 | `backend/app/templates/admin/users_list.html` | 신규 |
| 템플릿 | `backend/app/templates/admin/settings.html` | 신규 — 관리자 프로필 이미지 |
| 마이그레이션 | `database/init/015_admin_seed.sql` | 신규 — 가상 admin user 시드 (`id=00000000-0000-0000-0000-000000000001`, `phone='__admin__'`) |

## 추가된 admin 라우트

```
GET  /admin/dashboard                  대시보드 (총 유저/신규7일/활성퀘스트/오늘 라이딩/총 피드)
GET  /admin/quests                     퀘스트 리스트 (?q=, ?period=, ?active=, ?page=)
GET  /admin/quests/new                 퀘스트 신규 폼
POST /admin/quests/new                 퀘스트 신규 (multipart, 썸네일)
GET  /admin/quests/{id}/edit           퀘스트 수정 폼
POST /admin/quests/{id}/edit           퀘스트 수정 (보상 정보 포함)
POST /admin/quests/{id}/delete         퀘스트 삭제
GET  /admin/feed                       피드 리스트 (?page=)
GET  /admin/feed/new                   관리자 피드 게시 폼
POST /admin/feed/new                   관리자 피드 게시 (multipart, 이미지 첨부 옵션)
POST /admin/feed/{id}/delete           피드 삭제
GET  /admin/users                      유저 리스트 (?q=, ?page=) — 닉네임/전화번호 부분일치
GET  /admin/settings                   관리자 계정/프로필
POST /admin/settings/avatar            관리자 프로필 이미지 업로드 → users.avatar_url
```

## 설계 결정

- **관리자 DB 표현**: `users` 테이블에 가상 admin 1행 시드 (`id=00000000-0000-0000-0000-000000000001`, `phone='__admin__'`). `feed_posts.user_id` FK 충족 + 향후 ADMIN 표시 일관성 확보. ENV `ADMIN_USER_ID` 로 override 가능.
- **레이아웃**: Jinja2 도입 없이 기존 `_render()` 단순 치환 컨벤션 유지. `_render_page(name, nav, page_title, **ctx)` 가 본문 partial 을 `_layout.html` 에 wrap.
- **이미지 업로드**: 별도 헬퍼 `_save_uploaded_image()` 가 `contents/upload` 와 동일 경로 규칙(`system/`, `user-contents/{Y}/{M}/`) 사용. 퀘스트 썸네일은 `contents` row 생성 후 `quests.thumbnail_content_id` 연결. 피드 이미지는 imgproxy URL 을 `feed_posts.image_url` 에 직접 저장 (기존 피드 모델 그대로).
- **퀘스트 폼 노출 범위**: 필수 + 보상 + i18n 제목 + period/district/badge/active/기간 + 썸네일. `rider_type_id`, `min_safety_grade_id` 는 마이그레이션 014 의 자동 매핑 정책에 위임.
- **CSRF**: 현재 미적용 (단일 admin, JWT cookie). 외부 노출 시 추가 필요.

## 검증

```
login POST  302
/admin/dashboard 200 (12k)
/admin/quests    200 (20k)
/admin/quests/new 200 (15k)
/admin/feed      200 (11k)
/admin/feed/new  200 (10k)
/admin/users     200 (15k)
/admin/settings  200 (11k)
feed POST (image) → 302 → 리스트에 노출 확인
quest POST (image) → 302 → 리스트에 노출 확인
avatar POST → 302 → ?uploaded=1 플래시 노출 확인
```

## 후속

- 퀘스트 생성 시 `period_key` 는 quest 모델 차원에서는 비어있고 user_quests 단계에서 채워지므로, 관리자 폼 추가 노출 불필요.
- 통계 대시보드를 더 풍부하게 (구별·일자별 차트) 하려면 별도 태스크.
- CSRF 토큰, 권한 분리(operator vs admin) 는 현 단계 범위 외.
