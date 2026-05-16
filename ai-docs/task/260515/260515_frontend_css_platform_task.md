# 프론트엔드 CSS 수정 & 플랫폼 분기 아키텍처 — 2026-05-15

> **상태**: ✅ 완료 (빌드 확인)  
> **관련 문서**: [`context/frontend.md`](../../context/frontend.md) — §2 플랫폼 분기 CSS, §3.0 StatusBar 규칙

---

## 배경

이전 작업(260515 새벽)에서 WorldMap 외 나머지 페이지(Quest, Feed, Profile)에 `<StatusBar>` 컴포넌트를 추가했으나, CSS padding 값이 정리되지 않아 이중 여백/위치 어긋남 문제가 남아 있었다. 추가로 iOS/Android WebView 뷰포트 차이로 인한 잠재적 CSS 불일치 문제가 확인되어 아키텍처 수준의 대응이 필요했다.

---

## Task 1 — ProfileMain 설정 아이콘·아바타 위치 보정

### 문제
- `settingsBtn`: `top: 16px` → StatusBar(50px) 영역 안에 버튼이 걸쳐 있어 WorldMap 톱니바퀴 위치와 불일치
- `avatarWrap`: 상단 여백 없이 StatusBar 바로 아래 붙어서 밀집돼 보임

### 수정
| 파일 | 변경 전 | 변경 후 |
|---|---|---|
| `ProfileMain.module.css` · `.settingsBtn` | `top: 16px` | `top: 60px` |
| `ProfileMain.module.css` · `.avatarWrap` | `margin: 0 auto 12px` | `margin: 16px auto 12px` |

### 기준
WorldMap `.headerIcons { top: 50px }` — StatusBar(50px) 바로 아래에 아이콘이 오도록 맞춤.

---

## Task 2 — TabBar 활성 인디케이터 위치 수정

### 문제
`.active::before { top: -8px }` 로 설정된 인디케이터가 `.tab` 요소 상단 기준 -8px에 위치해 네비게이션 바 경계 밖으로 삐져나오는 현상.

### 수정
| 파일 | 변경 전 | 변경 후 |
|---|---|---|
| `TabBar.module.css` · `.active::before` | `top: -8px` | `top: 0` |

---

## Task 3 — iOS / Android 플랫폼 분기 CSS 아키텍처

### 배경
- **iOS**: WebView가 전체화면 사용 → 상태바 영역이 뷰포트에 포함됨 → `env(safe-area-inset-top)` 값 활용 필요
- **Android**: WebView가 상태바 아래에서 시작 → 상태바 여백 불필요 (`0px`)
- 기존 `StatusBar.module.css`는 `height: 50px` 고정값으로 두 플랫폼을 구분하지 못함

### 구현 내용

#### 1. `index.html` — 인라인 플랫폼 감지 스크립트 추가
React 렌더링 전에 실행되어 CSS 깜박임 없이 `data-platform` 주입.
```html
<script>
  (function () {
    var ua = navigator.userAgent;
    var p = /iPhone|iPad|iPod/i.test(ua) ? 'ios'
          : /Android/i.test(ua)          ? 'android'
          : 'web';
    document.documentElement.setAttribute('data-platform', p);
    window.setPlatform = function (platform) {
      document.documentElement.setAttribute('data-platform', platform);
    };
  })();
</script>
```
네이티브 셸에서 `window.setPlatform('ios')` 또는 `'android'` 호출로 덮어쓰기 가능.

#### 2. `tokens.css` — `--status-bar-height` CSS 변수 신설

| 플랫폼 | 값 | 적용 방법 |
|---|---|---|
| `ios` | `env(safe-area-inset-top, 44px)` | 기기별 실제 높이 자동 적용 |
| `android` | `0px` | WebView가 이미 상태바 아래에서 시작 |
| `web` (기본값) | `44px` | 데스크탑 dev 미리보기용 |

```css
:root                   { --status-bar-height: 44px; }
[data-platform="ios"]   { --status-bar-height: env(safe-area-inset-top, 44px); }
[data-platform="android"]{ --status-bar-height: 0px; }
```

#### 3. `StatusBar.module.css` — 고정 px → CSS 변수 전환
```css
/* 변경 전 */
.statusBar { height: 50px; }

/* 변경 후 */
.statusBar { height: var(--status-bar-height); }
```

### 기존 `--header-safe` 와의 관계
`tokens.css`에 `--header-safe: env(safe-area-inset-top, 0px)` 가 이미 있었으나 사용처가 없었음.  
`--status-bar-height` 로 통일하여 `<StatusBar>` 컴포넌트와 1:1 연결. `--header-safe` 는 하위 호환용으로 유지.

---

## 관련 문서 업데이트

- `ai-docs/context/frontend.md` §2 신설 — 플랫폼 분기 CSS 아키텍처 (동작 원리, 변수 사용법, 신규 페이지 체크리스트)
- `ai-docs/context/frontend.md` §3.0 — 기존 StatusBar 여백 규칙 보강 (padding-top: 0 명시, 예시 코드 추가)
