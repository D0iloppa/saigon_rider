# 002 — 팩트시트: 매물 진위 자동관리 / 신고 접수 후 고객대응 (읽기 전용 재조사)

기준 커밋: `ae4064d` (2026-08-17, `728031b` 이후 W0 8건 반영: 0870c85·d498fed·f8fa9ff 포함)
조사 일시: 2026-08-17. 소스 변경 0건.

이미 있는 자료(`000_SYNTHESIS.md`, `W2_seller.md`, `W4_admin.md`, `W5_listing_trust.md`, `001_DECISIONS.md`)와 중복 서술 최소화 — 이 문서는 **W0 8커밋 반영 후 현재 상태의 차이만** 정밀 재확인한다.

---

## 주제 A. 매물 진위(authenticity) 자동 관리

### A-1. 등록 시점 게이트 전수 (`backend/app/routers/market.py` `create_listing`)

| 게이트 | 있음/없음 | 근거(파일:라인) | 조건 → 상태코드 |
|---|---|---|---|
| 명의 위조 방지 | 있음 | `market.py:591-592` | `body.seller_id != session_uid` → 403 |
| 업체 승인 상태 | 있음 | `market.py:601-609` | `business_profile.status != "APPROVED"` → 403 (서류검증 `verification_status` 는 미요구, 주석 명시) |
| 업체당 매물 상한 5건 | 있음 | `market.py:610-629`, 상수 `market.py:78 _BUSINESS_LISTING_CAP=5` | 활성(비-`_LISTING_INACTIVE_STATUSES`) 카운트 ≥5 → 422 |
| 개인 판매자 휴대폰 인증 | 있음 | `market.py:633-634` | `business_profile is None and seller.phone_verified_at is None` → 403 |
| 제목 필수 | 있음(최소) | `market.py:635-636` | 빈 제목 → 400 |
| 서비스 권역 검증 | 있음 | `market.py:637-638` | `not in_service_area(lat,lng)` → 422 (좌표 있을 때만) |
| **매물 본문 금칙어 필터** | **있음 (신규, f8fa9ff)** | `market.py:653-656`(create), `:723-726`(update) | 제목+설명에 금칙어 부분문자열 매치 → 400 `{"code":"banned_keyword"}` |
| 가격 상한 | 있음(신규, cd41866) | `schemas.py:205` `Field(0, ge=0, le=100_000_000_000)` | 1000억 VND 초과 → 스키마 검증 422. **오입력 방어 아님** — DB 실측 100억 VND "소파" 매물이 이미 통과해 있음(`001_DECISIONS.md` D-21) |
| 이미지 개수 상한 | 프론트만 | `MarketCreate.tsx:20 MAX_IMAGES=10` | 백엔드 강제 미확인(코드 열람 범위 밖) |

**금칙어 필터 구현 세부**: 공용화됨 — `backend/app/services/banned_keywords.py`(60초 TTL 캐시, `BannedKeyword` 테이블 조회) → `dm.py:30,380-381`(기존)과 `market.py:66,653-656,723-726`(신규, create+update 둘 다) 양쪽에서 import. **`database/init/131_banned_keywords.sql` 주석("매물/게시글 등록 시 필터링")과 구현이 이제 일치** — `000_SYNTHESIS.md` §8 지적 사항 해소됨.

별도로 `market.py:1157-1208`에 성조 정규화(`_banned_keywords_norm`) 캐시가 있음 — 이는 **키워드 알림(keyword alert) 매칭용**이며 등록 게이트가 아님(용도 다름, 혼동 주의).

### A-2. 매물 상태 머신

| 항목 | 값/위치 |
|---|---|
| `_VALID_STATUSES`(전이 허용값) | `market.py:76` — `{"ON_SALE","RESERVED","SOLD","WITHDRAWN"}` |
| 실제 DB `status` 컬럼이 가질 수 있는 전체값 | 위 4종 + `"HIDDEN"`, `"REMOVED"`(모더레이션 전용, `admin_api/listings.py:24 _LISTING_STATUSES`) — 총 6종 |
| `_LISTING_INACTIVE_STATUSES`(비노출 판정 집합) | `market.py:80` — `("HIDDEN","REMOVED","WITHDRAWN","SOLD")` |
| 등록 직후 초기 상태 | `market.py:655` 부근 `create_listing` → `ON_SALE` (사전승인 큐 없음, 즉시 노출) |
| 전이 주체 | 사용자: ON_SALE↔RESERVED(수동 토글, `MarketDetail.tsx:429-439`), ON_SALE→WITHDRAWN(철회), ACCEPTED 약속 완료→SOLD(`complete_appointment`, `market.py:1391-1427`) / 운영자: HIDDEN·REMOVED·RESTORE(`admin_api/listings.py` `_MODERATE_ACTIONS`, `:27-31`) / 시스템: 없음(자동 전이 코드 0건, A-7 참조) |
| **소유자 열람 예외 (신규, 0870c85)** | `market.py:465-466`(상세 GET: `status in ("HIDDEN","REMOVED") and seller_id != session_uid` → 404, 소유자는 통과) / `market.py:353-354`(목록: `is_own_listings` 이면 `_LISTING_INACTIVE_STATUSES` 필터 자체를 생략) — **비소유자는 여전히 404** |

### A-3. 어드민 검수 큐 기계판정 플래그

| 항목 | 근거 |
|---|---|
| 플래그 4종 | `admin_api/listings.py:82-92` `_flags_for()`: `LOW_PHOTOS`(사진<2), `ZERO_PRICE`(price_vnd==0), `NO_CATEGORY`(category_id NULL), `DUPLICATE` |
| 계산식/데이터 소스 | 쿼리 시점 계산, DB 컬럼 저장 없음 — `list_listings`/`get_listing` 응답에만 실림 |
| 노출/차단 영향 | **표시 전용.** `_flags_for()` 결과는 `AdminListingRow.flags`/`get_listing` 응답 필드에만 쓰이고, 이 값을 조건으로 `status`를 바꾸는 코드는 `listings.py` 전체에 없음(직접 확인: `grep flags` 결과 응답 조립부 2곳뿐). 상태 전이는 오직 `moderate_listing`/`bulk_moderate_listings`의 운영자 수동 액션(`_MODERATE_ACTIONS`)에서만 발생 |

### A-4. 중복 탐지 범위

| 항목 | 근거 |
|---|---|
| 비교 대상 | `admin_api/listings.py:95-117 _duplicate_ids()` — `business_profile_id in_(...)` 조건으로 **같은 업체 프로필 내부만** 조회(`:99-101`) |
| 판정 기준 | `(business_profile_id, title, images[0].content_id)` 완전일치(`:110-112`) — 퍼지매칭 없음 |
| 개인 판매자 간 중복 | **탐지 안 됨** — `business_profile_id`가 NULL인 개인 매물은 `business_ids` 집합에 안 들어가 비교 대상에서 제외(`:99` `if listing.business_profile_id is not None`) |
| 이미지 기반 탐지(pHash 등) | **없음** — `grep -riE "pillow|imagehash|phash|perceptual.?hash" backend/requirements.txt backend/app` → 0건(직접 실행 확인) |

### A-5. 이미지 업로드 검증 (`backend/app/routers/contents.py`)

| 항목 | 있음/없음 | 근거 |
|---|---|---|
| MIME 화이트리스트 | 있음 | `contents.py:35-40` `ALLOWED_MIME_TYPES = {jpeg,png,gif,webp}` |
| 매직넘버 검증 | 있음 | `contents.py:43-52` `_sniff_mime()` — 파일 첫 바이트로 재검증, declared content_type과 불일치 시 400(`:101-102`) |
| 용량 상한 | 있음 | `contents.py:33` `MAX_UPLOAD_BYTES = 15MB`, 초과 시 413(`:99-100`) |
| EXIF 처리 | **없음** | `contents.py` 전체에 EXIF 리더/스트리퍼 코드 없음(Pillow 자체가 의존성에 없어 불가) |
| pHash/스톡사진 탐지 | **없음** | 위 A-4와 동일 grep 결과 |
| 원본 보존 여부 | 보존(변환 없음) | `contents.py:96-104` 업로드 바이트를 그대로 디스크에 write, 리사이즈/재인코딩 코드 없음 |
| imgproxy 변환 경로 | 조회 시점 URL 생성만 | `build_imgproxy_url()`(`utils.py`, 응답 조립 시 호출) — 원본 파일은 그대로, imgproxy가 요청 시점에 변환 |

### A-6. 신뢰 신호 계산 재료 (`backend/app/models.py`)

| 필드 | 있음/없음 | 근거 |
|---|---|---|
| 휴대폰 인증 여부(`phone_verified_at`) | **있음** | `models.py:130` |
| 계정 생성일(`created_at`) | **있음** | `models.py:158` |
| 매너온도(`manner_temp`) | **있음** | `models.py:151`, 리뷰 평점 기반(`market.py:1073` 부근 `_recompute_manner_temp`, W2 감사가 노쇼 연동은 없다고 확인) |
| 거래 완료 횟수 | **없음(컬럼 없음, 쿼리로만 산출)** | `models.py` User/MarketplaceListing 어디에도 `sold_count`/`completed_trades` 컬럼 없음 — `market.py:498-506`가 `MarketplaceAppointment.status=='COMPLETED'` 집계로 **요청 시점 계산**만 함 |
| 후기·평점 | **있음(별도 테이블)** | `MarketplaceReview`류(models.py, `create_review` `market.py:984-1075`가 참조) — User/Listing에 비정규화 평균 컬럼은 없음(추정, 직접 컬럼 열람은 안 했으나 review 개별 테이블 존재는 W2 S-8a로 확인됨) |
| 신고 누적 수 | **없음(컬럼 없음, 쿼리로만 산출)** | `Report` 모델(`models.py:1705-1735`)에 카운터 컬럼 없음 — `reports.py:80-83 _report_count()`가 매 조회마다 `func.count()` 집계 |
| 정지 이력 | **있음** | `UserSanction`(`models.py:1762-1776`) — `type/reason/report_id/ends_at/admin_username/created_at` |
| 계정 상태(`status`/`suspended_until`) | **있음** | `models.py:155-156` |
| 업체 검증 상태 | **있음(2축)** | `BusinessProfile.status`(계정 승인, `models.py:635`) + `verification_status`(서류검증, `:639`, 서류 미수집 상태로 운영 중 — W5 A-1#3) |
| 매물 신뢰 점수(단일 필드) | **없음** | `MarketplaceListing` 클래스(`models.py:455-499`) 전체 필드 확인 — `like_count`/`view_count`/`agreed_price_vnd`/`moderated_at`만 있고 종합 스코어 컬럼 없음 |

### A-7. 자동 조치 코드(자동 숨김/노출 하향)

**0건.** 근거:
- `grep -n "status\s*=\s*[\"']HIDDEN\|REMOVED" backend/app/routers/market.py backend/app/routers/admin_api/listings.py` → `market.py`에는 매칭 없음(0건), `admin_api/listings.py`에는 `_apply_moderation()`(운영자 수동 호출 경로) 1곳만
- A-3에서 확인했듯 `_flags_for()` 결과가 상태 전이 조건으로 쓰이는 코드 없음
- `_duplicate_ids()` 결과도 플래그 표시용이며 자동 차단 트리거 없음
- 배치/스케줄러 잡 목록(A-8)에 매물 상태를 건드리는 잡 없음

### A-8. 배치·워커 인프라

| 수단 | 등록된 잡 | 근거 |
|---|---|---|
| `AsyncIOScheduler`(BFF, `main.py` lifespan) | `fuel_fetch_*`(4회/일), `flood_risk_*`(2회/일), `refresh_repair_shop_stats`(5분), `expire_stale_flood_reports`(5분), `retry_failed_quest_rewards`(1분), `purge_deleted_accounts`(매일 03:10), `backup_db`(매일 02:30) — **총 7개 잡, 매물/신뢰 도메인 잡 0개** | `main.py:75-129` |
| `noti_worker`(Redis Streams consumer) | `noti:events` 스트림 소비 → 타입 분기·키워드 매칭·notifications INSERT·FCM 푸시. DLQ(`noti:events:dlq`) 격리(5회 실패 기준) | `backend/app/noti_worker/__main__.py:1-60` |
| `noti_events` 아웃박스 패턴 | 등록 트랜잭션 안에서 `noti_events.enqueue(db, "market.listing_created", ...)`(`market.py` 인접) — 커밋~발행 사이 유실 방지, 검색색인·알림에 이미 사용 중 | `market.py` create_listing 말미(라인 근접, `noti_events.enqueue` 호출부 2회 확인: `market.listing_created`, `search.reindex`) |
| **새 배치를 붙일 자리** | (a) `main.py`의 `scheduler.add_job()` 패턴을 그대로 복제해 신규 잡 등록 가능(예: 가격 밴드 재평가), (b) `noti_events.enqueue` 아웃박스에 신규 이벤트 타입을 태워 `noti_worker`가 소비하도록 확장 가능 — 두 경로 모두 기존 코드에 실재하는 선례(가상 제안 아님) |

---

## 주제 B. 신고 접수 후 고객대응

### B-1. 신고 접수 경로 전수

| 대상 | 엔드포인트 | 저장 테이블 | 사유 분류값 | 중복 방지 |
|---|---|---|---|---|
| 매물(LISTING) | `POST /market/listings/{id}/report`(`market.py:911` 부근 `report_listing`) | `Report`(`models.py:1705`, `target_type="LISTING"`) | `_VALID_REPORT_REASONS`(`market.py:909`) = `{SPAM,FRAUD,PROHIBITED,DUPLICATE,OTHER}` | 있음 — `market.py:936-944`, `reporter_id+listing_id` 부분 유니크(`uq_reports_listing_once`) 사전 조회 |
| DM 대화(DM) | `dm.py`의 `reportConversation` 경로(`dm.py:480-500` 부근) | `Report`(`target_type="DM"`) | 프론트 상수 `dm.ts:257` = `{ABUSE,SCAM,SEXUAL,SPAM,OTHER}` | 있음 — `dm.py:480-490`, `uq_reports_dm_once`(conversation_id+reporter_id) |
| 사용자(USER) | 코드상 `target_type="USER"`이 `reports.py`의 `_TARGET_TYPES` 필터에 존재하나, **이번 조사에서 USER 타입을 직접 생성하는 사용자측 엔드포인트를 찾지 못함**(미확인 — `market.py`/`dm.py`는 LISTING/DM만 생성) |
| 매물 자기신고 차단 | 있음 | `market.py:908` `listing.seller_id == session_uid` → 400 |
| 후기(리뷰) 신고 | **미확인** — grep 범위 밖, `Report.target_type` 값 카탈로그에 REVIEW 없음(`_TARGET_TYPES = {LISTING,USER,DM}`, `reports.py:26`) → **없음으로 추정**(review 신고 엔드포인트 미발견) |

### B-2. 신고 처리 워크플로 (`admin_api/reports.py`)

- 상태값: `PENDING/REVIEWING/RESOLVED/REJECTED`(`reports.py:26`)
- 전이표: `_ALLOWED_TRANSITIONS`(`reports.py:29-32`) — `PENDING→{REVIEWING,RESOLVED,REJECTED}`, `REVIEWING→{RESOLVED,REJECTED}`, 종결 상태에서는 키 자체가 없어 **모든 역전이·재전이가 400**
- 담당자 배정 개념: **없음** — `Report` 모델에 assignee 컬럼 없음, `handled_by`(`models.py:1734`)는 **처리 완료 시점**에 세팅되는 필드일 뿐 사전 배정 필드가 아님(`reports.py:252-263` `update_report_status`에서 상태 변경과 동시에 세팅)
- SLA 개념: **없음** — `reports.py` 어디에도 기한(`due_at`) 컬럼·계산 없음
- 우선순위 개념: **없음** — 사유(FRAUD 등)별 가중치 로직 없음
- 목록 정렬: `reports.py:179` `order_by(Report.created_at.desc(), Report.id.desc())` — 접수 최신순 고정, 사유·심각도 무관

### B-3. 제재 집행

| 항목 | 근거 |
|---|---|
| 제재 종류 | `WARN/SUSPEND/BAN/LIFT` — `database/init/127_user_sanctions.sql` CHECK 제약, `models.py:1769` |
| 기간 | SUSPEND만 `days`(1~365, 운영자 자유 입력) → `ends_at` 계산(`admin_api/users.py:296,305`) |
| 전역 실효 지점 | `deps.py:79`(정확히는 `deps.py` `enforce_account_active()`, 함수 시작 라인) — `verify_user_session`(`deps.py:82-95`) 안에서 매 요청마다 호출, BANNED→403 `account_banned`, SUSPENDED(미만료)→403 `account_suspended` |
| 자동 해제 | **배치 아님, lazy 방식** — `deps.py` `enforce_account_active()` 내부에서 `suspended_until <= now`면 그 요청 처리 중에 `status="ACTIVE"`로 되돌림(`deps.py` 함수 본문 확인, 커밋은 호출부). **유저가 재요청을 보내야만** 풀림 — 별도 스케줄러 잡 없음(A-8 잡 목록에 해당 잡 부재로 교차 확인) |
| 누범 이력 조회 | **집행 시점엔 자동 반영 안 됨** — `admin_api/users.py:284-347 create_sanction()`이 과거 `UserSanction` 이력을 조회하는 코드 없음(직접 확인, `_get_user_or_404` 호출 후 바로 `type`/`days` 처리로 진입). 단 **조회 API 자체는 있음** — `reports.py:189-198`(신고 상세 응답에 최근 5건 `UserSanction` 포함), `admin_api/users.py`의 유저 상세(`_user_detail`)도 이력 반환(W4 B-5 근거 유지) |
| `verify_user_session_allow_suspended`(d498fed) | `deps.py` 신설 — 세션 검증은 하되 `enforce_account_active` 호출을 생략. **`support.py` 티켓 생성(POST) 단 1곳에만 사용**(`support.py:19`), 다른 라우트 전이 없음(주석 명시 "다른 라우트에는 사용하지 말 것") |

### B-4. 신고자에 대한 응답

**없음.** 근거: `grep -n "reporter_id" backend/app/routers/admin_api/reports.py backend/app/routers/market.py backend/app/routers/dm.py` 결과 — 신고 상태 변경(`update_report_status`, `reports.py:252-274`)에서 `Notification` INSERT 호출 0건. `reporter_id`는 관리자 화면 표시(닉네임 조회)에만 쓰이고, 처리 결과를 신고자에게 통보하는 코드 경로 없음.

### B-5. 피신고자에 대한 통보

| 조치 | 통보 여부 | 근거 |
|---|---|---|
| 매물 HIDE/REMOVE/RESTORE | 있음(판매자만) | `admin_api/listings.py:_apply_moderation()` — `Notification(type="MODERATION", body=f"...사유: {reason}", link="market&id=..." if HIDE else None)` |
| 유저 WARN/SUSPEND/BAN | 있음 | `admin_api/users.py:329-331` `Notification(user_id=user_id, type="MODERATION", title=noti_title, body=noti_body, link=None)` — **딥링크 없음**(`link=None` 고정) |
| 진행 중 거래의 구매자(매물 REMOVED 시) | **없음** | `_apply_moderation()`이 `listing.seller_id`에게만 Notification 생성, 구매자(DM 상대) 대상 알림 코드 없음 |
| 채널 | 인앱 `Notification` 테이블 INSERT뿐 (B-7에서 이메일/SMS 부재 확인) — `noti_worker`가 이 INSERT를 소비해 FCM 푸시로도 전달(설정 토글에 따름, `noti_worker/__main__.py` `_push_enabled`) |

### B-6. 이의제기(appeal) 경로 — `support.py` 티켓 라이프사이클

| 액션 | 엔드포인트 | 인증 의존성 | 정지 사용자 접근 |
|---|---|---|---|
| 티켓 생성 | `POST /support/tickets` | `verify_user_session_allow_suspended`(`support.py:19`) | **가능(d498fed)** |
| 내 티켓 목록 | `GET /support/tickets` | `verify_user_session`(`support.py:38`) | **403**(`enforce_account_active` 미우회) |
| 티켓 상세 | `GET /support/tickets/{id}` | `verify_user_session`(`support.py:58`) | **403** |
| 답글 작성(본인) | `POST /support/tickets/{id}/replies` | `verify_user_session`(`support.py:85`) | **403** |

→ **`001_DECISIONS.md` D-22가 이미 이 갭을 "열어야 함(미착수)"로 기록** — 이번 재확인 결과 코드는 여전히 목록/상세/답글 3개 라우트 모두 `verify_user_session`이며 변경 없음(직접 파일 열람으로 확정, 추측 아님).

**운영자측 처리**: `admin_api/support.py:83-` (W4 H-1 근거 유지, 이번 세션 재확인 안 함 — 000_SYNTHESIS 근거를 그대로 승계) — 목록/상세/답변/상태변경 존재, 첫응답 SLA는 대시보드에 집계.

### B-7. 고객대응 채널 인프라

| 채널 | 있음/없음 | 근거 |
|---|---|---|
| 인앱 알림(Notification+FCM) | 있음 | `noti_worker/__main__.py` 전체 |
| 이메일 발송(smtplib/SendGrid/SES) | **없음** | `grep -rniE "smtplib|sendgrid|twilio| ses\.|send_email|send_sms" backend/app` → **0건**(직접 실행 확인) |
| SMS 게이트웨이 | **없음** | 동일 grep, 0건. (OTP 발송 방식은 이번 조사 범위 밖 — Zalo 등 별도 경로 가능성 미확인) |

### B-8. 감사 증적 (`AdminAuditLog`)

| 필드 | 근거 |
|---|---|
| 스키마 | `models.py:1779-1790` — `admin_username, admin_role, action, target_type, target_id, detail(JSONB), ip, created_at` |
| 커버 범위 | 신고 상태변경(`reports.py:273 audit(...,"REPORT_STATUS",...)`), 매물 모더레이션(`listings.py` `LISTING_{action}`), 유저 제재(`users.py` `USER_{type}`, `USER_LIFT`), 거래 강제완료(`trades.py`, W4 근거 승계) — **전건 mutation 커버 여부는 이번 세션에서 전수 검증 안 함**(표본 4개 확인, "전부"라는 단정은 W4 원 보고서 문구를 승계) |
| 조회 API/화면 | 있음 — `admin_api/audit_logs.py:34-68`(W4 A-4 근거 승계, 이번 세션 재열람 안 함) |

### B-9. 운영 경보 (`ops_alerts.py`)

- 감시 대상: 5xx 미처리 예외(`main.py` 전역 핸들러 호출, W4 근거 승계), DB 백업 실패(`backup_db.py`) — **이번 세션에서 `ops_alerts.py` 본문 재확인 결과 감시 트리거는 함수 자체엔 없고 호출부가 결정**. `ops_alerts.py`는 웹훅 발송 유틸(`send_ops_alert`, 키별 60초 쿨다운, `OPS_ALERT_WEBHOOK_URL` 미설정 시 로그만) 하나뿐이며 "무엇을 감시할지"는 호출부 몫
- **미처리 신고 적체 감시**: `grep -n "send_ops_alert" backend/app/routers/admin_api/reports.py` → **0건**(직접 실행 확인) — 신고 큐 적체를 감시하는 코드 없음

---

## 이 팩트시트가 확인하지 못한 것

- USER 타입 신고를 생성하는 사용자측 엔드포인트 존재 여부(B-1) — `_TARGET_TYPES`에 값은 있으나 생성 경로를 못 찾음. 프로필 화면 등 미탐색 영역에 있을 가능성.
- 후기(리뷰) 자체에 대한 신고 경로 존재 여부 — `Report.target_type` 카탈로그에 값이 없어 "없음"으로 잠정 판단했으나 review 라우터 전체를 훑지 않음.
- `AdminAuditLog`가 **전(全) mutation**을 예외 없이 커버하는지 — 표본 4개(REPORT_STATUS/LISTING_*/USER_*/거래)만 확인, 나머지 admin_api 라우터 전수 조사 안 함.
- OTP(휴대폰 인증) 발송이 실제로 SMS/Zalo 중 어느 경로인지 — B-7 grep은 "이메일/SMS 게이트웨이 부재"만 확인했고 기존 OTP 발송 메커니즘 자체는 조사 범위 밖.
- `MarketplaceReview` 테이블의 정확한 컬럼 구성(A-6) — 존재는 W2 근거로 확인되나 이번 세션에서 직접 스키마를 열람하지 않음.
- 운영 DB 실데이터(신고 처리 실적, 정지 이력 실건수), 실기기 동작(FCM 실제 도달 여부), 베트남 법규상 통보 의무 — 정적 코드 분석으로 판단 불가(W4/W5 미검증 절과 동일한 한계).
- `ops_alerts.py`를 호출하는 전체 호출부 목록 — 이번 세션은 `reports.py` 무호출만 확인, 다른 도메인의 호출 여부는 W4 원 보고서(5xx·백업) 승계.
