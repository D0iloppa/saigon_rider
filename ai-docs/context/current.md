# 현재 상황 (Session Carry-Over)

> 다음 스레드가 이 파일만 읽고도 작업을 이어받을 수 있도록 작성.  
> 큰 변경 후 갱신. **마지막 갱신**: 2026-05-16 (8차 — GUIDELINE §7 보안/환경변수 규약 + `.env.example` 키셋 동기화)

## 보안 / 환경 변수 규약 신설 (2026-05-16)

- `GUIDELINE.md` §7 "보안 / 환경 변수" 신설 — `.env` 절대 노출 금지, 키셋 동일 인터페이스 의무, 보안 정보 하드코딩 금지(`os.getenv()` / `import.meta.env` / `${VAR}` 보간 참조만).
- `.env.example` 에 누락 키 6종 추가 (`ADMIN_USER`/`ADMIN_PASS_HASH`/`ADMIN_JWT_SECRET`/`APP_TIMEZONE`/`BFF_PUBLIC_URL`/`IMGPROXY_BASE_URL`) — `.env` 와 키셋 완전 일치 확인.
- `README.md` "환경변수 (.env)" 섹션 상단에 보안 규약 박스 추가.
- ⚠ 향후 `.env` 에 키를 추가/삭제할 때마다 `.env.example` 도 즉시 동일 갱신할 것 (GUIDELINE §7 규칙 2).

## BFF 타임존 (2026-05-16 확정)

- `.env` `APP_TIMEZONE` (기본 `Asia/Seoul`) 으로 일자 경계 제어
- `docker-compose.yml` → bff 서비스에 `APP_TIMEZONE`, `TZ` 둘 다 주입
- `backend/app/utils.py` 에 `APP_TZ` 노출 (잘못된 값은 Asia/Seoul 폴백)
- 적용 대상:
  - `quests.py` `_calc_period_key` (DAILY/WEEKLY 퀘스트 일자 경계)
  - `users.py` `_month_bounds` (월별 통계, 구 `_vn_month_bounds` 폐기)
  - `ride.py` `_upsert_streak` (라이딩 streak 일자 경계)
- 변경 시 `tzdata` 패키지 필요 (slim 이미지) — `requirements.txt` 반영
- ⚠ **엔진(SRE)** 의 `SRE_TIMEZONE` 은 비즈니스 룰 (anti-abuse, RP 만료 등) 용이라 별도 — 현재 `Asia/Ho_Chi_Minh` 유지

## 활성 태스크

**`task/active/260515_human_ux_check.md`** — §2.7~2.15 휴먼 UX 점검 (58 항목, 미점검 잔여)

**`task/active/260515_tabbar_scroll_layout_fix.md`** — TabBar iOS 수정 + Feed/Profile 스크롤 레이아웃 (실기기 최종 확인 대기)

**`task/active/260515_tabbar_ux_polish.md`** — TabBar UX 개선 (진행 중)

**`task/active/260515_auth_todo.md`** — 인증 체계 구현 (진행 중)

**`task/active/260515_quest_fk_mapping.md`** — Quest FK 매핑 (진행 중)

### 다음 우선순위
1. **실기기 확인**: iOS에서 TabBar/Feed/Profile 이슈 수정 결과 검증
2. **A섹션 결함 수정**: F-AUTH-LOGIN, F-02-7, F-03-2, F-03-4 코드 수정
3. **퀘스트 이미지 매핑**: DB 실제 퀘스트에 `thumbnail_content_id` 연결 (어드민 플로우)

---

## 최근 작업 이력 (2026-05-15 — 6차)

| # | 작업 | 결과 |
|---|---|---|
| 20 | **시스템 이미지 imgproxy 서빙 구조 구축** | `contents/system/districts/`, `contents/system/quests/` 배치, `build_imgproxy_url(options)` 확장 |
| 21 | **DB 마이그레이션 011** | `districts.image_content_id UUID FK` 추가 |
| 22 | **DB 마이그레이션 012** | district 5개 + quest 썸네일 6개 contents 시드, district `image_content_id` 자동 연결 |
| 23 | **BFF District 모델 확장** | `District.image_content`, `DistrictOut` model_validator로 imgproxy URL 자동 resolve |
| 24 | **BFF contents 엔드포인트 2종 추가** | `GET /contents/{id}/img` (redirect), `GET /contents/mock-img` (mock 랜덤 redirect) |
| 25 | **quests `_to_out()` fallback 체인 완성** | quest thumbnail → district image → mock-img 순서 |
| 26 | **DB 마이그레이션 013** | `content_owner_type` enum에 `'mock'` 추가, mock 이미지 5개 시드 |
| 27 | **Mock 이미지 5장 배치** | `contents/system/mock/mock-01~05.jpg`, Saigon Rider 분위기 AI 생성 이미지 |
| 28 | **`BFF_PUBLIC_URL` 환경변수 추가** | `.env` + `docker-compose.yml` 반영, `MOCK_IMG_ENDPOINT` 유틸 상수화 |
| 29 | **워크플로우 `system-contents-upload.md` 현행화** | content_id 기반 서빙 구조, BFF redirect 패턴, 관련 코드 목록 반영 |

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
- **신규 업로드**: 파일명 = content_id UUID (`contents.py` upload 엔드포인트)
- **owner_type**: `system` (관리자 배치) / `user` (유저 업로드) / `mock` (fallback 전용)
- **관련 마이그레이션**: `011`, `012`, `013` (database/init/)

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
- F-09-3 피드 필터 chip neighborhood/friends — BFF WHERE 미구현 (팔로우 테이블 설계 후 처리)
- 퀘스트 `thumbnail_content_id` 미연결 — DB 퀘스트가 mock 데이터와 달라 직접 매핑 필요

---

## 미구현 후속 태스크 메모

> 다영역 협업이 필요한 영구 후속 항목은 [`project_todo.md`](../project_todo.md) 로 이관됨.
> 신규 항목은 본 섹션이 아닌 `project_todo.md` 의 적절한 카테고리에 추가한다.

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
2. 필요한 활성 태스크 로드 (`human_ux_check`, `tabbar_*`, `auth_todo` 등)
3. 필요 시 [`TEST/issues.md`](../TEST/issues.md) 와 해당 섹션 체크리스트만 추가 로드
