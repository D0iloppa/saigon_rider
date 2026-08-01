# 친구 기능 구현 (상호 팔로우 방식)

프로필에서 친구 리스트를 조회하고, 유저를 검색하거나 QR 코드를 스캔하여 친구를 추가할 수 있는 기능을 구현합니다.
**결정된 설계:** 상호 팔로우(Mutual Follow) 상태를 '친구'로 간주합니다.
**추가 결정 (2026-05-17):** 프로필 소셜 영역에서 Friend 카운트 제거 → Follower/Following 2분할로 단순화.

## 진행 현황

- [x] **1. 기획 및 설계 확정**
  - Option A: 상호 팔로우를 친구로 간주하기로 결정.
- [x] **2. 백엔드 API 구현**
  - [x] `GET /users/{user_id}/friends`: 상호 팔로우 목록 조회 API (`follows.py`)
  - [x] `GET /users/search`: 닉네임/전화번호 기반 유저 검색 API (`users.py`)
  - [x] `GET /users/{user_id}/profile`: 타유저 공개 프로필 조회 (`users.py`, `UserProfileOut` 스키마)
- [x] **3. 프론트엔드 기초 작업**
  - [x] 의존성 추가: `qrcode.react`, `html5-qrcode` 설치
  - [x] API 연동: `fetchFriends`, `searchUsers` 함수 추가 (`api/follows.ts`)
  - [x] API 연동: `fetchUserProfile` 함수 추가 (`api/profile.ts`)
  - [x] 라우팅 등록: `/friends/:userId`, `/friends/add` 등록 (`App.tsx`)
- [/] **4. 프론트엔드 UI/UX 구현**
  - [x] 친구 목록 페이지 (`FriendList.tsx`): 리스트 렌더링 및 DM 연동 (방 생성/이동)
  - [x] ProfileCard BottomSheet (`components/ProfileCard.tsx`): 타유저 프로필 + 팔로우 버튼
  - [x] FeedList 연동: 게시자 아바타/닉네임 클릭 → ProfileCard 오픈 (자기자신은 /profile)
  - [x] 프로필 메인 (`ProfileMain.tsx`): Draggable Sheet 패턴으로 전면 재구성
    - [x] 소셜 영역 2분할 (Follower/Following), Friend 셀 제거
    - [x] 프로필 공유 텍스트 버튼 → QR BottomSheet
    - [x] 친구추가 아이콘 버튼 → /friends/add 이동
  - [ ] 친구 추가 페이지 (`FriendAdd.tsx`):
    - [ ] 탭 A (검색): 유저 검색 및 팔로우 버튼
    - [ ] 탭 B (QR): 상대방 QR 스캔 카메라 연동
- [x] **5. 다국어 및 마무리**
  - [x] `ko.json`, `en.json`, `vi.json` 에 `profile.share`, `profile.shareGuide`, `follow.*` 키 추가
  - [ ] FriendAdd 검색/QR스캔 탭 UI 마무리 후 통합 테스트

## 상세 구현 계획

### ProfileMain.tsx 수정
- 소셜 영역(Follower/Following) 하단 또는 옆에 '친구' 카운트 추가.
- 클릭 시 `/friends/:userId` 로 이동.

### FriendAdd.tsx 신규 생성
- **Search:** `searchUsers` API 결과를 리스트로 보여주고, 클릭 시 `followUser` 호출. (상대방도 나를 팔로우하면 즉시 친구 목록에 등장)
- **My QR:** `qrcode.react`를 사용하여 `user.id`를 담은 URL 또는 ID 자체를 QR로 생성.
- **Scan QR:** `html5-qrcode`를 사용하여 카메라 스트림 실행, 결과값(ID) 획득 시 즉시 팔로우 처리.

### DM 연동 상세
- 친구 목록의 [DM] 버튼 클릭 시 `api/dm.ts`의 `createConversation` 호출.
- 서버에서 이미 방이 있으면 기존 ID 반환, 없으면 생성 후 반환.
- 반환된 ID로 `navigate('/dm/:id')` 수행.
