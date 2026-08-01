# 네이티브 키보드 연계 UX 규약

> 관련 파일: `frontend/src/lib/plugins/KeyboardBridge.ts`, `frontend/src/lib/native.ts`(`onKeyboardChange`), `frontend/src/hooks/useKeyboard.ts`
> 상위 문서: [프론트엔드 구조 및 패턴](frontend.md)

이 프로젝트는 공식 `@capacitor/keyboard` 를 쓰지 않고 **자체 `KeyboardBridge` 네이티브 플러그인**으로 키보드 이벤트를 연계한다. 전역 자동 보정은 없다 — 키보드를 다루는 화면마다 **아래 원칙에 따라 직접 여백을 구현**해야 한다. 새 화면에서 입력 필드/바텀시트를 추가할 때는 이 문서 하나로 규칙을 확인한다.

## 원칙 요약

1. 키보드 여백은 **호출 컴포넌트(스크롤 영역 또는 시트) 자신의 `padding-bottom`** 으로 확보한다. 부모 backdrop/wrapper에 주지 않는다.
2. 오버레이 시트는 **배경 연속**을 유지한다 — 확보된 여백 영역이 시트 배경색이어야 분리감이 없다.
3. 여백 변화에는 `transition: padding-bottom ...` 으로 **부드러운 등장/해제**를 건다.
4. 시트류는 `max-height` 상한 + 내부 `overflow-y: auto` 로 **상태바 침범을 방지**하고 초과분은 내부 스크롤이 흡수한다.
5. 키보드 해제 시 지정한 조건부 스타일이 자연히 걷혀 **원상복귀**된다 (별도 리셋 로직 불필요).

## 인프라 구조

```
KeyboardBridge (네이티브 플러그인)
  ├─ keyboardWillShow { height, duration }
  └─ keyboardWillHide { duration }
        │
        ▼
native.ts → onKeyboardChange(handler)   (frontend/src/lib/native.ts:333-386)
        │
        ▼
useKeyboard()   (frontend/src/hooks/useKeyboard.ts)
        │
        ▼
화면 컴포넌트에서 { height, visible } 소비
```

- **iOS 네이티브**: 키보드는 **웹뷰를 리사이즈하지 않는 순수 오버레이**다. `innerHeight` 계측이 무의미하므로 `KeyboardBridge` 의 `keyboardWillShow`/`keyboardWillHide` 이벤트가 유일한 높이 소스다 (`native.ts` 341-364행).
- **웹 / Android**: 기존 `visualViewport` inset과 `innerHeight` delta 중 큰 값을 쓰는 계측 폴백을 유지한다 (`native.ts` 366-386행). Android는 `adjustPan` + IME 패딩이 이미 동작하므로 **회귀 금지** — 아래 iOS 전용 오버라이드 패턴은 `isIosNative` 조건으로 감싼다.
- `useKeyboard()` 는 키보드가 내려가도 `height` 는 마지막 관측값을 유지하고 `visible` 만 `false` 로 바뀐다. 그래서 소비처는 항상 `isIosNative && kb.visible` 조합으로 적용 여부를 판단한다 (`kb.height` 단독 사용 금지).

```ts
// frontend/src/hooks/useKeyboard.ts
export interface KeyboardState {
  height: number; // 현재(또는 마지막 관측) 키보드 높이(px)
  visible: boolean;
}
```

## 케이스 1: 스크롤 페이지형

> `frontend/src/pages/biz/BizApply.tsx`, `BizApply.module.css`

`.page` 가 flex column, `.body` 가 `flex: 1` + `overflow-y: auto` 인 표준 페이지 구조에서는, 키보드가 뜰 때 **스크롤 영역(`.body`) 에 padding-bottom 을 얹어 그 여백을 스크롤이 소비**하게 한다. 헤더(TopBar)·푸터는 밀리지 않는다.

```tsx
// BizApply.tsx
const kb = useKeyboard();
// iOS 네이티브는 키보드가 순수 오버레이라 설명 textarea 아래 여백이 거의 없어
// 스크롤해도 키보드에 가려진다 — 키보드 높이만큼 하단 padding 을 더해 스크롤로 뺄 수 있게 한다.
const isIosNative = native.platform === 'ios';

return (
  <div className={styles.page}>
    <TopBar title={...} />
    <div className={styles.body} style={{ paddingBottom: isIosNative && kb.visible ? kb.height : undefined }}>
      {/* 폼 필드들 */}
    </div>
  </div>
);
```

```css
/* BizApply.module.css */
.page {
  height: 100%;
  display: flex;
  flex-direction: column;
  background: var(--bg);
}

.body {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  -webkit-overflow-scrolling: touch;
  padding: 16px 20px 32px;
}
```

## 케이스 2: 오버레이 바텀시트형

> `frontend/src/pages/map/NeighborhoodProfile.tsx`, `NeighborhoodProfile.module.css` (장소 제안 시트)

`.sheetBackdrop` (`position: fixed; inset: 0; align-items: flex-end`) + `.sheet` 구조의 바텀시트에서는 규칙이 다르다.

```tsx
// NeighborhoodProfile.tsx
const kb = useKeyboard();
const isIosNative = native.platform === 'ios';

<div className={styles.sheetBackdrop} onClick={() => !submitting && setSheetOpen(false)}>
  <div
    className={styles.sheet}
    onClick={(e) => e.stopPropagation()}
    style={
      isIosNative && kb.visible
        ? {
            maxHeight: 'calc(100% - var(--status-bar-height, 0px) - 12px)',
            paddingBottom: `calc(${kb.height}px + 20px)`,
          }
        : undefined
    }
  >
    {/* 폼 필드들 */}
  </div>
</div>
```

```css
/* NeighborhoodProfile.module.css */
.sheetBackdrop { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.45); display: flex; align-items: flex-end; justify-content: center; z-index: 60; }
.sheet {
  width: 100%;
  max-width: 480px;
  background: var(--surface);
  border-radius: 18px 18px 0 0;
  padding: 20px 18px calc(20px + var(--tabbar-height, 72px) + var(--bottom-safe, 0px));
  display: flex;
  flex-direction: column;
  gap: 8px;
  max-height: 80vh;
  overflow-y: auto;
  transition: padding-bottom 0.28s cubic-bezier(0.25, 0.46, 0.45, 0.94);
}
```

**규칙 분해**

1. **리프트는 `.sheet` 자신의 `paddingBottom`** 으로 준다 — `.sheetBackdrop` 이 아니다. 배경이 연속되어(시트 배경색) 분리감이 없다.
2. 값은 `calc(kb.height + 20px)` — 기존 CSS 기본값의 `20px` 요소는 유지하되, **`var(--tabbar-height, 72px)`, `var(--bottom-safe, 0px)` 는 제외**한다. 키보드가 뜨면 탭바·safe-area 자체가 화면에서 가려지므로 그 여백까지 더하면 과도한 빈 공간이 생긴다.
3. `maxHeight: calc(100% - var(--status-bar-height, 0px) - 12px)` 로 **상단 상한**을 걸어 상태바를 침범하지 않게 한다. 내용이 넘치면 기존 `.sheet` 의 `overflow-y: auto` 가 내부 스크롤로 흡수한다.
4. CSS 에 `transition: padding-bottom 0.28s cubic-bezier(0.25, 0.46, 0.45, 0.94)` 를 걸어 키보드 등장/해제 모두 부드럽게 전환한다. 키보드가 내려가면 조건부 인라인 스타일이 `undefined` 로 걷히면서 CSS 기본값(`padding: 20px 18px calc(...)`)으로 자연히 원복된다.

## 안티패턴

**`.sheetBackdrop` (fixed + `align-items: flex-end`) 에 `paddingBottom` 을 주지 않는다.** backdrop 은 시트를 감싸는 컨테이너 전체이므로, 여기에 padding 을 주면 시트 전체가 통째로 위로 밀려 올라가 시트 상단이 상태바를 침범한다. 실제로 이 형태의 버그가 발생했었다 — 여백은 항상 **화면에 그려지는 시트/스크롤 영역 자신**에 주어야 한다.

## 새 화면 적용 체크리스트

- [ ] `useKeyboard()` 로 `kb` 를 구독하고, `native.platform === 'ios'` 로 `isIosNative` 를 판단했는가 (Android/웹은 기존 계측 폴백이 이미 동작하므로 iOS 전용 오버라이드로 감싼다)
- [ ] 여백을 **backdrop/wrapper 가 아니라 실제 스크롤 영역 또는 시트 자신**에 주었는가
- [ ] 오버레이 시트라면 `maxHeight` 상한 + `overflow-y: auto` 내부 스크롤을 확보했는가 (상태바 침범 방지)
- [ ] 시트라면 키보드가 가릴 탭바/safe-area 상수는 제외하고 `calc(kb.height + 기존 padding 상수)` 로 계산했는가
- [ ] CSS 에 `transition: padding-bottom ...` 을 걸어 등장/해제가 자연스러운가 (키보드 해제 시 별도 리셋 로직 없이 조건부 스타일이 걷히며 원복되는지 확인)
