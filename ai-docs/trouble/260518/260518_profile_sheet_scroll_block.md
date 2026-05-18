# Profile Draggable Sheet 스크롤 Block

> **상태**: ✅ 해결 (2026-05-18)

## 현상

- 프로필 draggable sheet가 최대 위치(snapMin)로 올라간 직후 몇 초간 시트 내부 스크롤이 block됨
- 시트 이동 자체는 정상이나, snap 완료 직후 UX 끊김 발생

## 원인 분석

### 1. `overflowY` 전환 타이밍 불일치

```tsx
// ProfileMain.tsx:281
overflowY: sheetTop <= snapMin.current ? 'auto' : 'hidden',
```

- snap 애니메이션(0.3s cubic-bezier) 중에 `sheetTop` state가 `snapMin`으로 설정됨
- `overflowY`가 `hidden → auto`로 전환되면서 브라우저가 스크롤 컨테이너를 재구성
- transition 완료 전에 overflow 변경이 일어나 터치 이벤트가 무시됨

### 2. `sheetTop` state 비교의 React 렌더 지연

```tsx
// ProfileMain.tsx:99
if (sheetTop <= snapMin.current) {
```

- `setSheetTop(snapMin.current)` 호출 후 React 리렌더 전까지 `sheetTop`은 이전 값
- snap 직후 첫 터치에서 내부 스크롤 위임 분기에 진입하지 못함

## 수정

| 파일 | 변경 |
|------|------|
| `frontend/src/pages/profile/ProfileMain.tsx` | `scrollable` state + `atTop` ref + 350ms 지연 overflow 전환 |
| `frontend/src/components/ui/ImageCarousel.tsx` | `lockedAxis` ref로 터치 방향 축 잠금 + x축 확정 시 `preventDefault` |

### 수정 핵심

1. **`scrollable` state + 350ms 지연**: `handleTouchEnd`에서 snapMin 도달 시 `setTimeout(350)`으로 `overflowY: auto` 지연 적용 → CSS transition(300ms) 완료 후 스크롤 컨테이너 활성화
2. **`atTop` ref**: snap 상태를 즉시 추적 → React 렌더 대기 없이 내부 스크롤 위임 판단
3. **드래그 시작 시 즉시 `scrollable: false`** + timer clear: 시트 이동과 내부 스크롤 충돌 제거

### 추가 수정: ImageCarousel 축 잠금

- **이슈**: 피드 이미지 캐러셀 x축 스와이프 시 부모 시트의 y축 스크롤도 동시 발생
- **수정**: `lockedAxis` ref로 터치 방향 감지 후 축 잠금 + x축 확정 시 `e.preventDefault()`로 부모 스크롤 차단
