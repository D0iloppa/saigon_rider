# 공개 사용자 프로필 확장 결과 (2026-09-09)

## 데이터·개인정보 결정

- `/profile/:userId`와 `GET /users/{userId}/profile`은 로그인 세션을 계속 요구한다.
- 어느 방향이든 차단 관계가 있으면 존재 여부를 드러내지 않는 동일한 404를 반환한다.
- 가입 월, 완료 약속이 있는 고유 매물 수, 실제 거래 후기 수·평균만 노출한다. 매너 점수나 활동량은 추측하지 않는다.
- 판매 중 매물은 기존 `seller_id` 목록 API를 재사용한다. 이 API의 차단·숨김·철회 필터를 우회하는 새 조회 경로는 만들지 않았다.
- 개인 주행거리·퀘스트·안전 등급은 본인 전용 통계이므로 공개 프로필에 포함하지 않았다.

## 구현

- 공개 프로필에 활동·거래 요약, 최근 판매 매물 최대 4개, 기존 게시물 피드를 함께 구성했다.
- 마켓 상세의 판매자 아바타·이름 행 전체, 1:1 채팅 헤더, 상대방 일반 메시지 버블 옆 아바타에 프로필 진입점을 추가했다. 내 메시지에는 프로필 아바타를 반복하지 않는다.
- 본인 링크는 `/profile`, 다른 사용자는 `/profile/:userId`로 분기한다.
- ko/en/vi 문구와 모바일 360px 요약 레이아웃을 추가했다.

## 검증

- Backend privacy/aggregation unit tests: 2 PASS (격리 Docker, DB 연결 없음).
- Frontend discoverability contract test: PASS.
- `npx tsc -b --pretty false`: PASS.
- 변경 frontend 대상 ESLint: error 0. 기존 파일 warning 12개는 유지.
- commit, push, deploy, DB mutation: 수행하지 않음.
