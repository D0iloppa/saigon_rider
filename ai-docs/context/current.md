# 현재 상황 (Session Carry-Over)

> 다음 스레드가 이 파일만 읽고도 작업을 이어받을 수 있도록 작성.  
> 큰 변경 후 갱신. **마지막 갱신**: 2026-05-15

## 활성 태스크

**`task/active/260515_human_ux_check.md`** — §2.7~2.15 휴먼 UX 점검 (58 항목)

### 다음 우선순위
1. **A섹션 (결함 수정 → 재점검)**: F-AUTH-LOGIN, F-02-7, F-03-2, F-03-4 코드 수정
2. **D섹션 (§2.7 QUEST-DETAIL 신규)**: 6 항목 휴먼 점검
3. 그 외 §2.8 RIDE-ACTIVE 12 / §2.9 RIDE-RESULT 7 / §2.11 PROFILE 11 / §2.12~2.15 SETTINGS 10

## 최근 작업 이력 (2026-05-15)

| 시각 | 작업 | 결과 |
|---|---|---|
| 1 | `app_config` 테이블 추가 (`database/init/005_app_config.sql`) | DB 적용 + 모델 미구현 (필요 시 추가) |
| 2 | PK 순서 `(group_name, key)` 로 변경 | super-key 정의에 맞춤 |
| 3 | `google / map` API 키 INSERT | Google Maps Platform Key |
| 4 | `task/260514/260514_app_config_task.md` 작성 | 조회 방법(psql / SQLAlchemy / upsert 패턴) 문서화 |
| 5 | `task/active/260515_human_ux_check.md` 작성 | 휴먼 UX 점검 58개 등록 |
| 6 | **ai-docs 구조 트리화 (대규모)** | `INDEX.md` / `context/` / `spec/` / `schema/` / `TEST/checklist` 분할, 260513~260514 태스크 내부 링크 일괄 치환 |
| 7 | **지침 최적화** | `GUIDELINE.md` / `INDEX.md` / `current.md` 역할 분리 — 한 사실은 한 곳에만 (휘발성↔안정성 분리) |
| 8 | **alert/confirm → Toast/ConfirmDialog 교체** | sonner 설치, `<Toaster />` + `<ConfirmDialog />` App 마운트, `useConfirmStore` 신설, 3개 locale에 cancel/confirm 키 추가, iOS alert 문제 해소 |

## 미해결 결함 (❌, [issues.md](../TEST/issues.md))

| 기능 ID | 화면 | 수정 방향 |
|---|---|---|
| F-AUTH-LOGIN | AUTH-002 OtpInput | `handleVerify` → `apiLogin(phone, passcode)` 호출 |
| F-02-7 | AUTH-002 재전송 | 재전송 버튼 onClick에 `apiRegister(phone)` 호출 추가 |
| F-03-2 | PROFILE-SETUP 닉네임 중복 | debounce + `check-nickname` API 연동 |
| F-03-4 | PROFILE-SETUP 저장 | `PUT /api/bff/profile` 호출 + rider_type `toUpperCase()` |

## 진행 중 / 부분 점검 (🟡)

- F-03-1 닉네임 1자 IME 이슈 — 재빌드 후 재점검
- F-09-3 피드 필터 chip neighborhood/friends — BFF WHERE 미구현 (팔로우 테이블 설계 후 처리)

## 미구현 후속 태스크 메모

- 스토리 등록 UI (`is_story=true` 플래그는 BFF 존재, 프론트 UI 없음)
- 피드 게시물 작성 UI (현재 라이딩 결과에서만 생성 가능)
- 친구 초대 / `REFERRAL` 이벤트 (Engine 매핑 있으나 BFF 트리거 없음)

## 다음 스레드 진입 시 권장 순서

1. [INDEX.md](../INDEX.md) → 이 파일 (`current.md`) 확인
2. [task/active/260515_human_ux_check.md](../task/active/260515_human_ux_check.md) 로드
3. 필요 시 [TEST/issues.md](../TEST/issues.md) 와 해당 섹션 체크리스트만 추가 로드
