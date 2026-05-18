# AppImage 폴백 실패 시 무한 Shimmer

> 260518 · 상태: 🔧 진행중

## 증상

퀘스트 목록에서 썸네일 이미지가 최종 폴백(`/contents/mock-img`)까지 도달한 뒤, 해당 URL이 로드 실패하면 `AppImage` 컴포넌트가 영원히 shimmer(스켈레톤) 상태로 남는다.

스크린샷: 퀘스트 카드의 썸네일 영역이 빈 shimmer 박스로 표시됨.

## 원인 분석

### 1. `AppImage` 컴포넌트에 `onError` 핸들러 부재

```
// frontend/src/components/ui/AppImage.tsx
// loaded 상태는 onLoad 콜백에서만 true로 전환
// onError 시 아무 처리 없음 → loaded=false 영구 유지 → shimmer 무한
```

### 2. 폴백 체인 구조 (backend/app/routers/quests.py:52-63)

```
1. thumbnail_content (자체 이미지)       → imgproxy URL
2. district.image_content (구역 이미지)  → imgproxy URL
3. MOCK_IMG_ENDPOINT?seed={quest.id}     → 302 → imgproxy URL (최종)
```

3번이 실패하는 경우:
- DB에 `owner_type='mock'` 컨텐츠가 없으면 404
- mock 컨텐츠는 있지만 imgproxy가 실제 파일을 찾지 못하면 로드 실패

### 3. mock-img의 자기참조 폴백 부재

mock-img URL 자체가 실패했을 때 프론트엔드에서 재시도하거나 대체 이미지를 보여주는 메커니즘이 없다. 한 번 실패하면 영구 shimmer.

## 영향 범위

- `AppImage` 컴포넌트를 사용하는 모든 곳 (퀘스트 카드, 피드 이미지 등)
- 특히 mock 폴백에 의존하는 초기 데이터(mock 이미지 미등록 상태)에서 100% 재현

## 해결 방법

**폴백 체인 배열 방식** 적용:

1. **백엔드 (`routers/quests.py`)** — `_to_out()`이 단일 URL 대신 체인 배열 빌드
   - `thumbnail_urls: [thumbnail_content → hero_image_url → district.image_content → mock-img]`
   - `thumbnail_url` 은 `chain[0]` 으로 하위호환 유지
2. **백엔드 (`schemas.py`)** — `QuestOut`에 `thumbnail_urls: list[str]` 필드 추가
3. **프론트 (`AppImage.tsx`)** — `src: string | string[]` 지원, 체인 순차 시도
   - 실패 시 다음 URL → 마지막 URL은 최대 5회 지수 백오프 재시도 (1s→2s→4s→8s→16s)
   - 모두 실패 시 `/img-error.png` (로컬 static) 표시
4. **프론트 (`types.ts`, `quests.ts`, `quests.ts` mock)** — `thumbnailUrls` 필드 추가, API 변환 갱신
5. **호출부** — `QuestList`, `WorldMap`, `QuestDetail` 히어로 이미지 모두 `thumbnailUrls` 사용

→ 해소 ✅
