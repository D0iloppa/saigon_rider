# HANDOFF — 전 서비스 검증 및 수정 작업지시 (saigon_rider)

> **작성 2026-07-22.** 대상 독자: 타 PC의 Claude Code — 이 문서로 수정에 착수한다.
> **렌즈**: 서비스 **사용자 관점** (사용자가 서비스 이용 시 실제 겪는 문제 — 계정탈취·재화손실·데이터오류·기능오작동).
> **방법**: 영역별 서브에이전트 병렬 정독(읽기 전용). **코드 수정 0**.
> **검증 원칙**: 레포 카파시 4원칙 — 각 항목의 "검증" 절대로 재현/실측을 통과해야 "완료"다.
> **지도 연동**은 별도 문서 `HANDOFF_MAP_INTEGRATION_REVIEW.md` 참조(중복 정독 방지).

## 0. 환경 주의 (착수 전)
- 레포 원본은 WSL `/mnt/c/DEV/saigon_rider` 기준(codebase-memory `mnt-c-DEV-saigon_rider`, docker/pnpm 리눅스). 이 사본이 Windows `C:\saigon_rider`면 빌드·MCP·경로 정합부터 확인.
- 재빌드: `docker compose --env-file .env up --build -d <service>` (`ai-docs/agent-guidelines.md` §1). BFF=`backend/`, Engine=`engine/`.

## 1. 검증 진행 상태
| 영역 | 상태 | High |
|---|---|---|
| 인증·계정·소셜 §3.1 | ✅ | 8 |
| 중고거래 §3.2 | ✅ | 7 |
| 퀘스트·라이드 §3.3 | ✅ | 6 |
| 재화·상점·가챠 §3.4 | ✅ | 5 |
| 피드·알림 §3.5 | ✅ | 5 |
| 비즈·컨텐츠·시스템 §3.6 | ✅ | 5 |
| admin §3.7 | ✅ (ADM-1 미배선 강등) | 3 |
| Engine RP·보상 §3.8 | ✅ | 4 |
| Engine 가챠·상점·워커 §3.9 | ✅ | 5 |
| Frontend §3.10 | ✅ (핵심 35/260 파일) | 5 |
| Admin-frontend §3.11 | ✅ (43/43) | 3 |
| Database·infra §3.12 | ✅ | 4 |
| 지도 연동 | ✅ → `HANDOFF_MAP_INTEGRATION_REVIEW.md` | 3 |

**전 서비스 총계: 약 156건 (High 약 63건).** 실사용 추적으로 ADM-1(dev_context)만 미배선 확인·강등, 나머지는 라이브 배선 확정.

---

## 2. ★최우선 경보 — 인증 근간 붕괴 (P0, 확정)
`backend/app/deps.py:50-71` `verify_user_session` 이 클라이언트가 보낸 `X-User-Id` 헤더를 **UUID 파싱 + DB 존재 확인만** 하고 그대로 신뢰한다(서명·세션토큰·서버 세션 대조 전무). ⇒ **임의의 실존 유저 UUID만 알면 그 계정으로 완전 인증**된다(계정 탈취·명의도용). UUID는 피드/마켓 등에서 노출·수집 가능해 실제 악용 경로다.
아래 §3.1 의 IDOR·세션 우회 대부분이 이 근간 위에서 성립하므로, **AUTH-1 을 먼저 고치지 않으면 나머지 개별 패치는 반쪽짜리다.** (직접 코드 확인으로 확정.)

---

## 3. 영역별 상세

### 3.1 인증·계정·소셜 [완료]
범위: `routers/{auth,users,profile,follows,dm}.py`, `deps.py`. 심각도 High→Med.

| ID | 심각도 | 위치 | 증상(사용자가 겪는 일) | 수정방향 | 검증 |
|---|---|---|---|---|---|
| AUTH-1 | **High**[확정] | `deps.py:50-71` | `X-User-Id`에 아무 실존 UUID나 넣으면 그 계정으로 로그인 — 프로필변경·탈퇴·DM·팔로우 등 세션 API 전체 뚫림 | 서버 발급 랜덤 세션토큰 저장/서명 검증으로 교체, 클라 주장 user_id 불신 | 타인 UUID를 X-User-Id로 넣고 `DELETE /users/me` 성공하는지 |
| AUTH-2 | **High** | `auth.py:79-107` | 전화번호만 알면 OTP 없이 타인 계정 passcode 재발급 응답으로 받아 즉시 로그인 — **계정 완전 탈취** | 재발급 전 `/auth/otp/*` 검증 또는 기존 세션 요구 | 타인 번호로 `POST /auth/register` 반복해 새 passcode 받는지 |
| AUTH-3 | **High** | `auth.py:155-176` | 로그인 없이 번호/UUID만으로 타인 전화번호 원문·닉네임·레벨·골드 열람 | 두 엔드포인트에 세션 검증 추가 또는 응답 마스킹 | 미인증 `GET /auth/me?phone=` 에 phone 원문 노출되는지 |
| AUTH-4 | **High** | `dm.py:340-376`·`follows.py:52-87` | 차단해도 상대가 계속 DM·팔로우 가능 — 차단 무력화 | 두 쓰기 엔드포인트에 `UserBlock` 조회 후 403 | A가 B 차단 후 B→A DM·팔로우 성공하는지 |
| AUTH-5 | **High** | `dm.py:191-239,340-437` | 무관한 두 유저 대화 생성 + `sender_id` 위조로 상대 명의 메시지·읽음처리(사기·명의도용) | 세션=참가자 검증 + `sender_id==세션uid` 강제 | 무관 A,B로 대화 생성 후 sender_id=A 전송 성공하는지 |
| AUTH-6 | **High** | `profile.py:54-165` | body/Form의 `user_id`를 타인으로 바꿔 타인 닉네임·라이더타입·사진 변경 | 대상 `user_id==세션uid` 검증 추가 | body.user_id=타인으로 `PUT /profile/nickname` 반영되는지 |
| AUTH-7 | **High** | `follows.py:52-87` | 무관한 두 유저 팔로우 강제 생성/삭제 — 팔로워수 조작 | `_require_self(body.user_id, 세션uid)` 추가 | body.user_id=A,target=B 팔로우가 생기는지 |
| AUTH-8 | **High** | `auth.py:144-152` | 무인증으로 임의 user_id에 fcm_token 매핑 — 타인 푸시 가로채기 | `Depends(verify_user_session)` + user_id 대조 | 세션 없이 `POST /auth/device-map` 성공하는지 |
| AUTH-9 | Med | `users.py:91-98` | 스킬 투자 연타/병렬로 `skill_pt` 음수까지 — 포인트 이중사용 | `UPDATE ... SET skill_pt=skill_pt-1 WHERE skill_pt>=1` 원자적 조건부 | invest 동시 2발로 skill_pt 음수 되는지 |
| AUTH-10 | Med | `auth.py:838` | `APP_ENV` 미설정/오타 시 무인증 계정생성+세션발급 `dev-login` 열림(fail-open) | 기본값 안전측 반전 또는 명시 `ENABLE_DEV_LOGIN` 플래그 | APP_ENV 미설정 기동 후 `POST /auth/dev-login` 응답 |
| AUTH-11 | Med | `auth.py:446-465` | 멀티워커 배포 시 Google/Apple/Zalo 로그인 일부가 무작위 `invalid_state` 실패 | `_oauth_states`를 Redis 등 공유 스토어로 | 워커 2+로 기동 후 소셜로그인 실패율 |
| AUTH-12 | Med | `users.py:104-197` | 미인증 누구나 타인 주행거리·배지·퀘스트 이력 열람("내 ~" API가 공개) | 3개 엔드포인트에 세션+`_require_self` | 미인증 `GET /users/me/stats?user_id=타인` 데이터 나오는지 |

**공통 근인**: 세션이 사용자를 식별하지 못함(AUTH-1) + 다수 엔드포인트가 클라이언트가 보낸 `user_id`를 소유자 대조 없이 신뢰(BOLA/IDOR). AUTH-1 수정 + 전 엔드포인트 "대상 리소스 소유자 == 세션 사용자" 게이트가 근본 처방.

### 3.2 중고거래(market) [완료]
범위: `routers/market.py`.

| ID | 심각도 | 위치 | 증상(사용자) | 수정방향 | 검증 |
|---|---|---|---|---|---|
| MKT-1 | **High** | `market.py:749-771` | 거래이력 없이 판매자에게 별점 후기(리뷰폭탄/조작) — `is_seller` 분기만 COMPLETED 약속 검증, 반대방향(770) 무검증 | `is_buyer` 분기도 참여 COMPLETED 약속 대칭 검증 | 거래이력 없는 조합으로 `POST /market/reviews` 201 나는지 |
| MKT-2 | **High** | `market.py:1054-1096` | 한 매물이 두 구매자에게 "거래완료" | accept/complete가 `listing.status` 기대값 미확인 → 불일치면 409, 매물당 ACCEPTED 1건 제한 | 같은 listing 약속 2개 각각 완료되는지 |
| MKT-3 | **High** | `market.py:540-564,411` | 실거래 없이 SOLD 전환해 `sold_count`(신뢰지표) 부풀림 | SOLD는 complete 경로만, sold_count는 완료약속 기준 재계산 | 상대없이 status=SOLD 후 sold_count 증가하는지 |
| MKT-4 | **High** | `market.py:383` | 관리자가 HIDDEN(모더레이션)한 매물도 id로 상세 열람 | HIDDEN도 판매자 본인 외 404/403 | HIDDEN 후 타계정 GET 상세 정상응답 되는지 |
| MKT-5 | **High** | `market.py:802-825` | `body.user_id` 위조로 타인 명의 찜 추가/해제(like_count 조작) | body.user_id 제거하고 세션uid만 사용 | A세션에 user_id=B 찜이 B에 반영되는지 |
| MKT-6 | **High** | `market.py:829-848` | `user_id` 파라미터로 타인 찜목록·키워드알림 열람(IDOR) | 두 GET에 세션+일치검증 | 무인증 `GET /market/wishlist?user_id=타인` 데이터 나는지 |
| MKT-7 | **High** | `market.py:568-597,1234,1341` | 거래완료 후 가격변경 가능 + 거래이력에 합의금액 아닌 현재가 표시 | SOLD 가격수정 차단 + 성사시 합의금액 스냅샷 | 완료후 가격변경이 trades에 보이는지 |
| MKT-8 | Med | `market.py`(라우트 전수) | 매물 제목/설명/사진 수정·삭제 API 자체가 없음(가격·상태만 가능) | PATCH/DELETE listings 엔드포인트 추가 | 매물 수정·삭제 라우트 존재하는지 |
| MKT-9 | Med | `market.py:481-536` | 등록 시 음수 가격 저장(create만 검증 누락, update는 있음) | create에 `price_vnd>=0` | `POST price_vnd=-1000` 201 되는지 |
| MKT-10 | Med | `market.py:525` | 타인 content_id를 매물사진 등록 + 개수 무제한 | content 소유자==세션 + 최대 장수 제한 | 타계정 content_id/긴 배열 성공하는지 |
| MKT-11 | Med | `market.py:773-796` | 후기 연타로 중복후기→매너온도 왜곡(check-then-act, DB유니크 없음) | (listing,reviewer,target) 유니크+409 | 동일 payload 동시 2회 둘다 201인지 |
| MKT-12 | Med | `market.py:1297-1359` | 거래내역 페이지네이션 없음+N+1 → 활성유저 로딩 지연 | page/size + IN절 일괄조회 | 완료 200건서 응답시간/쿼리수 |
| MKT-13 | Med | `market.py:254-274` | 상위카테고리 검색이 손자 매물 누락(1단계만) + 짧은키워드마다 번역+앞와일드 ILIKE | 재귀CTE subtree + 2자미만 번역스킵 | 3단계 깊이서 손자 누락, 1글자 응답시간 |
| MKT-14 | Low | `market.py:386` | 새로고침마다 view_count 증가 → 조회수 신뢰불가 | 세션/일 1회 dedupe | 연속 5회 GET에 +5 되는지 |

견고: `get_listings` tie-breaker(id DESC)로 ghost 카드 차단(337-339), 상태/가격/끌올 변경은 seller 소유검증 일관(556,584,613).

### 3.3 퀘스트·라이드 [완료·라이브]
범위: `routers/{quests,quest_cards,user_quests,ride}.py`, `internal.py`. 프론트 `api/quests.ts` 호출 확정.

| ID | 심각도 | 위치 | 증상(사용자) | 수정방향 | 검증 |
|---|---|---|---|---|---|
| QST-1 | **High** | `ride.py:73-176` | 실제 주행 안 해도 퀘스트 보상 전액 — `is_success`/`distance` 전부 클라 자가신고, `target_distance` 대조 없음 | Engine GPS 완료만 지급 트리거 or 서버측 target 대조 | accept후 `distance=0.01,is_success=true` submit에 보상되는지 |
| QST-2 | **High** | `ride.py:96` | ABANDONED/EXPIRED 퀘스트 재제출로 보상 재지급 | 가드를 `status=='ACCEPTED'` 화이트리스트로 | abandon후 같은 id submit에 재지급되는지 |
| QST-3 | **High** | `ride.py`+`internal.py:122-163` | 동일완료 이중지급 — status를 plain SELECT, lock/원자 UPDATE 없음(클라submit+엔진콜백 동시) | `SELECT FOR UPDATE` 또는 `UPDATE WHERE status!='COMPLETED'` | 동시 발사에 gold/exp 중복적립 |
| QST-4 | **High** | `quests.py:452-502,566` | 타인 일일슬롯 소모·북마크 조작 — `body.user_id!=session` 검증 없음(ride엔 있음) | `body.user_id!=session` 403 추가 | 세션A로 user_id=B accept에 B슬롯 소모되는지 |
| QST-5 | **High** | `user_quests.py:36-130` | 타인 라이딩중 퀘스트 취소·포기(그리핑) — `uq.user_id` 비교 없음 | 세 핸들러에 `uq.user_id!=session` 403 | 세션A로 타인 user_quest DELETE에 ABANDONED되는지 |
| QST-6 | **High** | `utils.py:16`,`.env.example` | `APP_TIMEZONE` 기본 Asia/Seoul → 일일/주간 리셋·스트릭이 베트남 자정보다 2h 일찍; 코드내 HCM 하드코딩과 불일치 | 기본값 HCM으로+하드코딩 통일 | 기본설정 KST23시대서 슬롯/판정 날짜 어긋나는지 |
| QST-7 | Med | `ride.py:100-104`,`internal.py:139` | RP_MULT 껴도 RP만 보너스 안붙음(EXP/Gold는 붙음) — `rp_grant`가 원본 reward_exp 사용 | boosted 기준 통일 | RP_MULT 착용/미착용 rp_grant 같은지 |
| QST-8 | Med | `user_quests.py:51-58` | 자정교차 심야퀘스트가 목록엔 활성인데 시작 영구거부 | 자정교차 분기 추가 | 22:00~02:00 퀘스트 01:00 시작에 409인지 |
| QST-9 | Med | `quests.py:505-562` | "[DBG]" 강제완료 API가 운영에서도 호출가능 — 게이트가 대상 X-Passcode뿐 | 운영빌드 제외 or `verify_service_key` | 운영서 대상 passcode로 complete 200인지 |
| QST-10 | Low | `schemas.py:598-607` | 음수 거리/시간이 이력에 영구저장 — `Field(ge=0)` 없음 | 하한/상한 추가 | `distance=-5` submit에 201인지 |

견고: `ride.py` 본인확인(L79-80)+소유권 교차검증(L86-89) 동작 — 단 이 패턴이 quests/user_quests에 미이식된 게 위 High들의 근인.

### 3.4 재화·상점·가챠 [완료·라이브]
범위: `routers/{wallet,coupons,gacha,shop,inventory,season,badges}.py`. 프론트 `api/season.ts` 등 호출.

| ID | 심각도 | 위치 | 증상(사용자) | 수정방향 | 검증 |
|---|---|---|---|---|---|
| CUR-1 | **High** | `season.py:100` + `engine/services/season.py:93-137` | 시즌패스 "보상수령" ok:true인데 골드/아이템 실지급 0(유료 구매자 포함) — claim이 `claimed_levels` append만 | engine claim이 잔액/인벤 트랜잭션 변경 구현 | claim 전후 wallet/inventory 무변화면 재현 |
| CUR-2 | **High** | `season.py:65-66` | FREE 먼저 받으면 같은레벨 PREMIUM "이미수령"(409) — claimed 단일배열 | (level,track) 복합키로 분리 | 프리미엄 FREE후 PREMIUM 409 |
| CUR-3 | **High** | `gacha.py:117-126` | 가챠 환불(미지급) 항목이 정상획득처럼 표시 — grant_status 폐기 | grant_status 포함, REFUNDED 표기 | 환불케이스서 grant필드 부재 |
| CUR-4 | **High** | `shop.py:56-75`,`gacha.py:95-114` | 상점/가챠 엔진 타임아웃시 500(차감·지급 됐을수도)→재시도 이중차감 | broad `httpx.HTTPError`→502 | 엔진지연 500노출 |
| CUR-5 | **High** | `badges.py:14-35` | 무인증 user_id로 타인 배지·획득시각 열람(IDOR) — verify_user_session 없음 | 세션으로 대체 | 무인증 `GET /badges?user_id=임의` |
| CUR-6 | Med | `coupons.py:100-116` | idem키 재사용시 엉뚱상품 교환내역 응답 | catalog_id 대조 방어 | 같은키 A후 B에 A응답 |
| CUR-7 | Med | `gacha.py:123,130` | 천장리셋 연출·신규표시 절대 안뜸(false 하드코딩) | 실값으로 계산 | 천장도달 ceiling_reset false |
| CUR-8 | Med | `gacha.py:120` | 가챠결과 아이템명 대신 내부코드(HELM_003) | display_name 매핑 | item_name==item_code |
| CUR-9 | Med | `inventory.py:76` | 컬렉션 빈응답시 total_catalog 213 하드코딩→완성률 조작값 | 0/null 반환 | 빈 progress서 213 |
| CUR-10 | Med | `gacha.py:62-79` | 비활성 가챠 pity 0표시("이미도달"처럼) | 상태무관 정의조회 | 비활성 pity=0,count>0 |
| CUR-11 | Low | `inventory.py:99,119`,`season.py:107` | 장착/해제/시즌수령 타임아웃 500 | 공통 502 변환 | 엔진지연 raw500 |
| CUR-12 | Low | `gacha.py:45-59` | 가챠목록/이력 엔진오류 502 미변환 | broad catch | 엔진다운 500 |

견고: coupons `idempotency_key` 클라 필수 + 엔진 user_id 스코프 dedupe로 타인 바우처 유출 차단.

### 3.5 피드·알림 [완료·라이브]
범위: `routers/{feed,notices,notifications,support}.py`, `noti_worker/`, `services/noti_events.py`.

| ID | 심각도 | 위치 | 증상(사용자) | 수정방향 | 검증 |
|---|---|---|---|---|---|
| FD-1 | **High** | `feed.py:294-313,379` | `body.user_id` 위조로 타인명의 좋아요 on/off(수 조작) — create/comment엔 검증 있음 | body.user_id 제거/일치검증 | A로 user_id=B like가 B명의인지 |
| FD-2 | **High** | `support.py`+`noti_worker:200` | 문의 답변 인앱알림/푸시 전무 — 사용자가 재방문해야 앎(SUPPORT 타입 자체 없음) | SUPPORT 타입+이벤트발행+핸들러 | 답변후 알림 오는지 |
| FD-3 | **High** | `feed.py:101-133,332` | 차단유저 게시물·댓글이 피드/댓글창에 계속 노출 — UserBlock 필터 없음(market엔 있음) | `notin_` 서브쿼리 필터 추가 | 차단후 보이는지 |
| FD-4 | **High** | `feed.py`(report 0개) | 게시물·댓글 신고 기능 자체 없음(욕설/스팸 신고 불가) | POST/COMMENT target + 신고 라우트 신설 | 신고 라우트 있는지 |
| FD-5 | **High** | `noti_worker:223-281` | `xack` 배치 일괄→Redis순단/크래시시 최대 100건 중복 발송 | 메시지단위 xack + Notification 유니크 | Redis재시작에 중복행 |
| FD-6 | Med | `noti_events.py:19` | 발행 실패를 삼킴→DM/알림 영구 유실(안전망 밖) | outbox 후 재발행 | Redis순단중 DM 유실 |
| FD-7 | Med | `feed.py:112` | 친구/동네탭에 user_id/위치 누락시 필터 없이 전체 노출(에러없음) | 조건불충족 400/빈 | filter=friends user_id없이 전체 나는지 |
| FD-8 | Med | `feed.py:96,131` | 인기순 offset 페이지네이션→좋아요 변동에 글 중복/누락 | 커서 기반으로 전환 | 좋아요 변동후 중복등장 |
| FD-9 | Med | `noti_worker:99-136` | 차단한 판매자의 키워드 알림 계속 수신 | alert시 UserBlock 스킵 | 차단후 알림 오는지 |
| FD-10 | Med | `noti_worker`(단일컨슈머) | 매물 대량 등록시 DM 등 다른 알림도 함께 지연 | 타입별 워커/SQL 매칭 | 대량등록중 DM 지연 |
| FD-11 | Med | `feed.py:223-238` | SHARE_SNS EXP가 엔진 장애시 무표시 유실·재시도 없음 | outbox/재시도 큐 | 엔진다운시 EXP 누락 |
| FD-12 | Med | `support.py` | 사용자 재질문(reply) 라우트 없음→대화 단절, 새 티켓 강제 | `POST /support/tickets/{id}/replies`(user) 신설 | 재질문 라우트 있는지 |

견고: `notices.py` published_at 서버 전량 통제(클라 is_published 미노출).

### 3.6 비즈·컨텐츠·시스템 [완료·라이브]
범위: `routers/{biz,contents,translate,master,app_version,internal}.py`, `services/translate.py`.

| ID | 심각도 | 위치 | 증상(사용자) | 수정방향 | 검증 |
|---|---|---|---|---|---|
| BIZ-1 | **High** | `contents.py:52,88` | 이미지 업로드(전 이미지의 유일 창구)가 **동기 파일 I/O로 event loop 블로킹**→무관 요청까지 지연/타임아웃 | `asyncio.to_thread` 위임 | 15MB 동시업로드중 `/health` 지연 |
| BIZ-2 | **High** | `contents.py:34-40,74` | SVG 저장형 XSS — content_type 문자열만 검사(매직넘버X), imgproxy 래스터화 미설정 | SVG 제거/강제 래스터화 + 바이트 검증 | script .svg 업로드가 그대로 서빙되는지 |
| BIZ-3 | **High** | `translate.py:26-90` | 번역 rate limit·길이 상한 없음→외부 번역 API 과금 무한 | 사용자/IP rate limit + max_length | 다른 텍스트 수백건 호출수 |
| BIZ-4 | **High** | `biz.py:113,240` | content_id FK 미검증→신청/광고가 원인불명 500 | insert 전 `db.get(Content)` 400 | 없는 UUID로 `POST /biz/ads` 500인지 |
| BIZ-5 | **High** | `internal.py:44,64,78,87` | UUID 파싱 try/except 없어 엔진 보상요청 500→보상 유실 | try/except 400 (quest_card_completed 패턴) | 잘못된 uuid로 grant-exp 500인지 |
| BIZ-6 | Med | `biz.py:161-181` | APPROVED 업체가 이름·주소·사진 바꿔도 재심사 없이 인증배지 유지 | 핵심필드 변경시 PENDING 전환 | APPROVED name 변경후 status |
| BIZ-7 | Med | `biz.py:104-118` | 공백만 채운 신청 접수→심사화면·지도에 빈값 노출 | strip후 빈값 400 | 공백 name/address 201인지 |
| BIZ-8 | Med | `biz.py:364-377` | `get_public_map` order_by 없는 limit200→핀 들쭉날쭉 | order_by 추가 | 동일 bbox id집합 동일한지 |
| BIZ-9 | Med | `services/translate.py:222` | 번역 API 장애시 원문 반환 무표시(사용자는 실패 모름) | 실패 플래그 반환 | 키 무효화시 실패신호 |
| BIZ-10 | Med | `biz.py:611-621` | `view_ping` x_user_id 무검증→열람자수 조작 | verify_user_session + rate limit | 무작위 헤더로 count 증가 |
| BIZ-11 | Med | `app_version.py:30-44` | 활성행 2개시 강제업데이트 기준이 잘못된 버전 | 활성 1개 제약/released_at DESC | 활성 2행시 응답 |
| BIZ-12 | Med | `internal.py:147-176` | credit_rp 실패해도 ok=true→RP 유실 무통보·재시도 없음 | rp_granted 필드 + 재시도 큐 | credit_rp 예외시 ok값 |

견고: `internal` 라우터 verify_service_key 일괄 + fail-closed, master 공개 참조데이터.

### 3.7 admin [완료·라이브 (일부 미배선)]
범위: `routers/admin_legacy.py`(4517줄), `admin_api/`, `dev_context.py`, `admin_auth.py`. nginx `/admin-legacy/`·`/admin/api/` 서빙 확정. SQL 인젝션 경로는 없음(바인드 파라미터).

| ID | 심각도 | 위치 | 증상(운영/사용자) | 수정방향 | 검증 |
|---|---|---|---|---|---|
| ADM-1 | High(미배선) | `dev_context.py` `router` | DevContext/Feature/Todo CRUD 인증 전무 — **단 main.py 미등록=현재 실배포 미노출(잠재)** | admin_router로 흡수/인증 추가 | main에 등록시 무인증 200 |
| ADM-2 | **High** | `admin_legacy.py:2480-2563` | 배지 목록/폼 **여는 즉시 저장형 XSS**→열람 admin 세션 장악 | metric/op/value 화이트리스트 + h()/이스케이프 | condition XSS 저장후 목록접속 alert |
| ADM-3 | **High** | `admin_legacy.py:1991,2166` | item_code XSS→root가 버튼 클릭시 JS실행(**admin→root 권한상승**) | item_code 정규식 + 인라인핸들러 제거 | item_code XSS후 삭제버튼 클릭 |
| ADM-4 | **High** | `admin_legacy.py:527-540` | `_build_pagination` 반사형 XSS(쿼리스트링 무이스케이프) | quote + h() | `?q=<svg onload>` 페이지네이션 주입 |
| ADM-5 | Med | `admin_auth.py:60` | JWT role 누락시 **root fail-open**(`or "root"`) | 누락시 401/최소권한 | role 없는 토큰으로 /admins |
| ADM-6 | Med | `admin_legacy.py:190`,`admin_api/auth.py:29` | 관리자 로그인 브루트포스 무제한 + 6자 약한 정책 | 락아웃/백오프 + 복잡도 | 수백회 오류에 차단없는지 |
| ADM-7 | Med | `admin_legacy.py:1745-3311` | 비-root admin도 재화단가·가챠확률·정책 단독 변경 | verify_root_session/2인 승인 | 비-root로 gacha edit 200 |
| ADM-8 | Med | `admin_legacy.py:3386`,`admin_api/map/submissions.py:190` | 제보 이중승인→GasStation/RepairShop 중복생성(지도 중복) | `with_for_update`/unique | 병렬 confirm에 중복 row |
| ADM-9 | Med | `admin_legacy.py:4452` | POI bulk items 무제한→트랜잭션 장시간 점유 | max_length + 청크 커밋 | 수만건에 락 대기 |
| ADM-10 | Low | `admin_legacy.py:1903-1925` | 상점 가격 value h() 없음(현재 숫자라 저위험) | h() 적용 | 비숫자 모킹 속성탈출 |

견고: admin_api 전 서브라우터 상태전이 화이트리스트 + `_audit` 로그, SQL 인젝션 경로 없음.

### 3.8 Engine RP·보상 [완료·라이브]
범위: `engine/app/services/{anti_abuse,event_bus,policy_engine,xp_ledger,mission,mileage}.py`, `routers/{events,balance,admin}.py`.

| ID | 심각도 | 위치 | 증상(사용자) | 수정방향 | 검증 |
|---|---|---|---|---|---|
| ENG-1 | **High** | `anti_abuse.py:86`,`event_bus.py:108` | 일일캡 boolean 게이트→캡 근처 RIDE_KM 1건이 캡 초과지급 | `min(raw, cap-so_far)` 클램프 | 240/250서 큰 RIDE_KM 초과 |
| ENG-2 | **High** | alembic `042`/`054`,`policy_engine.py:144` | MILEAGE 보상 `is_active=false` 방치→5km RP30+Gold20 미지급 가능성 | is_active 확인/갱신 마이그레이션 | SQL 조회 or 5km후 잔액 |
| ENG-3 | **High** | `policy_engine.py:56-88` | 반복보상 check-then-act 이중지급(UserPolicyLog 유니크 없음) | 유니크 제약/FOR UPDATE | 동시 evaluate 2건→로그 2 |
| ENG-4 | **High** | `event_bus.py:110`,`anti_abuse.py:77` | 신규계정 감쇄가 XP만 절반, **RP는 전액** | rp_amount에도 penalty 적용 | 신규계정 XP반·RP전액인지 |
| ENG-5 | Med | `event_bus.py:71`,`xp_ledger.py:48` | daily_earned 무잠금 SUM TOCTOU→동시 캡 초과 | 판정전 잠금/원자 clamp | 캡임박 동시2건 전액 |
| ENG-6 | Med | `cleanup_idem.py:15`,`event_bus.py:38` | idem키 TTL(7일)후 재사용→ActionEvent UNIQUE 위반 500 | IntegrityError→기존 재조회 폴백 | IdemKey 삭제후 재요청 500 |
| ENG-7 | Med | `event_bus.py:87` | daily_count_limit day_end 상한없음→backdated 이벤트 과잉거부 | day_end 추가 | 3일전 occurred_at 거부 |
| ENG-8 | Med | `mission.py:59`,`event_bus.py:160` | 미션보상 XP가 일일캡 우회 무제한 누적 | 캡 인지경로 태우기 | 캡초과 미션들 balance |
| ENG-9 | Med | `anti_abuse.py:85` | 캡초과가 REJECTED 아닌 PROCESSED(0원인데 진행반영)+BFF 오인 | REJECTED 통일/계약 명시 | 캡이상서 process_status |
| ENG-10 | Med | `xp_ledger.py:67`,`reward.py:65` | **RP(gc_balance) 원장 없음**→유저·운영 조회·검증 불가 | 증감마다 원장 row + verify_balance | credit-rp후 transactions 부재 |
| ENG-11 | Med | `admin.py:476` | ops daily-net SQL이 없는 컬럼(currency/SPEND) 참조 500(인플레 감시 불능) | 실제 스키마 맞게 수정 | GET ops/daily-net 500 |
| ENG-12 | Low | `event_bus.py:61` | naive datetime UTC 간주→캡 경계 최대 7h 밀림 | naive 422 거부 | 오프셋없는 시각 집계일자 |
| ENG-13 | Low | `event_bus.py:236` | 거부 이벤트도 sre_user row 생성(주석과 불일치) | 거부시 미생성 | 없는 action+임의uid row생성 |

견고: `reward.redeem` SELECT FOR UPDATE + lock_balance + user_id 스코프 idem(과거 E-6/E-12 사고 기반).

### 3.9 Engine 가챠·상점·워커 [완료·라이브]
범위: `engine/app/services/{gacha,shop,season}.py`, alembic `015/016/046`, `routers/{gacha,shop}.py`.

| ID | 심각도 | 위치 | 증상(사용자) | 수정방향 | 검증 |
|---|---|---|---|---|---|
| EG-1 | **High** | `season.py:93-136` | 시즌 레벨보상 수령해도 골드/크리스탈/아이템 실지급 0 (**CUR-1과 동일 근인**) | 레벨→reward_bundle 매핑 + `_grant_*` 호출 | claim후 xp_balance/user_item 무변화 |
| EG-2 | **High** | alembic `016:129-142` | SEASON_PULL(시즌한정)이 L/M·천장서 fallback이 collection_filter 무시→**타 컬렉션 지급(현 데이터 100%)** | fallback도 collection_filter 유지 | SEASON_PULL L/M collection_code |
| EG-3 | **High** | alembic `046:142`,`016:107` | 천장+10연보장 겹치면 낮은 보장등급만 + 천장카운터 리셋 안됨→보상 지연 | force/pity 중 higher 채택 | pity채운뒤 10연 was_pity_hit false |
| EG-4 | **High** | alembic `015:17-44` | 중복 아이템 환급 C/R/E=0인데 REFUND_GC 가챠 R+E 96%→**유료 내고 보상 0** | 최소 보전 or REFUND_GP 분리 | R/E 다모은뒤 10연 refund 0비율 |
| EG-5 | **High** | alembic `015:246-250` | SEASON_LOCKED 환급이 GP 하드코딩→GC결제인데 GP환급(**프리미엄 재화 손실**) | cost_currency 기준 환급통화 | 구시즌 SEASON_PULL(GC) refund GP인지 |
| EG-6 | Med | `gacha.py:89`,`shop.py:91` | 가챠/상점 idempotency_key 없음→재시도시 재차감·재실행 | idem_key + 유니크 로그 | 동일 payload 2회에 1회분만 |
| EG-7 | Med | `gacha.py:55-86` | 할인 유저인데 원가로 "잔액부족" 판정→뽑기 막힘 | 할인 반영 가용판정 | 할인가이상·원가미만서 can_pull |
| EG-8 | Med | `season.py:105-127` | 두 레벨 동시수령시 read-modify-write로 수령기록 유실 | SELECT FOR UPDATE | 두 레벨 동시 claim 둘다 남는지 |
| EG-9 | Med | `shop.py:60`,`gacha.py:80` | 연타시 UNIQUE 위반이 409 아닌 500 | IntegrityError→409 | 동일 item 동시2회 2번째 코드 |
| EG-10 | Low | alembic `046:119` | 할인 정수나눗셈 절삭→표시 할인율보다 더 차감 | ROUND/NUMERIC | 안 나눠떨어지는 조합 |
| EG-11 | Low | alembic `016:114` | 가중치0/카탈로그 없음시 차감후 500(원자성 롤백=자금손실X) | 사전 검증 | 가중치0 가챠 pull |

견고: `_spend_currency` FOR UPDATE + pull/purchase가 단일 SQL 트랜잭션 원자성 → 단순 연타로 이중차감(자금손실)까진 안 감(실패의 사용자 표기는 EG-9).

### 3.9 Engine 가챠·상점·워커 [정독 중]
<!-- PENDING: engine-gacha -->

### 3.10 Frontend [완료·라이브 (핵심 35/260 파일 정독)]
범위: `frontend/src` API클라이언트·인증·native브리지·이미지·재화·ride/location·gacha/shop. 커버리지: 핵심 플로우 위주 35개(카메라업로드·지도컴포넌트 세부·Settings 하위는 미정독).

| ID | 심각도 | 위치 | 증상(사용자) | 수정방향 | 검증 |
|---|---|---|---|---|---|
| FE-1 | **High** | `pages/ride/RideNav.tsx:29,158` | `DEV_FORCE_HCMC_ORIGIN=true` 하드코딩→경로/ETA가 **항상 벤탄시장 기준**(실 GPS 무시) — 주석 "배포 전 false" | 플래그 제거/env 스위치 | 임의 지점서 출발지가 실 GPS인지 |
| FE-2 | **High** | `api/client.ts:94-155` | 전 API에 타임아웃(AbortController) 없음→약전파시 **스플래시 무한 로딩**, 에러도 없음 | AbortController 타임아웃 + 재시도 UI | 무기한 지연 프록시로 부팅 |
| FE-3 | **High** | `App.tsx:299-310` | 오프라인·일시장애시 앱 켤 때마다 멀쩡한 세션 **강제 로그아웃**(이동중 라이더 빈발) | 네트워크오류/401 구분, 전자는 세션 유지 | 유효세션 오프라인 재시작시 로그아웃 |
| FE-4 | **High** | `pages/gacha/GachaMain.tsx:84-111` | 목록/지갑 중 하나만 실패해도 뽑기 화면 통째로 빈화면·재시도 없음 | catch 추가/`Promise.allSettled` | fetchWallet reject시 |
| FE-5 | **High** | `pages/gacha/GachaPull.tsx:304` | "다시 뽑기" 연타/멀티터치→재화 중복차감·다중 뽑기(EG-6와 계층 연쇄) | `isPulling` disabled 가드 | 더블탭시 pull 1회만 나가는지 |
| FE-6 | Med | `lib/native.ts:460` | 소셜로그인 URL 운영 host 하드코딩→스테이징 환경분리 안됨 | 상대경로/config 주입 | 스테이징서 실제 host |
| FE-7 | Med | `pages/auth/Splash.tsx:66` | 첫 화면 배경이 외부 CDN(unsplash/picsum) 의존→느리거나 차단시 깨짐 | 자체 호스팅 자산 | 차단후 폴백 |
| FE-8 | Med | `lib/session.ts:24`,`client.ts:86` | 세션 쿠키가 HttpOnly/Secure 아님→웹뷰 스크립트가 읽음 | HttpOnly/Secure 전환 | 쿠키 속성 |
| FE-9 | Med | `pages/auth/OAuthLogin.tsx:61` | 로그인 실패시 번역 안 된 원문 에러 노출 | ERROR_MAP i18n | 실패시 번역되는지 |
| FE-10 | Med | `store/useRideStore.ts:126` | 라이드중 네트워크 끊김 무표시→이유 모르고 퀘스트 실패 | 연결끊김 배너 | 라이드중 차단시 표시 |
| FE-11 | Med | `components/ui/CurrencyHUD.tsx:44` | 재화 NaN시 "NaN" 문자 그대로 표시 | `Number.isFinite` 가드→'—' | gold=NaN 렌더 |
| FE-12 | Med | `pages/ride/RideNav.tsx:39,187` | 위치권한 거부/GPS실패시 무안내로 임의좌표 대체→엉뚱한 경로 | 권한 안내+설정이동, 폴백 배너 | 권한거부후 안내 |
| FE-13 | Low | `lib/native.ts:158` | 지도 빠르게 나가면 GPS watch 안 꺼져 배터리 소모(경쟁조건) | watchId promise 관리 + catch | 반복 진입/이탈 |
| FE-14 | Low | `pages/settings/AccountSettings.tsx:92` | 복사 실패해도 항상 "복사됨" 토스트 | 결과 대기후 토스트 | 미지원 환경서 클립보드 |

견고: `AppImage` 다중소스+지수백오프 폴백, `ItemDetail` 구매 `buying` 연타방지.

### 3.11 Admin-frontend [완료·라이브 (43/43 파일)]
범위: `admin-frontend/src` 전체. 운영자 콘솔 SPA(`/admin/`).

| ID | 심각도 | 위치 | 증상(운영/사용자) | 수정방향 | 검증 |
|---|---|---|---|---|---|
| AF-1 | **High** | `components/ModerateModal.tsx:25,29` | 매물 상태변경 후 재오픈시 라디오 미선택인데 이전 action 값이 서버 제출 | `open`/`currentStatus` useEffect 리셋 or `key` | HIDE후 재오픈 무선택 제출값 |
| AF-2 | **High** | `pages/biz/BizAccountDetailPage.tsx:142-158` | 파트너 "계정 정지"가 확인 없이 즉시+광고 전체중단, **해제 API 자체가 없음** | Popconfirm + 재활성 API/버튼 신설 | 반려(모달) vs 정지(즉시) 클릭수 |
| AF-3 | **High** | `pages/reports/ReportListPage.tsx:29-36` | "미처리 신고" 클릭시 REVIEWING 누락→검토중 방치 신고가 큐서 사라짐 | 다중 status(PENDING+REVIEWING) | open 수치 vs 실제 리스트 |
| AF-4 | Med | `pages/cms/FaqListPage.tsx:103`,`BannedKeywordPage.tsx:43` | 삭제 실패해도 에러 없이 모달만 닫힘→삭제된 걸로 오인 | onError/`mutateAsync` await | 오프라인 삭제후 항목 잔존 |
| AF-5 | Med | `App.tsx:120`,`AuditLogPage.tsx:43` | audit-logs 라우트 role 가드 없음→admin이 URL 직접입력으로 전 관리자 IP·조치이력 열람 | 라우트 role 가드 + isError | admin권한 /audit-logs 직접입력 |
| AF-6 | Med | `api/client.ts:42-48` | 401시 확인없이 로그인 이동→다국어 장문 작성 내용 전부 소실 | draft 보관/이동 confirm | 공지작성중 세션삭제 |
| AF-7 | Med | `pages/map/PoiEditPage.tsx:94` | 위경도 오타(뒤바뀜 등)로 엉뚱한 위치 POI 게시돼도 경고없음 | 범위검증 + 지도 미리보기 | 위경도 바꿔 입력 |
| AF-8 | Low | `pages/map/PoiListPage.tsx:66` | Popconfirm 승인/해제에 로딩 없음→응답지연중 연타 중복요청 | `disabled={isPending}` | 스로틀중 연타 요청수 |
| AF-9 | Low | `pages/support/SupportDetailPage.tsx:66` | 상태 Select 오클릭시 확인없이 RESOLVED→OPEN 역행 | 역행 전이 Popconfirm | RESOLVED 실수클릭 |
| AF-10 | Low | `pages/LoginPage.tsx:44` | 서버 500/락아웃도 항상 "비번 틀림"만 표시→장애시 반복 재입력 | 실제 detail 노출, 자격오류만 구분 | 502시 문구 |

견고: mutate 전반 onSuccess/onError 쌍 + 사유 검증, 낙관업데이트 없이 invalidateQueries, dangerouslySetInnerHTML·하드코딩 시크릿·localStorage 토큰 전무.

### 3.12 Database·infra [완료·라이브]
범위: `database/init/*.sql`(135개, 핵심), `nginx/conf.d/*`, `docker-compose*.yml`. 미검토: 118~131·CSV/OSM 시드 본문(후순위, 정직 표기).

| ID | 심각도 | 위치 | 증상(사용자/데이터) | 수정방향 | 검증 |
|---|---|---|---|---|---|
| DB-1 | **High** | `init/041,060` | 빈볼륨 기동시 041(tier_definition 테이블 부재)서 init 죽어 **042~131(마켓/OAuth/비즈/모더/감사 90여파일) 미적용** — 재해복구·신규환경 치명 | 041/060을 engine/alembic로 이관 or 가드 | `down -v && up`서 041 ERROR·042+ 테이블 부재 |
| DB-2 | **High** | `084:36,090:8,110:13` | 매물가·기준가·제안액 음수 저장 가능(CHECK>=0 없음) | 세 컬럼 CHECK(>=0) | price_vnd=-1000 거부되는지 |
| DB-3 | **High** | `001:143,150` | ride_sessions `user_quest_id` UNIQUE 없음→퀘스트 재시도시 보상 중복행(**골드 파밍**, QST-3 연결) | UNIQUE + reward CHECK(>=0) | 동일 user_quest_id 2회 INSERT |
| DB-4 | **High** | `docker-compose:98,107,182` | ENGINE_SERVICE_KEY·ADMIN_PASS_HASH fail-fast(`:?`) 가드 없음→빈값 조용히 기동(**서비스간 인증 우회**) | 4서비스 `:?` 가드 통일 | .env 삭제후 up 중단되는지 |
| DB-5 | Med | `nginx default.conf:93` | `/api/sre/`(공개)가 클라 X-Service-Key 헤더를 engine에 그대로 릴레이 | `proxy_set_header X-Service-Key ""` | 클라 헤더가 engine 도달하는지 |
| DB-6 | Med | `002/042/092/093` | 마이그레이션 번호 중복 8파일→순차적용 전제 깨짐(현재 우연히 무해) | CI lint 중복 prefix 차단 | `uniq -d` 중복목록 |
| DB-7 | Med | `084:41,113:27,124:33` | 마켓/비즈/poi GEOGRAPHY+GIST 없음(lat/lng NUMERIC만)→반경검색 풀스캔 | GENERATED GEOGRAPHY+GIST | 반경쿼리 EXPLAIN Seq Scan |
| DB-8 | Med | `nginx 양 conf` | OTP발송/결제/API에 limit_req 전무→무차별대입 무방비 | limit_req_zone + limit_req | OTP 10회 연속 429 없는지 |
| DB-9 | Med | `nginx 양 conf` | 보안헤더(XFO/XCTO/HSTS/CSP/Referrer) 전무 | add_header 세트(always) | curl -I 헤더 부재 |
| DB-10 | Med | `088:12,19` | 리뷰 UNIQUE `listing_id` ON DELETE SET NULL→매물삭제시 NULL로 제약 무력화(매너온도 조작, MKT-11 연결) | (reviewer,target) 부분유니크/소프트delete | 삭제후 재작성 반복 성공 |
| DB-11 | Med | `105:18,110:14` | appointment/offer status CHECK 없음→오타로 상태기계 붕괴(RESERVED/SOLD 오작동) | CHECK(status IN ...) | 오타 status UPDATE 성공하는지 |
| DB-12 | Low | `nginx:168-177` | `/engine/` allow 172.16/12가 docker 브리지 대역 겹쳐 차단 실효 저하 | 실제 subnet으로 좁힘 | /engine/ remote_addr |
| DB-13 | Low | `nginx 10-gen-htpasswd.sh:7` | htpasswd가 `changeme` 폴백(compose는 `:?`로 막는데 스크립트가 재도입) | 기본값 제거 exit1 | unset후 스크립트 changeme 생성 |
| DB-14 | Low | `095,106,107` | [DEV] 더미광고 14건 운영 노출(prod init 오버라이드 없음) | APP_ENV=prod skip 가드 | prod DB `[DEV]%` count |

견고: dm_conversations 방향중복 봉쇄, user_quests·reports·keyword 부분유니크+함수인덱스, oauth/translate 시크릿 CHANGE_ME+ON CONFLICT.

### 3.12 Database·infra [정독 중]
<!-- PENDING: database -->

---

## 4. 착수 순서 (전 영역 취합 최종)

### P0 — 즉시 (사용자 피해가 실재)
1. **AUTH-1** 인증 근간 — 임의 UUID로 계정 탈취. **모든 IDOR의 뿌리라 이걸 먼저 고쳐야 나머지 소유자 검증이 의미**를 가진다.
2. **AUTH-2** 전화번호만으로 타인 계정 passcode 탈취.
3. **머니/보상 손실·이중지급**: CUR-1=EG-1(시즌보상 유료인데 실지급 0) · QST-1(안 달려도 보상) · QST-3+DB-3(퀘스트 이중지급·골드파밍) · EG-4/EG-5(가챠 유료재화 손실) · ENG-4(신규계정 RP 감쇄 누락).
4. **DB-1** 재해복구/신규환경에서 스키마 90파일 미적용(운영 복구 불능).
5. **DB-4** 서비스간 인증키 빈값 기동(engine 우회).
6. **ADM-2~4** admin_legacy XSS(운영자 세션 장악·admin→root 상승).

### P1
- **IDOR 일괄**: AUTH-3,6,7,8 / MKT-5,6 / QST-4,5 / CUR-5 / FD-1 — AUTH-1과 함께 "리소스 소유자 == 세션 사용자" 공통 게이트로.
- **차단 무력화**: AUTH-4 + FD-3 + FD-9 (DM·피드·알림 전반).
- **외부 API 장애 은폐**: 날씨 mock(지도 문서) · BIZ-9 번역 · FE-2/FE-3 네트워크.
- **성능·부하**: BIZ-1 업로드 event loop 블로킹 · 매트뷰 refresh(지도) · DB-7 GIST 인덱스 · DB-8 rate limit.

### P2
- 나머지 Med/Low — UX 정합·표기 정직·정확도.

### ★ 계층 연쇄 주의 (한 겹만 고치면 반쪽)
- **멱등성**: FE-5(프론트 연타) + engine_client 멱등키 없음 + EG-6(엔진) — 세 계층 동시 처리해야 완결. 엔진 단일 SQL 원자성이 *자금 손실*은 막지만 *중복 실행*은 가능.
- **IDOR**: AUTH-1(세션 근간) + 각 라우터 user_id 신뢰 — 근간부터.
- **시즌 보상 미지급**: CUR-1(BFF) == EG-1(Engine) 동일 사안 양쪽 확인.

각 항목 수정 후 `docker compose ... up --build -d <svc>` 재빌드 + 각 "검증" 절 실측. 카파시 4원칙: 재현/검증 테스트 통과까지 "완료" 아님.
