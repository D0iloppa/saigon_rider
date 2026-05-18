# 현재 상황 (Session Carry-Over)

> 다음 스레드가 이 파일만 읽고도 작업을 이어받을 수 있도록 작성.  
> 완료 이력은 [`context/history.md`](history.md)로 이관됨. 여기에는 활성 상태만 유지.  
> **마지막 갱신**: 2026-05-18

---

## SRE 게이미피케이션 v2 업그레이드 계획 (2026-05-18) — 📋 PLANNED

RPG 경제 패러다임 도입 — 미션 보상을 통화(GP/GC) 중심으로 전환, 가챠 5종 + 상점 + 일일 추천 + 천장 시스템 신규 추가.  
기획서: `_tmp/sre-upgrade/sre-gamification-deployment-guide.md` (v2.0, 14개 결과물)

### 서브태스크 6개
1. **SUB-1**: 기획 문서 정식 색인 등록 — ✅ DONE (2026-05-18)
2. **SUB-2**: DB 마이그레이션 연계 — 8개 SQL, 15개 신규 테이블, 16개 함수 (TODO)
3. **SUB-3**: BFF API 연계 — 가챠/상점/인벤토리/시즌 엔드포인트 (TODO)
4. **SUB-4**: 프론트 UI — ⚠ **디자인 레퍼런스 미확정, 기획자/디자이너에게 요청 필요** (BLOCKED)
5. **SUB-5**: __DEV Context 등록 — ✅ DONE (2026-05-18)
6. **SUB-6**: 관리자 콘솔 확장 — 운영 대시보드 4종 (TODO)

### 태스크 파일
[`task/active/260518_sre_upgrade_plan_task.md`](../task/active/260518_sre_upgrade_plan_task.md)

---

## 활성 태스크

| 태스크 파일 | 요약 | 상태 |
|---|---|---|
| [`260518_sre_upgrade_plan_task.md`](../task/active/260518_sre_upgrade_plan_task.md) | SRE 게이미피케이션 v2 연계 플랜 | 📋 PLANNED |

> 이전 활성 태스크는 모두 아카이브 완료 → [`task/archive.md`](../task/archive.md)

### 다음 우선순위
1. **SRE v2 연계**: 디자인 레퍼런스 요청 → DB 마이그레이션 → BFF API → 프론트 UI

---

## 미해결 결함 (❌, [issues.md](../TEST/issues.md))

| 기능 ID | 화면 | 수정 방향 |
|---|---|---|
| F-AUTH-LOGIN | AUTH-002 OtpInput | `handleVerify` → `apiLogin(phone, passcode)` 호출 |
| F-02-7 | AUTH-002 재전송 | 재전송 버튼 onClick에 `apiRegister(phone)` 호출 추가 |
| F-03-2 | PROFILE-SETUP 닉네임 중복 | debounce + `check-nickname` API 연동 |

---

## 진행 중 / 부분 점검 (🟡)

- F-03-1 닉네임 1자 IME 이슈 — 재빌드 후 재점검 필요
- 퀘스트 `thumbnail_content_id` 미연결 — DB 퀘스트가 mock 데이터와 달라 직접 매핑 필요

---

## 이미지 서빙 아키텍처 (2026-05-15 확정)

> 신규 이미지 추가 시 반드시 확인 — 상세는 [`workflow/system-contents-upload.md`](../workflow/system-contents-upload.md)

```
thumbnail_url 결정 순서 (_to_out in quests.py):
  1. quest.thumbnail_content.file_path  → build_imgproxy_url()
  2. quest.district.image_content.file_path → build_imgproxy_url()
  3. MOCK_IMG_ENDPOINT (BFF_PUBLIC_URL/contents/mock-img → 랜덤 302)
```

- **content_id 기반 서빙**: `GET /api/bff/contents/{id}/img?w=800&h=450` → 302 → imgproxy
- **owner_type**: `system` / `user` / `mock` / `profile_mock`

---

## 현재 프론트엔드 CSS 아키텍처 핵심 규칙

> **신규 페이지 추가 시 반드시 확인** — 상세는 [`context/frontend.md`](frontend.md) §2~§3

- `<StatusBar>` 를 헤더 최상단 첫 자식으로 배치, 헤더 `padding-top: 0` 유지
- `TopBar` 컴포넌트 사용 시 내부에 StatusBar 포함 → 추가 불필요
- 고정 px 값으로 상단 여백 지정 금지 → `var(--status-bar-height)` 사용
- 플랫폼 분기 필요 시 `[data-platform="ios"]` / `[data-platform="android"]` CSS 선택자 활용

---

## 다음 스레드 진입 시 권장 순서

1. [INDEX.md](../INDEX.md) → 이 파일 (`current.md`) 확인
2. 필요한 활성 태스크 로드 (파일명으로 선택적 로드)
3. 완료 이력이 필요하면 [`context/history.md`](history.md) 참조
4. 필요 시 [`TEST/issues.md`](../TEST/issues.md) 와 해당 섹션 체크리스트만 추가 로드
