# 현재 상황 (Session Carry-Over)

> 다음 스레드가 이 파일만 읽고도 작업을 이어받을 수 있도록 작성.  
> 완료 이력은 [`context/history.md`](history.md)로 이관됨. 여기에는 활성 상태만 유지.  
> **마지막 갱신**: 2026-05-20 (Task 7: 관리자 보상 정책 관리 UI 구현 완료)

---

## 월드맵 페이지 개편 — 라이더 정보 유틸리티 허브 (2026-05-20) — 📋 PLANNED

**Feature #48** (`home`) | 현재 월드맵(SVG 지도 + 통화 카드)을 라이더 실용 정보 허브로 전환.

### 배경
서비스 초기 유저 유입 hook으로 **"유용한 정보 제공"** 전략. 베트남 오토바이 라이더가 매일 확인할 날씨/유가/대기질 정보를 홈 화면에서 바로 제공.

### 페이지 레이아웃

```
프로필 헤더 (간소화: avatar + nick + level + 알림/설정 아이콘)
├── 날씨 & 대기질 위젯 (현재 기온, 체감, 바람, 습도, AQI, 시간별 예보 12시간)
├── 유가 위젯 (Ron 95/92/E5 가격 + 기준일)
└── 추천 퀘스트 캐러셀 (기존 유지)
```

### 제거 대상
- SVG 구역 지도 + 퀘스트 핀 → 퀘스트 탭에서 접근
- 통화 카드 (XP/Gold/SP) → 프로필/Game Hub에서 접근
- 인사 메시지 + 레벨 프로그레스 바

### 단계별 로드맵
- **Phase 1**: Mock 데이터 기반 UI 완성 (현재 단계)
- **Phase 2**: 실제 외부 API 연동 (WeatherAPI.com 등) + Redis 캐싱
- **Phase 3**: 교통 정보, 주유소 지도, 커뮤니티 침수 리포트

### Phase 1 서브태스크

**Backend (4건)**:
1. DB 마이그레이션 — `fuel_prices` 테이블 (033)
2. FuelPrice 모델 + Pydantic 스키마
3. `world-info` API 라우터 (GET /api/world-info/fuel-prices)
4. 관리자 유가 관리 페이지

**Frontend (6건)**:
5. API 모듈 `worldInfo.ts` (Types + Mock + fetch 함수)
6. WeatherWidget 컴포넌트 (기온/바람/습도/AQI/시간별 예보)
7. FuelPriceWidget 컴포넌트 (3종 연료가격)
8. i18n 키 추가 (ko/vi/en)
9. WorldMap.tsx 재작성 (위젯 통합)
10. WorldMap.module.css 정리

**검증 (1건)**:
11. 빌드 검증 + 브라우저 확인

### 기획문서 (위키)
- [`월드맵 페이지 개편 — 개요`](/wiki/docs/planning/world-map-overview)
- [`날씨 & 대기질 정보 서비스`](/wiki/docs/planning/world-map-weather)
- [`유가 정보 서비스`](/wiki/docs/planning/world-map-fuel)

### 구현 플랜 파일
`~/.claude/plans/generic-mapping-horizon.md` (상세 기술 명세)

---

## 활성 태스크

| 태스크 파일 | 요약 | 상태 |
|---|---|---|
| [`260518_sre_upgrade_plan_task.md`](../task/active/260518_sre_upgrade_plan_task.md) | SRE 게이미피케이션 v2 연계 플랜 | ✅ DONE (전 서브태스크 완료) |
| [`260520_capacitor_migration_task.md`](../task/active/260520_capacitor_migration_task.md) | Capacitor 도입 — NativeInterface 전환 | ✅ DONE |
| [`260520_redis_message_queue_task.md`](../task/active/260520_redis_message_queue_task.md) | Redis Streams 메시지 큐 도입 | ✅ DONE |
| (inline) | Task 7: 관리자 보상 정책 관리 UI | ✅ DONE |

> 이전 활성 태스크는 모두 아카이브 완료 → [`task/archive.md`](../task/archive.md)

---

### GAP 잔여 TODO (변경 없음)

| Todo | GAP | 내용 | 상태 |
|---|---|---|---|
| #32 | H1 | E2E 테스트 시나리오 5개 | TODO |
| #36 | M1 | PostgreSQL 뷰 7개 검토 | TODO |
| #37 | M2 | DB 보안 정책 (RLS) 검토 | TODO |
| #38 | M3 | PostgREST RPC → Engine 매핑 확인 | TODO |
| #39 | L1 | 파일 인벤토리 불일치 정리 | TODO |
| #40 | L2 | Tailwind 아이템 토큰 확장 | TODO |

---

### 다음 우선순위
1. **월드맵 개편 Phase 1** — 대표 검토 후 서브태스크별 순차 구현
2. **GAP-H1 (#32)** E2E 테스트 시나리오 5개
3. GameHubSheet 내 CurrencyHUD GP/GC 값 실제 API 연동

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
