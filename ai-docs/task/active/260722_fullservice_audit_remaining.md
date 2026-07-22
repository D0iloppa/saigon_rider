# 전 서비스 감사 — 현재 코드 기준 남은 작업 (reconciliation @ HEAD 6f94b93)

> 작성 2026-07-22. 원본 감사(`260722_service_user_full_launch_audit_task.md` + `HANDOFF_FULL_SERVICE_REVIEW.md`)를 **codex1(지도)+codex2(auth PR-1)+데드코드정리 이후 현재 코드**에 대조한 결과.
> 방법: 3개 서브에이전트(auth / reward·privacy / P1) 병렬 정독, 감독 종합. 근거는 현재 파일 file:line.
> **핵심: 원본 감사의 상당수가 이미 해결됨. 아래 OPEN만 남았다.**

---

## 0. 이미 해결됨 (재작업 금지)

- **P0-1 세션토큰**(deps.py:54-85 X-User-Id+X-Session-Token 검증), **P0-3 위치 프라이버시**(FeedCreate 기본 OFF·공개 feed Ward centroid 마스킹, 완전), **P0-4 코어**(dm.py:219 seller 검증+migration 132), **P0-5 가짜보상**(/ride/submit·DBG 완전 제거, 보상은 멱등 Engine 콜백만), **P0-8 보상 원자성**(idempotency saga 135/136+retry job+readiness), **DB-1**(041/060 to_regclass 가드+alembic auto)
- AUTH-1/2/3/5/6/7/8, 대부분 IDOR mutation(profile/feed-like/dm/quest-accept/market-wishlist/device-map auth), QST-1/2/3/4/5/6/9/10, MKT-4/5/6, FD-1, BIZ-8/12, ENG-3, EG-6

---

## 1. 🔴 출시 차단급 (Batch A — 최우선)

| ID | 문제 | 위치 | 성격 |
|---|---|---|---|
| **MKT-11/DB-10** | `marketplace_reviews.rating` DDL=`VARCHAR(8) CHECK('GOOD','BAD')` vs ORM/API=`SmallInteger 1..5` → **fresh DB에서 매물리뷰 INSERT 전부 실패** | `database/init/088_marketplace_reviews.sql:15` ↔ `models.py:483`·`market.py:752` | 마이그레이션(SMALLINT 1..5, 123 참조) |
| **ADM-2** | badge condition 저장형 XSS(metric/op/value h() 없이 삽입) | `admin_legacy.py:2472-2483` | XSS·운영자세션 |
| **ADM-3** | item_code inline `onclick` XSS → admin→root 상승 | `admin_legacy.py:1991` | XSS·권한상승 |
| **ADM-4** | `_build_pagination` 반사형 XSS(쿼리스트링 무이스케이프) | `admin_legacy.py:527-540` | XSS |
| **ADM-5** | JWT role 누락 시 `or "root"` fail-open | `admin_auth.py:60` | 권한 |
| **ENG-11** | ops daily-net SQL이 없는 `currency` 컬럼 참조 → **인플레 감시 대시보드 500** | `engine/.../admin.py:481-489` | 운영 불능 |
| **ENG-2** | `MILEAGE_XP` `is_active=false` 방치 → **5km 라이드 보상 0 지급**(054가 RP+Gold 추가했으나 재활성 안 함) | `alembic/042:23`, 054 | 사용자 보상 유실 |

## 2. 🟠 보안 IDOR·프라이버시 잔여 (Batch B — 대부분 기계적)

| ID | 문제 | 위치 |
|---|---|---|
| AUTH-12 | `GET /users/me/stats`·`/quest-history` 무인증 IDOR | `users.py:102-219` |
| (quest-read) | `/quests/my-accepted`·`my-completed`·`completed-ids` 무인증 | `quests.py:216-267,312+` |
| CUR-5 | `GET /badges?user_id=` 무인증 IDOR | `badges.py:14-19` |
| AUTH-4(부분) | 차단이 DM엔 적용되나 **follow·feed 댓글 미적용** | `follows.py:52-91`, `feed.py` 댓글 |
| device-map FCM | 빈 fcm_token이 유효 토큰 덮음 | `engine/.../device_map.py:112-121` |
| AUTH-9 | `skill_pt` read-check-write 비원자 → 음수 | `users.py:89-96` |
| AUTH-10 | dev-login `APP_ENV` 미설정 시 fail-open | `auth.py:785` |
| BIZ-5 | internal.py 4개 핸들러 `uuid.UUID()` try/except 없음 → 500·보상유실 | `internal.py:58,80,96,105` |
| BIZ-2 | SVG 저장형 XSS(content-type만 검사) | `contents.py:34-40` |
| BIZ-10 | `view_ping` 무인증 헤더로 조회수 조작 | `biz.py:625-634` |
| BIZ-1 | 이미지 업로드 동기 I/O로 event loop 블로킹 | `contents.py:88` |

## 3. 🟡 거래 무결성 (Batch C)

| ID | 문제 | 위치 |
|---|---|---|
| MKT-3 | 판매자가 거래 없이 SOLD/sold_count 조작 | `market.py:562-586,431` |
| MKT-1(부분) | buyer→seller 리뷰 참여검증 없음(별점폭탄) | `market.py:792-793` |
| MKT-7 | SOLD 후 가격수정 + 합의가 스냅샷 없음 | `market.py:590-619,1400` |
| MKT-2 | cross-conversation 이중 accept/complete | `market.py:1102-1144` + 105 |
| MKT-9/DB-2 | 등록 시 음수가격 + CHECK(>=0) 없음(3컬럼) | `schemas.py:194`, `084/090/110` |
| DB-3 | `ride_sessions.user_quest_id` unique 없음 | `001:141-156` |
| DB-11 | appointment/offer status CHECK 없음 | `105:18`,`110:14` |

## 4. 🟡 Engine 경제 정합성 (Batch D)

ENG-1(캡 클램프 아님)·ENG-4(신규계정 감쇄 RP 미적용)·ENG-5(XP/gold 캡 TOCTOU)·ENG-6(idem TTL 재사용 500)·ENG-7(day_end 무상한)·ENG-8(미션보상 캡우회)·ENG-9(캡초과 PROCESSED)·ENG-10(RP 원장 없음)·ENG-12(naive datetime)·ENG-13(거부시 user row 생성) — 위치 `engine/app/services/{anti_abuse,event_bus,mission,xp_ledger}.py`.
CUR-3(환불 표시)·CUR-4(엔진 timeout 500)·CUR-6(idem catalog_id 미검증)·CUR-7/8(ceiling_reset·item_name 하드코딩)·CUR-9(total_catalog 213)·CUR-10(비활성 가챠 pity)·CUR-11/12(broad httpx 미변환) — `gacha.py/shop.py/inventory.py`, `engine reward.py:22`.

## 5. 🟡 피드·지원·비즈 기능 갭 (Batch E)

FD-3(피드 차단필터 없음)·FD-4(신고 라우트 없음)·FD-5(xack 잔여중복)·FD-6(publish 유실)·FD-9(차단 키워드알림)·FD-2/12(support 유저답글·답변알림 없음) / BIZ-3(번역 rate limit)·BIZ-4(content_id FK)·BIZ-6(self-review)·BIZ-7(공백 신청)·BIZ-9(번역실패 무표시)·BIZ-11(app_version 활성행 중복).

## 6. 🟢 인프라 하드닝 (Batch F)

DB-4(service-key `:?` fail-fast)·DB-6(중복 migration prefix 002/042/092/093/138)·DB-7(marketplace/biz/poi GIST)·DB-8(nginx rate limit)·DB-9(보안헤더)·DB-13(htpasswd changeme)·DB-14(`[DEV]` seed 무조건 노출) / ADM-6(admin 브루트포스) / AUTH-11(oauth state Redis) / P0-1 잔여(OAuth sessionToken URL query → 1회용 code).

## 7. ⏸ 게이미피케이션 보류(DEFERRED) + ★결정 필요

- **DEFERRED**(재개 시): CUR-1/2 시즌 claim 실지급, EG-1/8 시즌 claim 원자성 — 엔드포인트 주석처리됨.
- **★결정 필요 — `/gacha/pull`은 현재 살아있음**(보류에서 dead만 주석, pull은 active). 그래서 **EG-2(컬렉션필터 우회)·EG-3(천장/보장 충돌)·EG-4(중복환급 0)·EG-5(SEASON_LOCKED 환급통화)** 는 **라이브 유료재화 버그**다. 게이미피케이션이 잠정보류인데 가챠 pull은 노출 중 → **(a) 가챠도 게이트 OFF(출시서 제외)** 하거나 **(b) EG-2~5를 출시 전 수정** 중 택해야 한다. (EG-9 user_item unique, EG-10 discount 절삭, EG-11 zero-weight 500 동반)

---

## 8. 착수 순서 제안 + 모델 라우팅

1. **Batch A(차단급)** 먼저 — MKT-11 rating 마이그레이션은 fresh DB 필수, ADM XSS/ENG-11/ENG-2는 보안·운영 직결.
2. Batch B(기계적 IDOR) → C(거래) → D(경제) → E(기능갭) → F(인프라).
3. 게이미피케이션 결정(§7) 회신 후 EG 처리.

**모델 라우팅(doil-supervise §2):**
- 기계적 IDOR 세션가드 추가·CHECK 제약·try/except·nginx 설정(Batch B 일부·C DB·F) → **Sonnet**(패턴 미러링).
- **머니/인증 로직**(ENG 경제 정합성·보상·OAuth exchange code·AUTH-11 Redis·ADM XSS 권한) → **fable/opus + 사용자 승인 게이트 + reviewer**.
- 각 Batch는 신뢰경계별 PR + 재현 테스트 + qm-reviewer(고위험).

**모든 Batch는 사용자 승인 후 착수. 머니/인증 배정은 모델 승인 필요.**
