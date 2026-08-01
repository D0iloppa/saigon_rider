# Home 진입 UX 개선 — Splash 오버레이 (2026-05-15)

## 문제 (UX)

`/home` 진입 시 API 응답 전에 레이아웃이 먼저 마운트되면서  
아바타, 이모지 GIF, 퀘스트 카드 등 요소들이 빈 상태로 잠깐 노출됨.  
사용자 입장에서 화면이 "깜빡"이며 뚝뚝 채워지는 느낌 → 완성도 낮은 첫인상.

> **UI 문제가 아니라 UX 문제**: 레이아웃 자체는 정상이나, 진입 순간의 경험이 불완전함.

## 원인

- `WorldMap` 컴포넌트는 마운트 즉시 렌더링
- `fetchRecommendedQuest()` API 응답 전까지는 퀘스트 카드가 shimmer skeleton으로 표시
- 이미지(아바타, 이모지 GIF)는 네트워크 로딩이 별도로 걸림
- 결과: 레이아웃은 있으나 콘텐츠가 없는 중간 상태가 사용자에게 노출됨

## 해결 방향

API 응답이 올 때까지 **흰 배경 스플래시 오버레이**로 화면을 덮어둔 뒤,  
렌더링이 완료되면 fade-out 하여 완성된 화면으로 자연스럽게 전환.

스플래시 디자인: 앱 아이덴티티를 활용 (FAB 오토바이 아이콘 + "Saigon Rider" 텍스트).

## 구현

### 타이밍 로직 (`WorldMap.tsx`)

```
마운트 시각 기록 (mountedAt)
   ↓
fetchRecommendedQuest() 완료
   ↓
경과 시간 계산: elapsed = now - mountedAt
남은 최소 시간: delay = max(0, 600ms - elapsed)
   ↓
delay 후 → fadeSplash = true  (opacity: 0 전환, 0.35s)
delay + 350ms 후 → showSplash = false  (DOM 제거)
```

- **최소 표시 시간 600ms**: API가 빠르더라도 스플래시가 즉시 사라지며 깜빡이지 않도록
- **fade-out 350ms**: 딱딱한 전환 대신 부드러운 opacity 애니메이션

### 컴포넌트 구조

```tsx
{showSplash && (
  <div className={`${styles.splash} ${fadeSplash ? styles.splashFade : ''}`}>
    <img src={emojiUrl('1f3cd')} className={styles.splashIcon} />
    <span className={styles.splashTitle}>Saigon Rider</span>
  </div>
)}
```

### CSS 핵심

```css
.splash {
  position: fixed; inset: 0; z-index: 999;
  background: #ffffff;
  opacity: 1;
  transition: opacity 0.35s ease;
}
.splashFade {
  opacity: 0;
  pointer-events: none;  /* fade 중 터치 이벤트 차단 해제 */
}
```

## 결과

| 단계 | 상태 |
|---|---|
| 마운트 ~ API 응답(+최소 600ms) | 스플래시 표시 |
| 이후 350ms | fade-out 애니메이션 |
| 완료 | 완성된 홈 화면 노출 |

## 참고 / 추후 고려

- 현재 트리거: `fetchRecommendedQuest()` 완료 기준. 이미지(아바타, GIF) 로딩은 포함 안 됨
- 이미지까지 보장하려면 `onLoad` 이벤트 카운터 방식 필요 (현재는 과도한 구현)
- 600ms 최소 시간은 실기기 체감 기준으로 조정 가능
