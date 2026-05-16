# 워크플로우: system-contents-upload

> 시스템 관리 이미지(district, quest 썸네일 등)를 추가·교체할 때 따르는 절차.

## 트리거 상황

- district 대표 이미지 추가/교체
- quest 썸네일 이미지 추가/교체
- 기타 시스템 관리 이미지 신규 등록

---

## 아키텍처

```
클라이언트 → GET /api/contents/{content_id}/img?w=800&h=450
           → BFF: contents 테이블에서 file_path 조회
           → 302 redirect → imgproxy → 파일시스템(/data/...)
```

- `contents` 테이블이 파일 경로의 단일 진실 공급원(SoT)
- 클라이언트는 **content_id만** 알면 이미지 서빙 가능
- imgproxy는 `contents/` → `/data/` 볼륨 마운트로 접근
- `IMGPROXY_LOCAL_FILESYSTEM_ROOT=/data` → `local:///system/...` 으로 참조

---

## 디렉터리 구조

```
contents/system/
  districts/          ← district 대표 이미지
    {district-code}.jpg     (예: quan-1.jpg, phu-nhuan.jpg)
  quests/             ← quest 썸네일
    {quest-slug}.jpg        (예: q-ben-thanh-loop.jpg)
  saigon-default.jpg  ← 폴백 이미지
```

> **신규 업로드 (API)**: 파일명 = content_id UUID (예: `system/{uuid}.jpg`)  
> **기존 시드 파일**: 사람이 읽을 수 있는 이름 그대로 유지

---

## owner_type 구분

| owner_type | owner_id | 저장 경로 | 설명 |
|---|---|---|---|
| `system` | NULL | `system/` | 관리자 직접 배치 또는 API 업로드 |
| `user` | user UUID | `user-contents/{year}/{month}/` | 유저 업로드 (프로필 사진, 피드 등) |

---

## 서빙 URL 패턴

| 방식 | URL | 용도 |
|---|---|---|
| BFF redirect | `GET /api/contents/{content_id}/img?w=800&h=450` | **권장** — 클라이언트는 content_id만 알면 됨 |
| 직접 imgproxy | `https://saigon.doil.me/img/insecure/rs:fill:800:450:1/local:///{file_path}` | 개발/디버깅용 |

> `IMGPROXY_KEY` / `IMGPROXY_SALT` 미설정 시 `/insecure/` 경로 사용 가능 (개발 전용).  
> 운영 배포 전 서명 방식으로 전환 필요.

---

## 절차

### 1. 이미지 파일 배치

파일을 `contents/system/{category}/` 하위에 직접 복사.  
imgproxy는 파일시스템을 실시간으로 읽으므로 컨테이너 재시작 불필요.

### 2. DB 등록

`012_system_contents_seed.sql` 패턴 참고하여 `contents` 테이블에 INSERT:

```sql
INSERT INTO contents (owner_type, file_path, mime_type, original_filename)
VALUES ('system', 'system/districts/new-district.jpg', 'image/jpeg', 'new-district.jpg');
```

district 이미지인 경우 `districts.image_content_id` 도 업데이트:

```sql
UPDATE districts SET image_content_id = (
    SELECT id FROM contents WHERE file_path = 'system/districts/new-district.jpg'
) WHERE code = 'NEW_DISTRICT';
```

quest 썸네일인 경우 `quests.thumbnail_content_id` 업데이트:

```sql
UPDATE quests SET thumbnail_content_id = (
    SELECT id FROM contents WHERE file_path = 'system/quests/q-new-quest.jpg'
) WHERE id = '{quest_uuid}';
```

### 3. 검증

```bash
# content_id 확인
SELECT id, file_path FROM contents WHERE owner_type = 'system' ORDER BY created_at DESC LIMIT 10;

# BFF redirect 확인
curl -I https://saigon.doil.me/api/contents/{content_id}/img
# → HTTP 302 + Location: https://saigon.doil.me/img/insecure/...
```

---

## 관련 코드

| 파일 | 역할 |
|---|---|
| `backend/app/routers/contents.py` | `/contents/{id}/img` redirect 엔드포인트, 업로드 |
| `backend/app/utils.py` | `build_imgproxy_url(file_path, options)` |
| `backend/app/models.py` | `District.image_content_id`, `Quest.thumbnail_content_id` |
| `backend/app/schemas.py` | `DistrictOut` — image_content에서 image_url 자동 resolve |
| `backend/app/routers/quests.py` | `_to_out()` — thumbnail_content → imgproxy URL |
| `database/init/011_district_image_content.sql` | districts 테이블 마이그레이션 |
| `database/init/012_system_contents_seed.sql` | 시스템 이미지 초기 시드 |

---

## 현재 등록된 파일 목록

| 파일 | 용도 |
|---|---|
| `districts/quan-1.jpg` | Quận 1 대표 이미지 |
| `districts/phu-nhuan.jpg` | Phú Nhuận 대표 이미지 |
| `districts/thu-duc.jpg` | Thủ Đức 대표 이미지 |
| `districts/binh-thanh.jpg` | Bình Thạnh 대표 이미지 |
| `districts/quan-7.jpg` | Quận 7 대표 이미지 |
| `quests/q-ben-thanh-loop.jpg` | Bến Thành Midnight Loop 썸네일 |
| `quests/q-phu-nhuan-cafe.jpg` | Phú Nhuận 카페 5곳 투어 썸네일 |
| `quests/q-thu-duc-sprint.jpg` | Thủ Đức 출근 스프린트 썸네일 |
| `quests/q-bui-vien-sweep.jpg` | Bùi Viện Night Sweep 썸네일 |
| `quests/q-binh-thanh-market.jpg` | Bình Thạnh 새벽시장 라이딩 썸네일 |
| `quests/q-quan-7-bridge.jpg` | Quận 7 다리 5개 라이드 썸네일 |
| `saigon-default.jpg` | 폴백 이미지 |
