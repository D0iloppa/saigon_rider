# 휴먼 UX 체크 태스크 — 2026-05-15

> **기반 체크리스트**: [`ai-docs/TEST/checklist/`](../../TEST/checklist/) (섹션별 분할, §2 본문은 [`s2_features.md`](../../TEST/checklist/s2_features.md))  
> **진척도**: [`progress.md`](../../TEST/progress.md) · **이슈 로그**: [`issues.md`](../../TEST/issues.md)  
> **전일 체크 이력**: [`260514_human_ux_check_task.md`](../260514/260514_human_ux_check_task.md)  
> **테스트 환경**: `http://localhost:18090` (docker compose --profile backend up -d)

---

## 진행 상태 요약

| 분류 | 항목수 | 비고 |
|---|---|---|
| ❌ 결함 수정 후 재점검 | 4 | F-AUTH-LOGIN, F-02-7, F-03-2, F-03-4 |
| 🟡 부분점검 재확인 | 2 | F-03-1, F-09-3 |
| ⬜ §2 미점검 잔여 | 4 | HOME·QUEST-LIST 내 미완 항목 |
| ⬜ §2.7 QUEST-DETAIL | 6 | 신규 점검 필요 |
| ⬜ §2.8 RIDE-ACTIVE | 12 | 신규 점검 필요 |
| ⬜ §2.9 RIDE-RESULT | 7 | 신규 점검 필요 |
| ⬜ §2.11 PROFILE-001 | 11 | 신규 점검 필요 |
| ⬜ §2.12~2.15 SETTINGS | 10 | 신규 점검 필요 |

---

## A. 결함 수정 후 재점검 (❌ → 수정 → ✅ 확인 필요)

> 코드 수정이 선행되어야 하는 항목. 수정 완료 후 휴먼 확인.

| # | 기능 ID | 화면 | 결함 내용 | 수정 방향 | 점검 결과 |
|---|---|---|---|---|---|
| A-1 | **F-AUTH-LOGIN** | AUTH-002 · OtpInput | passcode 입력 후 BFF `/auth/login` 미호출. 더미 검증(`000000`=실패, 나머지=성공), `id:''` 빈 user 전달 | `handleVerify`를 `apiLogin(phone, digits.join(''))` 호출로 교체 | ⬜ |
| A-2 | **F-02-7** | AUTH-002 · 재전송 버튼 | 재전송 클릭 시 타이머 리셋만, BFF register 재호출 없음 → 새 passcode 미발급 | 재전송 onClick에 `apiRegister(phone)` 추가 | ⬜ |
| A-3 | **F-03-2** | PROFILE-SETUP · 닉네임 중복 | 닉네임 입력 후 `GET /api/bff/profile/check-nickname` 미호출 | 입력 debounce + check-nickname API 연동 | ⬜ |
| A-4 | **F-03-4** | PROFILE-SETUP · 저장 버튼 | Zustand만 업데이트, `PUT /api/bff/profile` 미호출. rider_type 소문자 → 400 | ① PUT 호출 추가 ② `toUpperCase()` 처리 | ⬜ |

---

## B. 부분점검 재확인 (🟡)

| # | 기능 ID | 화면 | 상황 | 점검 방법 | 점검 결과 |
|---|---|---|---|---|---|
| B-1 | **F-03-1** | PROFILE-SETUP | 한국어 IME 조합 중 1자 상태에서 버튼 활성화 보고. 코드상 `length >= 2` 존재 | 한글 1자 입력 상태에서 확인 버튼 활성화 여부 재확인 | ⬜ |
| B-2 | **F-09-3** | FEED-001 · 필터 Chip | `neighborhood`/`friends` 필터 클릭 시 BFF에 WHERE 미적용 → 전체 게시물 노출 | 필터 전환 후 노출 게시물 변화 없는지 확인 (BFF 미구현 상태 인지) | ⬜ |

---

## C. §2 미점검 잔여 항목 (기존 섹션 내)

| # | 기능 ID | 화면 | 점검 방법 | 점검 결과 |
|---|---|---|---|---|
| C-1 | **F-04-4** | HOME-001 · 알림 뱃지 | 알림 아이콘의 unread_count 뱃지 숫자 노출 여부. `GET /api/bff/notifications?user_id=…` 응답 확인 | ⬜ |
| C-2 | **F-04-8** | HOME-001 · 로딩 스켈레톤 | Chrome DevTools → Network throttle `Slow 4G` 후 `/home` 진입 시 스켈레톤 표시 여부 | ⬜ |
| C-3 | **F-04-9** | HOME-001 · 빈 상태 | DB quests 전체 비활성화(`is_active=false`) 후 빈 상태 UI 확인 | ⬜ |
| C-4 | **F-05-5** | QUEST-LIST · 필터 초기화 | 필터 Chip 선택 → 전체 해제 → 리스트 재호출 정상 여부 | ⬜ |
| C-5 | **F-09-8** | FEED-COMMENT · 사진 댓글 | 댓글창 클립 아이콘 → 이미지 선택 → `POST /api/bff/contents/upload` → imgproxy URL 미리보기 | ⬜ |
| C-6 | **F-09-9** | FEED-001 · 공유 버튼 | 공유 아이콘 클릭 → `navigator.share` 시스템 시트 또는 클립보드 복사 | ⬜ |

---

## D. §2.7 QUEST-DETAIL / QUEST-DETAIL-LOCK (신규)

> 진입 URL: `/quests/:id` (QUEST-LIST 카드 클릭 또는 직접 입력)

| # | 기능 ID | 기능명 | 분류 | 점검 방법 | 점검 결과 |
|---|---|---|---|---|---|
| D-1 | F-06-1 | 상세 정보 로드 | `[BFF]` | `GET /api/bff/quests/{id}` 200, 히어로이미지·설명·조건·보상 카드 표시 | ⬜ |
| D-2 | F-06-2 | 북마크 토글 | `[BFF]` | 북마크 아이콘 클릭 → `POST /api/bff/quests/{id}/bookmark` 200 `{bookmarked: bool}` + 아이콘 반전; DB `bookmarks` 확인 | ⬜ |
| D-3 | F-06-3 | 공유(딥링크 복사) | `[DEVICE]` | 공유 버튼 → `navigator.share` 또는 클립보드 복사 + 토스트 표시 | ⬜ |
| D-4 | F-06-4 | 참여중 친구 아바타 | `[BFF]` | `GET /api/bff/quests/{id}/participants` 200, 상위 아바타 노출 | ⬜ |
| D-5 | F-06-5 | 퀘스트 시작 → HUD | `[BFF]` | "시작" 버튼 → `POST /api/bff/quests/{id}/accept` 200 → `/ride/active` 이동; DB `user_quests` insert 확인 | ⬜ |
| D-6 | F-06-6 | 잠금 모달(레벨 미달) | `[STATIC]` | 사용자 level < quest.min_level 조건 시 잠금 모달 + 시작 버튼 비활성 | ⬜ |

---

## E. §2.8 RIDE-ACTIVE / RIDE-PAUSE / RIDE-GPS-ERROR (신규)

> 진입 URL: `/ride/active` (퀘스트 상세에서 시작 or 직접 입력)  
> ⚠️ GPS 테스트는 모바일 또는 DevTools의 Sensors(위치 재정의) 활용

| # | 기능 ID | 기능명 | 분류 | 점검 방법 | 점검 결과 |
|---|---|---|---|---|---|
| E-1 | F-07-1 | GPS 추적 시작 | `[DEVICE]` | 위치 권한 허용 → `watchPosition` 콜백에서 좌표 수신, 화면 갱신 | ⬜ |
| E-2 | F-07-2 | 실시간 이동거리 | `[STATIC]` | DevTools Sensors로 좌표 이동 → 거리(km) 누적 증가 | ⬜ |
| E-3 | F-07-3 | SVG 링 게이지 | `[STATIC]` | 진행률 % 시각화 — 거리 변화에 따라 링 채움 | ⬜ |
| E-4 | F-07-4 | 주행 시간 카운트업 | `[STATIC]` | mm:ss 1초마다 증가 확인 | ⬜ |
| E-5 | F-07-5 | 평균 속도 | `[STATIC]` | km/h 표시 (distance/time 기반) | ⬜ |
| E-6 | F-07-6 | 안전 등급 실시간 | `[BFF]` | `POST /api/bff/ride/safety-grade` 주기 호출 → A/B/C 응답 화면 반영 | ⬜ |
| E-7 | F-07-7 | GPS 신호 강도 아이콘 | `[DEVICE]` | `coords.accuracy` 값에 따라 3단계 바 표시 | ⬜ |
| E-8 | F-07-8 | 라이딩 스트릭 | `[BFF]` | `GET /api/bff/ride/streak` 200 `{current, longest}` → 화면 표시 | ⬜ |
| E-9 | F-07-9 | 일시정지 BottomSheet | `[STATIC]` | 정지 버튼 클릭 → 미니맵·현재 통계 BottomSheet 표시 | ⬜ |
| E-10 | F-07-10 | 계속/종료 분기 | `[STATIC]` | 종료 → `/ride/result/success` 또는 `/ride/result/fail` 정상 이동 | ⬜ |
| E-11 | F-07-11 | GPS 에러 오버레이 | `[STATIC]` | DevTools Sensors로 위치 불가 → 에러 오버레이 표시 | ⬜ |
| E-12 | F-07-12 | OS 위치 설정 딥링크 | `[DEVICE]` | GPS 에러 화면에서 "설정 열기" → iOS/Android 설정 앱 호출 | ⬜ |

---

## F. §2.9 RIDE-RESULT-S / RIDE-RESULT-F (신규)

> 진입 URL: `/ride/result/success`, `/ride/result/fail`

| # | 기능 ID | 기능명 | 분류 | 점검 방법 | 점검 결과 |
|---|---|---|---|---|---|
| F-1 | F-08-1 | 보상 정산(성공) | `[BFF]`+`[SRE]` | `POST /api/bff/ride/submit` → 응답 reward 포함. DB `rp_transaction` EARN 행 확인. Engine `sre_user.lifetime_earned` 증가 | ⬜ |
| F-2 | F-08-2 | Confetti 애니메이션 | `[STATIC]` | 성공 결과 진입 시 confetti 표시 여부 | ⬜ |
| F-3 | F-08-3 | 첫 클리어 보너스 배너 | `[STATIC]` | 응답 `firstClear=true` 시 보너스 배너 표시 | ⬜ |
| F-4 | F-08-4 | 피드에 공유 | `[BFF]`+`[SRE]` | "피드에 공유" 버튼 → `POST /api/bff/feed` → Engine `SHARE_SNS` 이벤트 확인. DB `feed_posts` insert | ⬜ |
| F-5 | F-08-5 | 실패 결과 표시 | `[STATIC]` | `/ride/result/fail` — 사유 + 달성거리 Progress 표시 | ⬜ |
| F-6 | F-08-6 | 위로 보상(+20 EXP) | `[BFF]` | 실패 제출 응답 `reward.exp=20` 확인 | ⬜ |
| F-7 | F-08-7 | 재도전 분기 | `[STATIC]` | "다시 도전" → QUEST-DETAIL, "다른 퀘스트" → QUEST-LIST 이동 | ⬜ |

---

## G. §2.11 PROFILE-001 / BADGE-DETAIL (신규)

> 진입 URL: `/profile`

| # | 기능 ID | 기능명 | 분류 | 점검 방법 | 점검 결과 |
|---|---|---|---|---|---|
| G-1 | F-10-1 | 프로필 정보 로드 | `[BFF]` | `GET /api/bff/auth/me` — 닉네임/레벨/타입/avatar 표시 | ⬜ |
| G-2 | F-10-2 | 레벨 진행도 바 | `[STATIC]` | exp / next_level_exp % Progress Bar 시각화 | ⬜ |
| G-3 | F-10-3 | 재화 카드 | `[STATIC]` | XP / Gold / Skill Pt 카드 값 표시 | ⬜ |
| G-4 | F-RP | RP 잔액 표시 | `[BFF]`+`[SRE]` | `GET /api/bff/profile/{user_id}/rp-balance` → `{current_balance, lifetime_earned, lifetime_spent, expiring_in_30d, tier}` | ⬜ |
| G-5 | F-10-4 | 이번 달 통계 | `[BFF]` | `GET /api/bff/users/me/stats` → 통계 카드(거리/퀘스트수/평균안전도) | ⬜ |
| G-6 | F-10-5 | 월별 주행 미니 차트 | `[BFF]` | `GET /api/bff/ride/history` → SVG 차트 렌더 | ⬜ |
| G-7 | F-10-6 | 탭 전환(기록/배지/장비) | `[STATIC]` | 탭 클릭 시 active 상태 전환 + 콘텐츠 변경 | ⬜ |
| G-8 | F-10-7 | 최근 라이딩 기록 | `[BFF]` | `GET /api/bff/ride/history` 목록 렌더 | ⬜ |
| G-9 | F-10-8 | 배지 상세 모달 | `[BFF]` | 배지 클릭 → `GET /api/bff/badges/{id}` → 이름/설명/획득조건 모달 | ⬜ |
| G-10 | F-10-9 | 프로필 사진 변경 | `[DEVICE]`+`[BFF]` | 아바타 클릭 → 갤러리 → `POST /api/bff/profile/avatar` 200 → DB `avatar_content_id` 갱신, 화면 즉시 반영 | ⬜ |
| G-11 | F-10-10 | 닉네임 변경 | `[BFF]` | `PUT /api/bff/profile/nickname` — 중복 시 409, 정상 시 200 + 프로필 갱신 | ⬜ |

---

## H. §2.12~2.15 SETTINGS (신규)

> 진입 URL: `/settings`, `/settings/notifications`, `/settings/language`, `/settings/account`

| # | 기능 ID | 화면 | 기능명 | 분류 | 점검 방법 | 점검 결과 |
|---|---|---|---|---|---|---|
| H-1 | F-11-1 | SETTINGS | 미니 프로필 → 편집 이동 | `[STATIC]` | 카드 클릭 → `/profile` 진입 | ⬜ |
| H-2 | F-11-2 | SETTINGS | 다크 모드 토글 | `[STATIC]` | 토글 → 테마 변경 + 새로고침 후에도 유지(localStorage) | ⬜ |
| H-3 | F-11-3 | SETTINGS | 위치 권한 상태 | `[DEVICE]` | granted/prompt/denied 상태 표시 (`navigator.permissions`) | ⬜ |
| H-4 | F-11-4 | SETTINGS | 로그아웃 | `[STATIC]` | 로그아웃 → localStorage 삭제 → `/splash` → 새로고침 후에도 미로그인 | ⬜ |
| H-5 | F-11-5 | SET-NOTI | 알림 토글 저장 | `[BFF]` | 토글 변경 → `PUT /api/bff/notifications/settings` 200 → 재진입 시 값 일치 | ⬜ |
| H-6 | F-11-6 | SET-LANG | 언어 선택 | `[STATIC]` | KO/VI/EN 선택 → 전체 화면 텍스트 즉시 변환 + localStorage 영속 | ⬜ |
| H-7 | F-11-7 | SET-ACCOUNT | 계정 정보 조회 | `[BFF]` | 휴대폰/가입일/계정ID 표시 | ⬜ |
| H-8 | F-11-8 | SET-ACCOUNT | 계정 ID 복사 | `[DEVICE]` | 복사 버튼 → `navigator.clipboard.writeText` → 토스트 표시 | ⬜ |
| H-9 | F-11-9 | SET-ACCOUNT | 데이터 다운로드 요청 | `[BFF]` | `POST /api/bff/users/export` 200 → `{request_id, status:"QUEUED"}` + 토스트 | ⬜ |
| H-10 | F-11-10 | SET-ACCOUNT | 계정 탈퇴 | `[BFF]` | 위험 모달 → 확인 → `DELETE /api/bff/users/me` 204 → 로그인 화면 이동 | ⬜ |

---

## 점검 완료 후 처리

1. 각 항목 결과를 `⬜` → `✅` / `❌` / `🟡` 로 갱신
2. [`TEST/checklist/s2_features.md`](../../TEST/checklist/s2_features.md) 상태 컬럼 동기화 + [`progress.md`](../../TEST/progress.md) 진척도 갱신
3. ❌ 발견 시 §5 이슈 로그에 상세 기재
4. 섹션 완료 후 Progress Tracker 집계 갱신
5. `wikidoc_publish.sh` 실행하여 wiki 현행화
