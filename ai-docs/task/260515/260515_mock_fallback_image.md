# Task: Mock Fallback 이미지 시스템

**날짜**: 2026-05-15  
**목적**: 퀘스트/district 이미지가 없을 때 Saigon Rider 분위기의 mock 이미지를 랜덤 서빙

---

## Fallback 체인

```
quest.thumbnail_content
  → quest.district.image_content
  → GET /api/bff/contents/mock-img  (랜덤 mock 이미지)
```

---

## 작업 목록

### [x] 1. 이미지 준비 & 업로드
- AI로 mock 이미지 5개 생성 (프롬프트는 태스크 하단 참고)
- `contents/system/mock/` 하위에 파일 배치
  - `mock-01.jpg` ~ `mock-05.jpg`

### [x] 2. DB: owner_type enum에 'mock' 추가
- 마이그레이션 파일: `database/init/013_mock_content_type.sql`
- `content_owner_type` ENUM에 `'mock'` 값 추가
- `contents` 테이블에 mock 이미지 5개 INSERT

### [x] 3. BFF: 모델 & 엔드포인트 추가
- `backend/app/models.py`: `Content.owner_type` enum에 `'mock'` 반영
- `backend/app/routers/contents.py`: `GET /contents/mock-img` 엔드포인트
  - DB에서 `owner_type = 'mock'` 목록 조회
  - 랜덤 1개 선택 → imgproxy URL로 302 redirect

### [x] 4. 퀘스트 fallback 체인 연결
- `backend/app/routers/quests.py` `_to_out()` 수정
  - district image도 없으면 `/api/bff/contents/mock-img` URL을 `thumbnail_url`로 세팅

### [x] 5. BFF 재배포 & 검증
- `docker compose ... up --build -d bff`
- district 없는 퀘스트에서 mock 이미지 랜덤 서빙 확인
- 여러 번 호출 시 다른 이미지 반환 확인

---

## 이미지 생성 프롬프트

공통 스타일 suffix (모든 프롬프트에 추가):
```
Vietnam street photography style, cinematic color grading, warm amber and 
deep teal tones, shallow depth of field, authentic Ho Chi Minh City atmosphere, 
16:9 aspect ratio, photorealistic.
```

### mock-01.jpg — 새벽 골목 라이딩
```
A lone motorbike rider cruising through a narrow alley in Saigon at dawn, 
steam rising from street food stalls just opening, golden morning light 
cutting through low-rise buildings, wet pavement reflecting warm light.
[+ 공통 suffix]
```

### mock-02.jpg — 야간 교차로
```
Busy intersection in Ho Chi Minh City at night, dozens of motorbikes 
streaming through, neon signs and traffic lights painting the wet road 
in red and green, long exposure motion blur on vehicles, overhead shot.
[+ 공통 suffix]
```

### mock-03.jpg — 강변 노을
```
Motorbike parked on the bank of Saigon River at golden hour, rider 
sitting on the bike looking at the sunset skyline, silhouette composition, 
Phu My bridge visible in soft bokeh background, orange and pink sky.
[+ 공통 suffix]
```

### mock-04.jpg — 카페 골목
```
Charming Vietnamese coffee shop alley in Saigon, a row of vintage motorbikes 
parked outside small cafes with hanging plants and fairy lights, afternoon 
light dappling through tropical trees, peaceful neighborhood atmosphere.
[+ 공통 suffix]
```

### mock-05.jpg — 시장 새벽
```
Early morning wet market scene in Saigon, 5am, vendors on motorbikes 
arriving with fresh produce, lanterns and fluorescent lights mixing in 
the blue pre-dawn air, authentic street life energy, documentary style.
[+ 공통 suffix]
```

---

## 파일 업로드 위치

```
contents/system/mock/
  mock-01.jpg
  mock-02.jpg
  mock-03.jpg
  mock-04.jpg
  mock-05.jpg
```

이미지 생성 후 해당 경로에 업로드하면 DB 등록 및 엔드포인트 구현 진행.
