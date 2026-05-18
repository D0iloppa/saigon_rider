# 태스크: Profile Sheet 스크롤 UX 수정

**등록일**: 2026-05-18  
**상태**: 🔧 코드 완료, 실기기 검증 대기  
**우선순위**: HIGH

---

## 이슈 요약

[프로필] 페이지 draggable sheet 영역에서 두 가지 UX 이슈 수정.

---

## 이슈 1: ImageCarousel — x축 스와이프 중 y축 스크롤 동시 발생

### 현상
피드 이미지 다중일 때 x축 스와이프 중 부모 sheet의 y축 스크롤이 동시 발생.

### 시도 및 롤백 이력
1. **1차 시도**: `e.stopPropagation()` 추가 (React synthetic event)  
   → 실기기에서 y축 스크롤 여전히 발생  
   → React 이벤트 위임 구조상 `stopPropagation`/`preventDefault`가 브라우저 네이티브 스크롤 결정을 막지 못함 (non-passive 보장 안 됨, 타이밍 이슈)

2. **최종 해결**: `.wrap`에 CSS `touch-action: none` 추가  
   → 브라우저 제스처 인식 자체를 비활성화 → JS가 완전 제어  
   → x 스와이프 → carousel 슬라이드 ✓  
   → y 스와이프 → lockedAxis='y' → carousel 아무것도 안 함 (이미지 위에서 y 스와이프로 sheet 스크롤 불가 — Instagram 동일 UX)

### 변경 파일
- `frontend/src/components/ui/ImageCarousel.module.css` — `.wrap`에 `touch-action: none` 추가
- `frontend/src/components/ui/ImageCarousel.tsx` — `dragging.current` 시 `e.stopPropagation()` 유지 (React 레벨 버블링 방지 보조)

---

## 이슈 2: Sheet 상한 도달 후 스크롤 활성화 지연 (이중 제스처)

### 현상
sheet를 상한(snapMin)까지 올린 후, 내부 스크롤이 바로 안 되고 다시 한 번 스와이프해야 함.

### 원인
`setTimeout(350)` — sheet가 snapMin에 snap 완료 후 350ms 대기 후 `scrollable=true` 전환. 이미 touch 제스처가 끝난 상태라 새 gesture를 시작해야 스크롤 가능.

### 해결
`setTimeout` 값을 350ms → **100ms**로 단축.  
(CSS transition이 300ms이므로 100ms는 transition 완료 전이나 실질적으로 느낌 개선)

### 변경 파일
- `frontend/src/pages/profile/ProfileMain.tsx` — `scrollTimer.current = window.setTimeout(..., 350)` → `100`

> **기술적 한계 메모**: 이중 제스처는 `scrollable` state toggle 방식의 근본 한계. 완전 해소하려면 `overflowY` 항상 `auto` + touchStart 시 scrollTop 캡처 기반 판단으로 재설계 필요. 현재는 100ms 단축으로 UX 개선 수준 유지.

---

## 검증 포인트
- [ ] 피드 이미지 2장 이상: x 스와이프 중 y 스크롤(sheet 이동) 없음
- [ ] 피드 이미지 위에서 y 스와이프: sheet 스크롤 안 됨 (이미지 밖 영역에서는 가능)
- [ ] sheet를 snapMin까지 올린 후 ~100ms 내 스크롤 가능
- [ ] sheet를 내리려 할 때 (scrollTop=0에서 아래로): sheet 하강 정상 동작
- [ ] sheet가 중간/하단(snapMax)에서 위로 스와이프: sheet 상승 정상 동작
