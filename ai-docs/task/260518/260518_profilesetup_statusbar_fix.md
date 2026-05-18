# ProfileSetup StatusBar 누락 수정

> **생성**: 2026-05-18 | **상태**: IN_PROGRESS

## 현상

- ProfileSetup 페이지(`pages/auth/ProfileSetup.tsx`)에서 뒤로가기 버튼이 iOS 상태바 영역과 겹침
- `StatusBar` 컴포넌트가 import만 되어있고 실제 렌더링되지 않음
- `.navRow`가 `padding-top: 8px`로 바로 시작하여 상태바 높이만큼 여백 부족

## 원인

- 프로젝트 CSS 아키텍처 규칙(`StatusBar를 헤더 최상단 첫 자식으로 배치`)을 따르지 않음
- PhoneInput, OtpInput 등 같은 auth 플로우의 다른 페이지는 StatusBar를 정상 렌더링 중

## 수정 방안

- `.root` 내부 첫 자식으로 `<StatusBar />` 렌더링 추가 (1줄)
- iOS/Android 모두 `var(--status-bar-height)`에 의해 자동 대응

## 수정 파일

- `frontend/src/pages/auth/ProfileSetup.tsx`
