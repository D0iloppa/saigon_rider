# W4 — 관리자(운영자) 관점 준비도 감사 (2026-08-17, HEAD `728031b`)

## 0. 요약

운영자 1명이 하루를 굴리는 데 필요한 **도구**(신고 처리, 매물 검수, 거래 분쟁, 유저 제재, CMS, 대시보드)는 신규 SPA(`/admin`)에 거의 전부 갖춰져 있고, `current.md`(2026-07-18 기준)가 기록한 "2차 이식 잔여 12메뉴"는 **07-22~08-12 사이에 전건 이식 완료**된 걸로 실측됐다(문서가 stale). 감사로그 페이지도 07-18 시점엔 Placeholder였지만 지금은 실제 조회 API+화면이 붙어 있다.

다만 두 층위에서 구멍이 크다. **① 돈 가시성** — 거래 "건수"는 대시보드에 나오지만 거래 금액(GMV)은 어디에도 합산되지 않는다(가격 컬럼은 있는데 SUM하는 코드가 0곳). 업체 광고 구독료도 "표시값"일 뿐 실제 결제/정산 레코드가 시스템에 없다(Payment/Invoice 테이블 자체가 없음 — 플랫폼에 결제 게이트웨이가 없다). **② 신고 처리 "정책"의 부재** — 감독 지시로 이번 감사에서 추가 확인한 부분인데, 신고 접수부터 제재까지 전 구간이 **100% 운영자 재량**이다. 자동 임계치 조치, 사유별 차등 SLA, 미처리 신고 경보, 누범 자동 에스컬레이션이 전부 코드에 없다. 제재당한 유저는 세션 검증 자체가 403이라 **인앱 이의제기 경로도 실질적으로 막혀 있다**(고객센터 문의도 인증이 필요해서 정지 상태로는 못 연다).

legacy(`/admin-legacy`)는 이제 보조가 아니라 **비대칭 의존**이다 — T&S 핵심(신고센터·매물검수·거래완료이의·공지/FAQ·배지·금칙어·감사로그)은 legacy에 **아예 없고 SPA 전용**이라, `admin_frontend` 컨테이너가 죽으면 이 기능들은 완전히 못 쓴다. 반대로 quests/feed/users/settings/SRE 6종/stream/fuel/제보심사/비즈심사/push/POI는 legacy·SPA 양쪽에 다 있어 이중 유지 상태다.

## 1. 업무 영역별 판정표

| # | 영역 | 업무 | 판정 | 코드 근거 | 신규SPA/legacy |
|---|---|---|---|---|---|
| A-1 | 접근·계정 | 신규 SPA vs legacy 이중 운영 | 🟡부분 | `backend/app/routers/admin_legacy.py`(4524줄, 전 도메인 병행) vs `admin-frontend/src/pages/*`(23개 화면) — T&S 5종은 legacy에 없음(§2 참조) | 둘다(비대칭) |
| A-2 | 접근·계정 | root/서브계정 권한 3단계 분리 | ✅완성 | `backend/app/admin_auth.py`(ROOT/ADMIN/MANAGER, `is_privileged`), `backend/app/routers/admin_api/accounts.py:149-159`(서브계정 CRUD, `verify_root_api`) | SPA(legacy 병행) |
| A-3 | 접근·계정 | 로그인 throttling | ✅완성 | `backend/app/services/admin_login_throttle.py`(Redis escalating lockout, username+IP 2축, fail-open), `backend/app/routers/admin_api/auth.py:43-48` + `admin_legacy.py:207-212` 양쪽에 배선 | SPA+legacy 공통 |
| A-4 | 접근·계정 | 감사로그 조회 | ✅완성(문서와 실측 불일치) | `backend/app/routers/admin_api/audit_logs.py:34-68`(필터·페이지네이션 조회 API), `admin-frontend/src/pages/audit/AuditLogPage.tsx`(30건/페이지, 액션 라벨 30종). **`current.md`(07-18)는 "Placeholder"라 기록했으나 그 이후 실구현됨** | SPA 전용 |
| B-1 | T&S | 유저 신고 접수·처리(유저/매물/DM/피드) | ✅완성(도구) / 🟡정책(§6) | `backend/app/routers/admin_api/reports.py:151`(목록, 상태·타입 필터), `:187`(상세, 신고자 목록+report_count), `:252`(PATCH 상태전이, allow-list), `:283`(DM 신고 건에 한해 대화 원문 열람) | SPA 전용(legacy 無) |
| B-2 | T&S | 제재(정지·경고·영구정지) | ✅완성(도구) / 🟡정책(§6) | `backend/app/routers/admin_api/users.py:284-347`(WARN/SUSPEND 1~365일/BAN, 사유 필수, 유저 알림 발송), `:350-367`(해제, 사유 필수) | SPA 전용(legacy 無 — 유저 상태변경 API) |
| B-3 | T&S | 매물 모더레이션(HIDDEN/REMOVED) | ✅완성 | `backend/app/routers/admin_api/listings.py:252-284`(단건, 사유 필수→판매자 알림), `:287-`(일괄) | SPA 전용(legacy 無) |
| B-4 | T&S | 금칙어(DM 안전정책) | ✅완성 | `backend/app/routers/admin_api/cms.py:322-353`(CRUD) | SPA 전용(legacy 無) |
| B-5 | T&S | 제재 이력 조회 | ✅완성 | `users.py`의 `_user_detail`이 `UserSanction` 이력을 `order_by(created_at.desc())`로 반환(`reports.py:202` 유사 패턴 — 상세는 users.py) | SPA |
| B-6 | T&S | 신고 처리 정책 코드화 | ❌미구현 | §6 상세 — 자동조치·SLA·에스컬레이션·경보 전부 없음, 순수 재량 | — |
| C-1 | 매물 운영 | 검수 큐 | ✅완성 | `listings.py:120`(목록, 플래그 포함) | SPA 전용 |
| C-2 | 매물 운영 | 일괄 승인/반려 | ✅완성 | `listings.py:287`(`bulk-moderate`, 2026-08-11 T-4) | SPA 전용 |
| C-3 | 매물 운영 | 자동 플래그 | 🟡부분(기계판정만, 자동조치 없음) | `admin-frontend/src/pages/listings/ListingFlags.tsx`(쿼리 시점 계산 — 사진<2·가격0·카테고리 미지정·중복 — **컬럼 저장 없이 표시만**, 자동 HIDDEN 없음) | SPA |
| C-4 | 매물 운영 | 반려 사유 전달 | ✅완성 | `listings.py:240-249`(`Notification` INSERT, 사유 텍스트 포함) | SPA |
| C-5 | 매물 운영 | 재검수/이의제기 | 🟡부분(운영자 재량 RESTORE만, 판매자측 이의제기 채널 없음) | `listings.py` `_MODERATE_ACTIONS`에 RESTORE 존재(관리자만 되돌림 가능) — 판매자가 이의를 제기할 앱 내 경로 미발견 | SPA |
| D-1 | 거래 운영 | 완료 이의 큐 | ✅완성 | `backend/app/routers/admin_api/trades.py`(필터 state/min_pending_hours, 72h+ 강조) | SPA 전용(legacy 無) |
| D-2 | 거래 운영 | 강제 완료/기각 | ✅완성 | `trades.py:160-214`(force_complete, SOLD 가드+FOR UPDATE 잠금+사유 필수+양측 알림+감사로그) | SPA 전용 |
| D-3 | 거래 운영 | 분쟁 처리(대화 이력 조회) | ✅완성 | `reports.py:283`(DM 신고 건 대화 원문), `trades.py` 목록에 상대 정보 포함 — 단, 완료이의 큐 자체엔 DM 열람 버튼 없음(신고 경유해야 원문 확인) | SPA |
| D-4 | 거래 운영 | 노쇼 | 🟡부분(별도 개념 없음, 완료이의로 흡수) | `trades.py` — "판매자 미응답" 상태가 사실상 노쇼를 포함(전용 사유코드 없음) | SPA |
| E-1 | 업체 운영 | 비즈 계정 심사 | ✅완성 | `backend/app/routers/admin_api/biz.py:482`(승인), `:542`(정지) | SPA(legacy 병행) |
| E-2 | 업체 운영 | 광고 소재 심사 | ✅완성 | `biz.py:688`(광고 승인/반려) | SPA(legacy 병행) |
| E-3 | 업체 운영 | 구독 활성화·해지 | 🟡부분(상태 플래그만, 결제 연동 없음) | `biz.py:542` `bp.status="SUSPENDED"` — 정지 시 게시중 광고 일괄 STOPPED(page-map 확인). "구독"은 광고 티어 레코드일 뿐 반복과금 트리거 없음 | SPA |
| E-4 | 업체 운영 | 정산 확인 | ❌미구현 | `grep "class.*Payment\|Invoice\|Subscription\|Settlement" backend/app/models.py` → **0건**. `dashboard.py`의 `biz_ads_monthly_price_sum`은 티어 가격의 산술 합계일 뿐 실제 입금 여부를 추적하는 테이블이 없음 | — |
| F-1 | 콘텐츠 운영 | 공지 CMS | ✅완성 | `cms.py:78-156`(목록/작성/게시/삭제) | SPA 전용(legacy 無) |
| F-2 | 콘텐츠 운영 | FAQ CMS | ✅완성 | `cms.py:225-290` | SPA 전용(legacy 無) |
| F-3 | 콘텐츠 운영 | 푸시 발송 | ✅완성 | `admin_api/push.py`(유저검색·이력·발송, `verify_root_api`) — "미이식: `/push/log/{id}` 상세모달, `/push/badges`"(page-map 명시) | SPA(legacy 병행) |
| F-4 | 콘텐츠 운영 | 피드 관리 | ✅완성 | `admin_api/feed.py` | SPA(legacy 병행) |
| F-5 | 콘텐츠 운영 | POI 심사 | ✅완성 | `admin_api/map/poi.py`(단건 CRUD), 대량 업서트는 의도적으로 legacy 스크립트 전용(`/admin-legacy/poi/bulk`) | SPA(legacy는 bulk 스크립트만) |
| F-6 | 콘텐츠 운영 | 제보 심사 3종(주유소·정비소·장소제안) | ✅완성 | `admin_api/map/submissions.py` | SPA(legacy 병행) |
| G-1 | 지표 | 대시보드 핵심 지표 | ✅완성(단, GMV 제외) | `admin_api/dashboard.py:46-220`(DAU 근사·신규가입·매물등록·**거래건수**·신고·티켓·SLA·업체) | SPA 전용 |
| G-2 | 지표 | GMV(거래액) | ❌미구현 | `grep "sum(.*price\|func.sum" backend/app/routers/admin_api/*.py` → **0건**. `agreed_price_vnd`(`models.py:479`) 컬럼은 존재하나 어디서도 합산 안 됨 | — |
| G-3 | 지표 | 퍼널 전환율/제품 계측 | ❌미구현 | analytics 키워드(amplitude/mixpanel/segment/posthog/GA) 전 코드베이스 grep 0건. `engine/app/services/event_bus.py`의 "event"는 RP/GPS/퀘스트 도메인 이벤트지 제품 계측이 아님 | — |
| H-1 | 고객지원 | 티켓 시스템 | ✅완성 | `admin_api/support.py:83-`(목록/상세/답변/상태변경), 첫응답 SLA가 대시보드에 집계 | SPA(legacy 병행) |
| H-2 | 고객지원 | 계정 복구(전화인증 재설정) | ✅완성 | `users.py:370-`(phone-verification/reset — 인증상태만 해제, 번호는 유지) | SPA 전용 |
| H-3 | 고객지원 | 탈퇴 처리(운영자 개입) | 🟡부분(유저 자가서비스만, 관리자 강제탈퇴/대리처리 API 없음) | `backend/app/routers/users.py:248`(delete_account — `_require_self` 가드, 본인만) — admin_api에 대응 엔드포인트 미발견 | 앱(유저 자가서비스) |
| I-1 | 시스템 운영 | 헬스체크 | ✅완성 | `docker-compose.yml:418,490,528,569,600,625`(bff/engine/worker/noti/redis/db 6종) | infra |
| I-2 | 시스템 운영 | 경보(5xx 등) | ✅완성(코드)/🟡실측 미검증 | `backend/app/services/ops_alerts.py`(webhook, 쿨다운), `main.py:263-270`(미처리 예외 전건 알림) — `.env` `OPS_ALERT_WEBHOOK_URL`은 이 저장소 값이 공란, 실제 운영 발화는 미검증(launch readiness 문서와 일치) | infra |
| I-3 | 시스템 운영 | 백업·복구 | 🟡부분(코드 존재, 실행증적 없음) | `backend/app/jobs/backup_db.py`(pg_dump+gzip, APScheduler, 오프사이트 업로드 fail-open) — 복구훈련(RTO/RPO) 실측은 launch readiness 문서상 미검증 | infra |
| I-4 | 시스템 운영 | DLQ 조회 | 🟡부분(API만, UI 없음) | `admin_api/stream.py:130`(Engine DLQ), `:146`(noti DLQ) — `admin-frontend/src/api/stream.ts`에 대응 훅 부재(`grep dlq` 0건), `StreamPage.tsx`에도 DLQ 탭 없음 → 운영자가 브라우저로 못 보고 curl 필요 | API만(SPA 미노출) |
| I-5 | 시스템 운영 | 강제 업데이트 | 🟡부분(관리 UI는 있음, 실제 발동 불가) | `admin_api/settings.py:220-333`(버전+`is_force_update` 관리) — 그러나 launch readiness 문서 확인: `@capacitor/app` 미동기화로 네이티브 `appVersion:'unknown'` → 발동 자체가 안 됨(코드 밖 네이티브 빌드 이슈) | SPA(관리는 됨, 발동은 안 됨) |
| I-6 | 시스템 운영 | 킬스위치(기능 플래그) | ❌미구현(전역 없음) | `ADS_ENABLED`(`frontend/src/lib/adPlacement.ts:18`)처럼 개별 기능은 **소스 코드 상수**로만 존재 — 관리자가 런타임에 끄고 켤 수 있는 범용 feature flag 화면 없음(`AppConfig`는 dm 폴링주기 하나뿐) | — |
| I-7 | 시스템 운영 | 마이그레이션 적용 확인 | ✅완성(설계상) | `database/init/160_schema_migrations.sql`(적용 이력 원장, psql `-f`/`-c` interleave) — page-map 500행 근거. 운영 DB 실적용 여부는 미검증(launch readiness §2-2) | infra |
| J-1 | 법무 | 약관/개인정보처리방침 CMS | ❌미구현 | `admin-frontend/src/App.tsx` grep "privacy/policy" → 라우트 없음. notices/faqs는 앱 콘텐츠 CMS일 뿐 약관 문서 자체를 관리하는 화면 아님 | — |
| J-2 | 법무 | 데이터 삭제 요청(관리자 대리처리) | 🟡부분(유저 자가서비스만) | `backend/app/routers/users.py:318`(export_user_data, 본인만), `:248`(delete_account, 본인만) — 계정 잠김 등으로 본인이 못 할 때 운영자가 대신 처리할 admin API 없음 | 앱(자가서비스) |
| J-3 | 법무 | 베트남 규제 대응 | 미확인 | 코드 근거로 판단 불가 — 법무 확인 필요 |  |

## 2. 신규 SPA vs legacy 이식 현황

`current.md`(2026-07-18)가 기록한 "2차 이식 잔여" 12항목(퀘스트/피드/관리자계정/설정/SRE 6메뉴/스트림/라이딩정책/유가/제보심사3종/비즈심사2종/푸시/POI/DEV Context)을 실제 라우터 파일로 대조한 결과:

- **전건 이식 완료됨** — `backend/app/routers/admin_api/{quests,feed,accounts,settings,stream,ride_policy,fuel,push}.py`, `admin_api/map/{poi,submissions}.py`, `admin_api/biz.py`, `admin_api/dev_context.py`가 전부 존재하고 `admin-frontend/src/pages/{sre,community,system,map,biz}/`에 대응 화면이 있다. 이식 시점은 page-map 기록상 2026-07-22~08-02(관리자계정·SRE 9종은 07-23, 지도관리 07-20, 커뮤니티 07-22, 비즈 07-22, 업체 직접등록 08-02) — **`current.md`가 갱신 안 된 stale 문서**였다.
- **legacy는 여전히 살아 있다**(`backend/app/routers/admin_legacy.py`, 4524줄, prefix `/admin-legacy`) — 이식 완료 후에도 라우트를 지우지 않아 **대부분 도메인이 SPA·legacy 이중 서빙 중**이다(quests/feed/users/settings/admins/sre/*/stream/config-ride/fuel/gas-submissions/repair-submissions/place-suggestions/biz-accounts/biz-ads/support/push/badges/poi-bulk).
- **T&S 핵심 5종은 legacy에 없다** — `admin_legacy.py`를 `reports|listings|completion-requests|notices|faqs|banned` 키워드로 grep한 결과 **0건**. 즉 **신고센터·매물검수·거래완료이의·공지관리·FAQ관리·금칙어·감사로그는 SPA 전용 신규 기능이고 legacy fallback이 없다.** (배지는 예외로 legacy에도 있음 — `admin_legacy.py:2644`.)
- **결론**: legacy는 더 이상 "구관"이 아니라 **SRE/설정/2차이식 도메인의 병행 백업**이고, T&S(신뢰·안전) 핵심은 **SPA(`admin_frontend` 컨테이너)가 단일 장애점**이다.

## 3. 구조적 질문에 대한 답

1. **"오늘 매출이 얼마인지, 거래가 몇 건 성사됐는지 볼 수 있는가?"** — 거래 **건수**는 볼 수 있다(`dashboard.py:198-199` `trades_today`/`trades_7d`, `MarketplaceAppointment.status=='COMPLETED'` 기준). **매출(GMV)은 볼 수 없다** — `agreed_price_vnd`(`models.py:479`) 컬럼이 있는데도 admin API 어디서도 SUM하지 않는다. 업체 광고 매출도 `biz_ads_monthly_price_sum`이 있으나 이는 티어 가격의 산술합일 뿐, 실제 입금을 추적하는 Payment/Invoice 테이블이 시스템에 아예 없다(마켓 자체가 P2P 오프플랫폼 결제라 플랫폼이 돈을 만지지 않는 구조 — GMV 계측 부재가 곧 "돈이 안 보인다"로 직결).

2. **"사용자가 '돈을 잃었다'고 신고했을 때 운영자가 추적·조치할 수 있는 도구가 있는가?"** — 도구는 있다: 통합 신고(`reports.py`, target_type=USER/LISTING/DM 포괄), 신고 건이 DM 관련이면 대화 원문 열람(`reports.py:283`, `not_dm_scoped` 가드로 무관한 DM은 못 봄), 완료 이의 큐(`trades.py`)로 거래 상태 강제조정, 유저 제재(경고/정지/영구정지) 전부 가능. **다만 "정책"은 없다** — 사기(FRAUD/SCAM) 신고가 스팸 신고보다 우선 처리되게 하는 규칙, 자동 임계치 조치, SLA 마감 경보가 전무해 순전히 그때그때 운영자가 큐를 훑어보고 판단해야 한다(§6).

3. **"장애가 났을 때 알 수 있는가(경보)?"** — 코드로는 있다: `ops_alerts.py`(webhook, 쿨다운 60s), 미처리 예외 전건이 5xx마다 `send_ops_alert` 호출(`main.py:263-270`), DB 백업 실패시에도 동일 채널로 알림(`backup_db.py`). **다만 이 저장소의 `.env`엔 `OPS_ALERT_WEBHOOK_URL`이 공란**이라 지금 이 값 그대로 운영에 올라가면 로그에만 남고 아무도 못 본다(설정 여부는 미확인 — 운영 `.env`는 이 저장소에 없음). launch readiness 문서도 "5xx 경보 실제 발화 미확인"이라 기록 중이라 일치한다.

4. **"legacy 콘솔이 죽으면 운영 가능한가?"** — **아니다.** §2에서 확인했듯 T&S 5종(신고센터·매물검수·거래완료이의·공지/FAQ·감사로그)이 SPA 전용이라, `admin_frontend` 컨테이너가 다운되면 신고 처리도 매물 모더레이션도 거래 분쟁 대응도 불가능해진다. 반대로 SPA가 죽어도 legacy가 quests/feed/users/SRE/push/제보심사/비즈심사를 커버하므로 부분 운영은 가능 — 즉 **의존 방향이 바뀌었다**: 07-18 시점엔 "legacy가 메인, SPA가 신규 부분"이었지만 지금은 "SPA가 T&S 코어의 단일 장애점, legacy는 나머지의 이중화 백업"이다.

## 4. 상용 차단 등급

- **P0 (이게 없으면 운영 불가/방어 불가)**:
  - GMV(거래액) 집계 전무 — 대표가 "오늘 매출 얼마냐" 물으면 답할 방법이 코드에 없다.
  - 신고 처리 정책 미코드화(§6) — 인력이 늘어도 처리 일관성이 보장되지 않고, 분쟁 시 "왜 이 유저는 봐주고 저 유저는 밴했냐"를 방어할 근거가 없다.
  - 제재당한 유저의 인앱 이의제기 경로 부재(§6-4) — `enforce_account_active`가 `verify_user_session` 전체를 막아, 오신고로 정지된 무고한 유저조차 앱 안에서 고객센터 티켓을 못 연다.

- **P1 (운영은 되나 수동·비효율·리스크)**:
  - legacy `admin_frontend` 단일 장애점(T&S 핵심 SPA 전용) — 컨테이너 헬스체크·재시작 전략을 T&S 우선순위로 재점검 필요.
  - DLQ 조회 API는 있는데 SPA에 UI가 없어 curl 필요(운영자가 브라우저로 못 봄).
  - 강제 업데이트 관리 화면은 있으나 네이티브가 버전을 동기화 안 해 실제 발동이 안 됨(launch readiness 문서 기존 지적과 일치).
  - 정산(업체 광고 결제 확인) 도구 전무 — 결제 게이트웨이 자체가 없어 오프라인 확인에 의존할 수밖에 없는 구조.
  - 매물 조치 시 진행 중이던 구매자에게 알림이 안 감(판매자만 통보) — 거래 중 매물이 REMOVED되면 구매자는 "조용히 사라진" 것처럼 경험한다.
  - 신고 누적 시 자동 경보 없음 — 쌓여도 운영자가 큐를 직접 열어보지 않으면 방치될 수 있다.

- **P2**:
  - 킬스위치(런타임 기능 플래그)가 전역으로 없고 코드 상수(`ADS_ENABLED` 등) 재배포로만 전환 가능.
  - 관리자 강제 탈퇴/유저 데이터 삭제 대리처리 API 부재(유저 본인 자가서비스만 존재).
  - 약관/개인정보처리방침을 CMS로 관리하는 화면 없음(정적 콘텐츠 추정, 미확인).

## 5. 미검증으로 남긴 것

- `OPS_ALERT_WEBHOOK_URL` 운영 `.env` 실제 설정값(이 저장소는 dev `.env`만 접근 가능, 공란 확인) — 실제 웹훅 발화는 미검증.
- DB 백업 스케줄러 실제 실행 증적, 복구(RTO/RPO) 훈련 여부 — 코드는 존재하나 launch readiness 문서와 마찬가지로 실측 안 됨.
- 운영 DB에 `database/init/160_schema_migrations.sql` 원장이 실제로 최신 상태인지(로컬 grep만으로는 운영 DB 상태 확인 불가).
- 베트남 현지 법규상 계정 정지·콘텐츠 삭제 통보 의무, 데이터 보관기간 요건 — 코드 근거로 판단 불가, 법무 확인 필요.
- `.env`가 아닌 실제 운영 환경에서 `admin_frontend`/`admin_legacy`의 실 가동 상태(둘 다 compose에 등록돼 있다고 가정했으나 운영 compose override 파일은 확인 못함).

## 6. 신고 처리 정책 — 시스템에 코드화된 것 vs 운영자 재량

| # | 정책 요소 | 코드화 여부 | 근거 | 없을 때 리스크 |
|---|---|---|---|---|
| 1 | 동일 대상 신고 N건 누적 시 자동조치(자동숨김/우선순위상승/자동정지) | ❌없음 | `reports.py`에 `report_count`(`:80-133`, `func.count().where(reported_user_id==...)`)는 **계산해서 화면에 보여주기만** 함. 이 값을 조건으로 한 자동 액션(HIDDEN 전환, 우선순위 재정렬 등)은 `listings.py`/`reports.py`/`users.py` 어디에도 없음 | 신고 10건 쌓인 매물이 운영자가 안 열어보면 그대로 노출 지속 |
| 2 | 신고 사유 카테고리별 차등 처리(SLA·조치) | ❌없음 | reason 값은 프론트 상수(`market.ts:187` FRAUD/PROHIBITED/SPAM/DUPLICATE/OTHER, `dm.ts:257` ABUSE/SCAM/SEXUAL/SPAM/OTHER)로 존재하나, 백엔드는 필터 조건으로만 쓸 뿐(`reports.py:154,167`) FRAUD가 SPAM보다 먼저 처리되도록 만드는 로직·정렬 가중치가 없음 | 사기 신고와 스팸 신고가 동일한 "먼저 온 순"(`order_by(created_at.desc())`, `reports.py:179`)으로 취급 |
| 3 | 신고 큐 우선순위·SLA·미처리 경보 | ❌없음 | `reports.py:179` 정렬은 `created_at DESC`뿐. `ops_alerts.py`(§I-2)는 5xx·백업 실패만 트리거하고 "N시간 이상 미처리 신고"를 감시하는 코드는 없음(완료이의 큐만 `min_pending_hours` 필터가 있음 — `trades.py`, 신고 큐엔 없음) | 신고가 쌓여도 아무도 모른다 — 운영자가 능동적으로 화면을 열어야만 존재를 앎 |
| 4 | 제재 사다리(enforcement ladder) — 제재 종류 | ✅부분코드화(종류만) | `database/init/127_user_sanctions.sql` + `models.py:1759-1774` `UserSanction`: `type`(WARN/SUSPEND/BAN/LIFT, `users.py:292` `_SANCTION_TYPES`), `reason`(필수), `report_id`(연결), `ends_at`(SUSPEND만), `admin_username` | — |
| 5 | 제재 기간·자동해제 | 🟡부분(수동 선택+지연평가 자동해제, 스케줄러 없음) | 기간은 `body.days`(1~365, `users.py:296`)를 **매번 운영자가 직접 입력** — 사전 정의된 단계값(예: 1차 3일/2차 7일/3차 영구) 없음. 자동해제는 `deps.py:37-41` `enforce_account_active`가 **다음 로그인/요청 시점에** `suspended_until<=now`면 lazy하게 ACTIVE로 되돌리는 방식 — 별도 배치잡으로 정시에 푸는 게 아니라 유저가 다시 요청을 보내야 풀린다(요청을 안 보내면 만료 이후에도 DB `status`는 SUSPENDED로 남음, 화면상 표시만 그럴 뿐 실제 차단 여부엔 영향 없음) | 재로그인 안 하는 유저는 "정지 상태"로 영원히 표시됨(단, 실질 차단효과와는 무관) |
| 6 | 누범 자동 에스컬레이션(1차 경고→2차 정지→3차 영구) | ❌없음 | `users.py:284-347` `create_sanction`이 과거 `UserSanction` 이력을 조회해 단계를 계산하는 코드가 없음 — `type`·`days` 전부 매 호출마다 운영자가 자유 선택(`SanctionCreateRequest`) | 3번째 신고든 10번째 신고든 운영자 기분에 따라 경고로 끝날 수도, 바로 영구정지될 수도 있음 — 일관성 없음, 분쟁 시 방어 불가 |
| 7 | 제재의 실제 차단 범위 | ✅완성(전역 차단 확인) | `backend/app/deps.py:79` `enforce_account_active(user, now)`가 `verify_user_session`(거의 전 인증 라우트의 공용 의존성) 안에서 호출됨 → BANNED/SUSPENDED는 **로그인 이후의 모든 인증 API가 403**(로그인/DM/매물등록/고객센터 문의 등 예외 없이 전부 포함, `support.py:20` 포함) | — |
| 8 | 매물 조치 시 상태값 | ✅완성(HIDDEN/REMOVED/RESTORE 3종) | `listings.py` `_MODERATE_ACTIONS` | — |
| 9 | 매물 조치 사유 전달 | ✅완성(판매자만) | `listings.py:240-249`(Notification, 사유 텍스트 포함) — **구매자에게는 통보 없음**(§4 P1) | 진행 중 거래의 구매자가 매물 소멸을 모른 채 방치됨 |
| 10 | 매물 이의제기·재제출 경로(판매자) | ❌없음 | `_MODERATE_ACTIONS`의 RESTORE는 **관리자만** 실행 가능한 액션이고, 판매자가 "이의 있음"을 제출해 재검토를 요청하는 앱 내 엔드포인트 미발견 | 판매자는 사유 통보만 받고 별도 대응 채널(이메일 등 오프코드) 없이는 되돌릴 방법이 없음 |
| 11 | 피신고자(제재당한 유저)의 인앱 이의제기 | ❌사실상 막힘 | `frontend/src/pages/auth/Suspended.tsx:62`(`t('suspended.contactHint')`="이의가 있으시면 고객센터로 문의해주세요")이지만, 고객센터 티켓 생성(`backend/app/routers/support.py:17-21`)이 `verify_user_session`을 거치고 그 안에서 `enforce_account_active`(정책 7)가 SUSPENDED/BANNED를 403 시킴 → **문구가 가리키는 경로 자체가 API 레벨에서 막혀 있다.** 이메일 등 인앱 밖 채널 존재 여부는 미확인 | 정지·오신고된 유저가 논리적으로 이의를 제기할 방법이 앱에 없음 — 신뢰 리스크·법적 리스크 |
| 12 | 허위 신고(신고 남용) 대응 | ❌없음 | `reports.py`/`Report` 모델에 신고자별 이력 집계·남용 플래그 컬럼·로직 없음(`reporter_id`는 저장되지만 카운트·차단 로직 미발견) | 악의적 대량 신고로 특정 유저를 몰아붙이는 공격에 대한 방어 없음 |
| 13 | 조치 증적 3요소(누가·언제·왜) | ✅완성 | `models.py:1776-1787` `AdminAuditLog`(admin_username·admin_role·action·target_type/id·**detail JSONB(사유 포함)**·ip·created_at), 전 mutation이 `_audit.py` `audit()` 경유(`reports.py:273`, `users.py:337,365`, `listings.py:274`, `trades.py` 등) | — |
| 14 | 분쟁 시 대화·거래 이력 조회 권한 | ✅완성(스코프 제한) | `reports.py:283-306`(`/report_id/dm-messages`) — **DM 관련 신고 건에 한해서만** 열람 가능(`not_dm_scoped` 403 가드), 무관한 유저의 DM을 임의로 열어볼 수는 없음(개인정보 관점에서 최소권한 설계) | — |
| 15 | 베트남 법규 — 콘텐츠 삭제·계정정지 통보 의무, 보관기간 요건 | 미확인 | 코드로 판단 불가 | **법무 확인 필요** |

**총평**: 제재 "실행"(도구·차단효과·감사로그)은 견고하게 코드화돼 있다(정책 4,7,8,9,13,14 — ✅ 5개). 반면 "판단"(언제·얼마나·왜 이 강도로) 쪽은 전 항목이 운영자 재량이고(정책 1,2,3,6,10,12 — ❌ 6개), 이의제기 경로는 코드가 스스로 막고 있다(정책 11). 리스크: **운영자 재량 100%인 구간은 인력이 늘수록 판단 기준이 갈라지고, 분쟁 발생 시 "왜 이렇게 조치했는가"를 정책 문서/코드로 방어할 수 없으며, 대응이 신고 건수에 선형으로 붙어(자동화 0) 인력 투입도 선형 증가한다.**
