# 태스크: alert/confirm → Toast/ConfirmDialog 교체

> **생성**: 2026-05-15 | **상태**: 완료

## 배경

iOS WebView에서 `window.alert()` / `window.confirm()` 이 동작하지 않는 문제.  
React 컴포넌트 기반 UI로 전환.

## 선택 라이브러리

- **sonner** — toast 알림 (경량 ~2KB, iOS 호환, shadcn 저자 제작)
- **ConfirmDialog** — 커스텀 컴포넌트 (Zustand + CSS Modules, 외부 라이브러리 없음)

## 변경 파일 목록

| 파일 | 변경 내용 |
|---|---|
| `frontend/src/App.tsx` | `<Toaster />` 추가 |
| `frontend/src/store/useConfirmStore.ts` | 신규 — Zustand confirm 슬라이스 |
| `frontend/src/components/ui/ConfirmDialog.tsx` | 신규 — 다이얼로그 컴포넌트 |
| `frontend/src/components/ui/ConfirmDialog.module.css` | 신규 — 스타일 |
| `frontend/src/pages/settings/AccountSettings.tsx` | `alert` → `toast`, `confirm` → `useConfirm` |
| `frontend/src/pages/settings/Settings.tsx` | `confirm` → `useConfirm` |

## 완료 기준

- [x] iOS/Android/Desktop 브라우저에서 복사 toast 표시
- [x] 로그아웃/계정삭제 confirm 다이얼로그 표시 및 동작
- [x] `window.alert`, `window.confirm` 호출 0건
- [x] 빌드 오류 없음 (tsc --noEmit 통과, docker 빌드 성공)
