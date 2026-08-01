# 기본 프로필 이미지 풀 (profile_mock) 도입 (260516)

> 모든 유저의 기본 아바타가 단일 이미지로 동일하던 문제 해결.
> `owner_type='profile_mock'` 컨텐츠 풀 + seed(user_id) 결정론적 선택.

## 결과

단일 `saigon-default.jpg` 폴백 → 6장 풀(`saigon-default.jpg` + `profile-mock-01~05.png`). 프로필 사진이 없는 유저는 `user_id` seed 로 풀에서 결정론적으로 1장을 받아 서로 다른 기본 아바타를 가진다. 등록된 프로필 사진이 있으면 그대로 우선. 프론트·관리자 모두 BFF resolver 경유라 별도 코드 변경 없이 일괄 반영.

## 신규 / 수정 파일

| 영역 | 경로 | 비고 |
|---|---|---|
| 마이그레이션 | `database/init/018_profile_mock_content.sql` | `content_owner_type` enum 에 `profile_mock` 추가, `saigon-default.jpg` 등록 |
| 마이그레이션 | `database/init/019_profile_mock_seed.sql` | `profile-mock-01~05.png` 5장 등록 |
| 이미지 | `contents/system/profile-mock/` | `saigon-default.jpg` + `profile-mock-01~05.png` (1024×1024 라이더 테마 아바타) |
| 모델 | `backend/app/models.py` | `_content_owner_type_enum` 에 `profile_mock` 추가 |
| 라우터 | `backend/app/routers/contents.py` | `_serve_pool_image()` 헬퍼, `GET /contents/profile-mock-img` 엔드포인트 |
| 유틸 | `backend/app/utils.py` | `PROFILE_MOCK_ENDPOINT`, `default_avatar_url(seed)` 재정의 (단일 파일 → 풀 엔드포인트). `DEFAULT_AVATAR_FILE_PATH` 제거 |
| 라우터 | `backend/app/routers/feed.py` | `_enrich`/`_enrich_comment` 의 무유저 폴백에 seed 전달 |

## 설계 결정

- **서빙 메커니즘**: `getMockImg`(`/contents/mock-img`) 와 동일 — `_serve_pool_image(owner_type, w, h, seed)` 공통 헬퍼. seed 있으면 `uuid.int % len(pool)` 결정론적, 없으면 랜덤. `mock`(퀘스트용) 과 `profile_mock`(아바타용) 두 엔드포인트가 헬퍼 공유.
- **resolver 일원화**: `resolve_avatar_url(user)` 폴백이 `default_avatar_url(seed=user.id)` 호출 → `{BFF_PUBLIC_URL}/contents/profile-mock-img?w=240&h=240&seed=<user_id>`. DB 에 `avatar_content_id`/`avatar_url` 이 있으면 그것이 우선 (기본 이미지 ≠ 등록된 프로필 사진).
- **프론트·관리자 무변경**: 양쪽 모두 BFF 가 내려준 아바타 URL 을 그대로 `<img src>` 에 사용. resolver 만 바꾸면 일괄 반영.
- **파일 위치**: `contents/system/profile-mock/`. 시드 파일이라 사람이 읽을 수 있는 이름 유지.

## 검증

```
019 적용 → profile_mock 풀 6장
seed 6종 → 6장 모두 분산 선택 확인 (결정론적)
imgproxy 최종 서빙 200 image/png
/api/feed user_avatar_url → profile-mock-img?seed=<user_id> 확인
```

## 후속

- ⚠ 마이그레이션 018·019 는 `database/init/` 자동 실행이 안 된 기존 환경에서 수동 적용 필요.
- 풀에 이미지를 추가하려면 `contents/system/profile-mock/` 에 파일 배치 후 `contents` 테이블에 `owner_type='profile_mock'` INSERT 만 하면 됨 (코드 변경 불필요).
