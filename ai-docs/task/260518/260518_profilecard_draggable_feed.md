# ProfileCard Draggable Sheet + 피드 조회

**생성일**: 2026-05-18 (25차)  
**상태**: 🔧 코드 완료, 실기기 검증 대기

## 목표

1. `ProfileCard`를 draggable sheet 구조로 전환
   - 기본 상태(collapsed): 현재 카드 내용 (아바타, 닉네임, 팔로워/팔로잉, 팔로우 버튼)
   - 확장 상태(expanded): 기본 카드 + 해당 유저의 피드 리스트
2. FollowerList / FollowingList에서 유저 행 탭 시 ProfileCard 오픈

## 구현 범위

### 프론트엔드
- `ProfileCard.tsx` — BottomSheet 제거 → 커스텀 draggable overlay
- `ProfileCard.module.css` — 신규 레이아웃 스타일
- `FollowerList.tsx` — 유저 행 클릭 → ProfileCard 오픈
- `FollowingList.tsx` — 유저 행 클릭 → ProfileCard 오픈
- i18n (ko/en/vi) — 필요 시 키 추가

### 백엔드
- 별도 신규 API 불필요 — 기존 `GET /feed?user_id=` 재사용

## 설계 결정 사항

| 항목 | 결정 | 근거 |
|------|------|------|
| 피드 카드 스타일 | 의견수렴 후 결정 | 썸네일 그리드 vs 전체폭 카드 |
| 피드 탭 시 동작 | 의견수렴 후 결정 | 카드 내 상세보기 vs 네비게이션 |

## 변경 파일

- `frontend/src/components/ProfileCard.tsx` — BottomSheet → draggable overlay, 피드+댓글 추가
- `frontend/src/components/ProfileCard.module.css` — 전면 재작성
- `frontend/src/pages/profile/FollowerList.tsx` — ProfileCard 연동
- `frontend/src/pages/profile/FollowingList.tsx` — ProfileCard 연동
- `frontend/src/pages/profile/FollowList.module.css` — `.userInfo` 스타일 추가
