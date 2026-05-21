# 피드 등록 / 고객센터 입력 영역 카드 배경 누락

- **발견일**: 2026-05-22
- **심각도**: UI / 디자인
- **상태**: ✅ DONE

## 증상

- **FeedCreate** (`/feed/new`): textarea가 `background: transparent`로 페이지 배경 위에 직접 노출. 영역 구분 없이 회색 배경 위에 글씨만 떠있는 느낌.
- **CustomerSupport** (`/settings/support`, `view=new`): 폼 영역(`.form`)에 카드 컨테이너가 없어 input/textarea가 배경과 구분 안 됨.

## 원인

두 페이지 모두 입력 섹션에 카드 스타일(흰색 배경 + border-radius + 그림자)을 적용하지 않아 시각적 영역 분리가 되지 않음.

## 수정 방향

1. **FeedCreate**: `.body` 내부에 textarea + 이미지 프리뷰를 감싸는 카드 영역 추가 (흰색 배경, border-radius, 미세 그림자)
2. **CustomerSupport**: `.form`에 카드 스타일 적용 (흰색 배경, border-radius, 미세 그림자)
3. 프론트엔드 빌드 검증

## 관련 파일

- `frontend/src/pages/feed/FeedCreate.tsx`
- `frontend/src/pages/feed/FeedCreate.module.css`
- `frontend/src/pages/settings/CustomerSupport.tsx`
- `frontend/src/pages/settings/CustomerSupport.module.css`
