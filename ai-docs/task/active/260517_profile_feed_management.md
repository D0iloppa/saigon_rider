# 프로필 피드 관리 기능

> 생성: 2026-05-17 | 상태: 진행 중

## 목표

프로필 페이지에서 내가 올린 피드를 조회/수정/삭제할 수 있도록 한다.

## 작업 항목

- [x] 백엔드: GET /feed/{post_id} (단건 조회)
- [x] 백엔드: PUT /feed/{post_id} (피드 수정 API, 소유자 검증)
- [x] 백엔드: DELETE /feed/{post_id} (피드 삭제 API, 소유자 검증)
- [x] 프론트 API: fetchFeedPost, fetchMyFeed, updateFeedPost, deleteFeedPost 함수
- [x] 프로필 페이지: feeds 탭 추가 (내 피드 리스트 조회)
- [x] 프로필 피드 카드: 수정/삭제 액션 메뉴
- [x] 피드 수정 페이지 (/feed/edit/:postId)
- [x] i18n 키 추가 (ko, en, vi)
- [x] 빌드 & 배포
- [ ] UI 브라우저 검증

## 설계 메모

- 기존 fetchFeed가 user_id 파라미터 지원하므로 별도 조회 API 불필요
- 프로필 탭 순서: feeds(신규) > history > badges > gear
- 피드 수정은 FeedCreate 구조 재활용, /feed/edit/:postId 라우트
- 삭제는 확인 다이얼로그 후 API 호출
