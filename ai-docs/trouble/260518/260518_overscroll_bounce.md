# Overscroll Bounce (고무줄 효과)

> **상태**: ✅ 해결 (2026-05-18)

## 현상

- 상단 헤더/하단 네비게이션은 고정이어야 하나, 여백 특정 지점을 잡고 스크롤하면 화면 전체가 움직임
- iOS WebView/Safari에서 스크롤 끝에 도달 시 전체 viewport가 바운스됨

## 원인

- `body { overflow: hidden }`, `.frame { overflow: hidden }` 설정은 있으나 **`overscroll-behavior: none`** 누락
- 브라우저 기본 동작인 overscroll bounce가 상위 컨테이너까지 전파

## 수정

| 파일 | 변경 |
|------|------|
| `frontend/src/styles/globals.css` | `html, body, #root`에 `overscroll-behavior: none` 추가 |
| `frontend/src/components/layout/AppShell.module.css` | `.viewport`에 `overscroll-behavior-y: none` 추가 |
