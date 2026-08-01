# Toast 시스템 트러블슈팅 (2026-05-15)

## 1. Toast가 스타일 없이 텍스트만 표시되는 문제

### 증상
아바타 업로드 실패 시 "HTTP 413" 텍스트가 프로필 헤더 그라디언트 위에 배경 없이 그대로 노출.  
Toast 카드가 아닌 일반 `<p>` 태그였음.

### 원인
`ProfileMain.tsx`가 `toast()` 유틸을 전혀 호출하지 않고 있었음.  
에러를 컴포넌트 state(`avatarError`, `nickError`)로 관리한 뒤 JSX에서 `<p>` 태그로 직접 렌더링.

```tsx
// 수정 전 — state로 에러 표시 (toast 아님)
const [avatarError, setAvatarError] = useState('');
// ...
{avatarError && <p className={styles.avatarErrorMsg}>{avatarError}</p>}

// 수정 후 — toast 호출
toast.error(err.message ?? t('profile.avatarError'));
```

### 조치
- `avatarError`, `nickError` state 제거
- catch 블록에서 `toast.error()` 호출로 교체
- JSX의 인라인 `<p>` 에러 요소 제거

---

## 2. Sonner CSS 오버라이드가 적용되지 않는 문제

### 증상
`sonner.css`에 `!important`를 포함한 스타일을 작성했으나 Toast 카드의 배경·테두리가 반영되지 않음.

### 원인
Sonner v2는 toast 항목(`<li>`)에 **inline style**을 직접 주입.  
CSS 파일의 선택자 규칙(외부 stylesheet)은 inline style보다 우선순위가 낮아 `!important`를 써도 씹힘.

> CSS 우선순위: `inline style` > `!important in stylesheet` 는 **틀림**.  
> 실제로는 `!important in stylesheet` > `inline style` 이지만,  
> Sonner가 React의 `style` prop으로 주입하는 경우 빌드 결과물 CSS 로드 순서나 specificity에 따라 달라질 수 있음.  
> 가장 안전한 방법은 Sonner의 toast 호출 옵션 `{ style: {...} }` 으로 직접 전달.

### 조치
`Toast.ts` 래퍼에서 각 메서드 호출 시 `style` 옵션을 직접 전달:

```ts
export const toast = {
  error: (message: string) =>
    sonnerToast.error(message, {
      style: { background: '#FFFFFF', borderLeft: '3px solid #EF3B3B', ... },
    }),
};
```

---

## 3. Toast 위치가 TabBar와 겹치는 문제

### 증상
`position="bottom-center"` 설정 후 Toast가 TabBar 위에 겹쳐서 표시됨.

### 원인
Sonner의 `offset` prop은 숫자(px)만 받아 `env(safe-area-inset-bottom)` 미반영.  
iOS는 홈 인디케이터 영역(~34px)이 추가로 필요하나 고정값으로는 대응 불가.

### 조치
`sonner.css`에서 `data-platform` 선택자로 플랫폼별 분기:

```css
/* iOS: safe-area-inset-bottom 반영 */
[data-platform="ios"] [data-sonner-toaster][data-y-position="bottom"] {
  bottom: calc(72px + env(safe-area-inset-bottom, 34px) + 12px) !important;
}

/* Android / web: 고정값 */
[data-platform="android"] [data-sonner-toaster][data-y-position="bottom"],
[data-platform="web"] [data-sonner-toaster][data-y-position="bottom"] {
  bottom: calc(72px + 12px) !important;
}
```

**결과값**
| 플랫폼 | bottom 값 |
|---|---|
| iOS (홈 인디케이터 있는 기기) | `72 + 34 + 12 = 118px` |
| iOS (홈 버튼 기기, safe-area=0) | `72 + 0 + 12 = 84px` |
| Android / web | `72 + 12 = 84px` |
