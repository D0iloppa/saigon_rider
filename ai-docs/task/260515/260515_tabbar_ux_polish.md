# 태스크: TabBar UX 개선 (260515 세션3)

> **생성**: 2026-05-15 | **상태**: 진행 중

---

## 배경

실기기(iOS/Android/Web) 확인 결과 세 가지 문제 발견.

---

## 문제 목록

### 1. web/Android 상하 safe 여백 부재
- **증상**: 네비게이션 바 아이콘이 상·하단 경계에 딱 붙어 보임
- **원인**: `padding: 10px 4px 16px` 적용됐으나 체감 여백 부족, Android safe-area 미처리
- **수정 방향**: base padding 값 증가 + `--bottom-safe` 를 web/Android에도 적용

### 2. 플랫폼별 emoji 아이콘 불일치
- **증상**: iOS/Android/Web 각각 다른 emoji 폰트 렌더링 → 아이콘 모양 불통일
- **원인**: TabBar에 Unicode emoji (`🏙`, `🎯`, `📷`, `👤`) 사용
- **수정 방향**: `lucide-react` SVG 아이콘으로 교체 → 모든 플랫폼 동일 렌더링

### 3. 네비게이션 아이템 상단 밀착 (iOS/Android 공통)
- **증상**: 탭 아이템(아이콘+텍스트)이 탭바 상단 border에 너무 가깝게 붙어있음
- **원인**: iOS는 `align-self: stretch` + `padding-top: 0` 으로 인디케이터 정렬 우선 → 아이콘 여백 부족
- **수정 방향**: 탭바 전체 높이 확보 + 아이콘 영역 중앙 정렬 재검토

---

## 수정 계획

### Step 1 — lucide-react 설치 (아이콘 통일)
```
npm install lucide-react
```
아이콘 매핑:
| 탭 | 기존 emoji | lucide 아이콘 |
|---|---|---|
| 월드 | 🏙 | `Globe2` |
| 퀘스트 | 🎯 | `Target` |
| 피드 | 📷 | `Camera` |
| 프로필 | 👤 | `User` |

### Step 2 — TabBar.tsx 아이콘 교체

### Step 3 — TabBar.module.css 여백/높이 재조정
- base: `height: 64px`, `padding: 12px 4px 12px` (상하 균등)
- iOS: `height: calc(56px + var(--bottom-safe))`, `padding-top: 8px`, `padding-bottom: calc(8px + var(--bottom-safe))`

---

## 수정 파일 목록

| 파일 | 변경 내용 |
|---|---|
| `frontend/package.json` | lucide-react 추가 |
| `frontend/src/components/layout/TabBar.tsx` | emoji → lucide SVG 아이콘 |
| `frontend/src/components/layout/TabBar.module.css` | 높이·패딩 재조정 |

---

## 미결 / 확인 필요

- [ ] 세 플랫폼(iOS/Android/Web) 에서 동일 아이콘 렌더링 확인
- [ ] 탭 아이콘 상하 여백 체감 확인
- [ ] iOS 인디케이터 border 밀착 유지 확인
