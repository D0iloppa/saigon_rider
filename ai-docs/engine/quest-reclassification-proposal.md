# 퀘스트 비라이딩 재분류 결정서 (B = DB 제목 기준)

> 작성일: 2026-06-07 · 상태: **전건 결정·적용 완료**
> 관련: [quest-count-event-implementation.md](quest-count-event-implementation.md)
> **갱신:** "정비소 비교"류(`W-MT-06`, `W-MT-09`)는 근사(count_event)가 아니라 **`count_distinct` 검증기로 정식 구현**
> (`MAINTENANCE_RECEIPT` / `distinct_key=shop_id` / 2곳, init `069`). 아래 B표의 해당 2행은 이 갱신으로 대체됨.
>
> **갱신3: 미구현 기능 의존(emitter 없음) count 퀘스트 일괄 잠금.** BFF 가 실제 발행하는 action_code
> (`SHARE_SNS`,`RIDE_KM`,`QUEST_COMPLETE`,`INFO_*`) 외 action 의존 count 퀘스트 **73건 `is_active=FALSE`** (init `071`).
> 결과: 활성 퀘스트는 전부 완료 가능 — DISTANCE 92 + CHECKPOINT 4(GPS) + COUNT_EVENT 11(SHARE_SNS 9·QUEST_COMPLETE 2). emitter 연결 시 역산 재활성화.
>
> **갱신2: 거래 의존 퀘스트 잠금(비활성).** P2P 마켓 거래(판매/구매/문의/찜) 기능 미구현 →
> `MARKET_SUCCESS`/`MARKET_INQUIRY`/`MARKET_LISTING`/`MARKET_FAVORITE` 의존 **18건 `is_active=FALSE`** (init `070`).
> 거래 기능 출시 시 동일 조건으로 재활성화. 단순 시세조회(`MARKET_BROWSE` 5건)는 유지.
> 잠금 목록: 첫 거래 도전·거래 챔피언·거래 5건 챔피언·거래 성공·친절 거래·거래 2건·우수 판매자(SUCCESS),
> 거래 응답왕·첫 채팅 시도·첫 채팅·채팅 응대왕(INQUIRY), 부품 1건 등록·등록 30건·등록 10건·5건 등록·부품 큐레이터·차량 등록하기(LISTING), 관심 부품 찜(FAVORITE).
> 정책: DB 제목이 SoT. 제목 의미에 맞는 count_event 로 `card_type`+`criteria` 전환. `mission_code`(카드아트) 보존.
> emitter 없는 action_code 는 QuestChecker 에서 **진행도만 표시**(완료는 emitter 연결 후).
> 적용: `database/init/068_quest_reclassify_count_event.sql` (가동 DB 직접 적용 완료)

비라이딩 활성 퀘스트 110건 → **COUNT_EVENT 101건 / DISTANCE 유지(라이딩성) 9건**.
잘못된 DISTANCE 폴백은 0건(= 더 이상 가격비교류가 지도네비로 안 뜸).

## A. 1차 적용 — 제목 명확 (69건)

| mission_code | 제목 | action_code | target |
|---|---|---|---|
| D-DL-02 | 가격 비교 | `MARKET_BROWSE` | 3 |
| D-CM-01 | 응원하기 | `COMMENT_POST` | 1 |
| D-CM-02 | 댓글로 인사 | `COMMENT_POST` | 1 |
| D-CM-03 | 친구 응원 | `COMMENT_POST` | 1 |
| O-CM-02 | 첫 퀘스트 클리어 | `QUEST_COMPLETE` | 1 |
| W-CM-04 | 친구 1명 초대 | `REFERRAL` | 1 |
| W-CM-05 | 친구 10명 | `REFERRAL` | 10 |
| W-CM-08 | 친구 초대 1명 | `REFERRAL` | 1 |
| W-CM-09 | 친구 초대 3명 | `REFERRAL` | 3 |
| W-CM-10 | 댓글 30개 | `COMMENT_POST` | 30 |
| W-CM-11 | 좋아요 50개 | `LIKE_RECEIVED` | 50 |
| D-DL-01 | 오늘의 주유 | `FUEL_RECEIPT` | 1 |
| D-DL-05 | 관심 부품 찜 | `MARKET_FAVORITE` | 1 |
| D-DL-06 | 오늘 한 줄 후기 | `REVIEW_PHOTO` | 1 |
| D-DL-07 | 부품 1건 등록 | `MARKET_LISTING` | 1 |
| D-DL-08 | 야간 10건 | `DELIVERY_RECEIPT` | 10 |
| D-DL-09 | 10건 달성 | `DELIVERY_RECEIPT` | 10 |
| D-DL-10 | 30건 달성 | `DELIVERY_RECEIPT` | 30 |
| D-DL-11 | 50건 달성 | `DELIVERY_RECEIPT` | 50 |
| D-DL-12 | TikTok 1건 | `SHARE_SNS` | 1 |
| D-DL-13 | Zalo 공유 | `SHARE_SNS` | 1 |
| M-DL-01 | 월 1000건 프로 | `DELIVERY_RECEIPT` | 1000 |
| M-DL-03 | 월 500건 | `DELIVERY_RECEIPT` | 500 |
| O-DL-01 | 오늘의 첫 배차 | `DELIVERY_RECEIPT` | 1 |
| O-DL-04 | 첫 주유 인증 | `FUEL_RECEIPT` | 1 |
| O-DL-05 | 첫 피드 게시 | `SHARE_SNS` | 1 |
| W-DL-06 | 등록 30건 마스터 | `MARKET_LISTING` | 30 |
| W-DL-07 | 거래 5건 챔피언 | `MARKET_SUCCESS` | 5 |
| W-DL-08 | 컨텐츠 50건 | `POST_CREATE` | 50 |
| W-DL-10 | 거래 성공 | `MARKET_SUCCESS` | 1 |
| W-DL-11 | 리뷰 작성 | `REVIEW_PHOTO` | 1 |
| W-DL-15 | 등록 10건 | `MARKET_LISTING` | 10 |
| W-DL-16 | 댓글 100개 | `COMMENT_POST` | 100 |
| W-DL-17 | 주 100건 | `DELIVERY_RECEIPT` | 100 |
| W-DL-18 | 주간 세차 2회 | `CAR_WASH_RECEIPT` | 2 |
| W-DL-19 | 거래 2건 | `MARKET_SUCCESS` | 2 |
| W-DL-20 | 주 200건 | `DELIVERY_RECEIPT` | 200 |
| W-DL-23 | 주간 세차 3회 | `CAR_WASH_RECEIPT` | 3 |
| W-DL-24 | 피드 3회 게시 | `SHARE_SNS` | 3 |
| W-DL-25 | 새벽 30건 | `DELIVERY_RECEIPT` | 30 |
| W-DL-26 | 정비 일지 5건 | `MAINTENANCE_RECEIPT` | 5 |
| W-DL-27 | 주유 5회 | `FUEL_RECEIPT` | 5 |
| W-DL-28 | 5건 등록 | `MARKET_LISTING` | 5 |
| W-DL-29 | 야간 50건 | `DELIVERY_RECEIPT` | 50 |
| W-DL-30 | 주유 영수증 7건 | `FUEL_RECEIPT` | 7 |
| W-DL-31 | TikTok 공유 | `SHARE_SNS` | 1 |
| W-DL-32 | TikTok 5건 | `SHARE_SNS` | 5 |
| W-DL-33 | Zalo 공유 7건 | `SHARE_SNS` | 7 |
| D-MK-02 | 마켓 윈도쇼핑 | `MARKET_BROWSE` | 1 |
| D-MK-03 | 시세 살펴보기 | `MARKET_BROWSE` | 1 |
| D-MK-04 | 사진 잘 찍기 | `PHOTO_UPLOAD` | 1 |
| D-MT-01 | 브레이크 점검 | `DAILY_INSPECTION` | 1 |
| D-MT-02 | 엔진오일 게이지 | `DAILY_INSPECTION` | 1 |
| D-MT-03 | 워셔액 보충 | `DAILY_INSPECTION` | 1 |
| D-MT-04 | 타이어 점검 | `DAILY_INSPECTION` | 1 |
| D-MT-05 | 세차 인증 | `CAR_WASH_RECEIPT` | 1 |
| D-MT-06 | 체인 점검 | `DAILY_INSPECTION` | 1 |
| D-MT-07 | 출발 전 점검 | `DAILY_INSPECTION` | 1 |
| D-MT-08 | 거울/등화 점검 | `DAILY_INSPECTION` | 1 |
| D-MT-09 | 풀 점검 데이 | `DAILY_INSPECTION` | 1 |
| O-MT-01 | 첫 점검 | `DAILY_INSPECTION` | 1 |
| W-MT-01 | 미끄럼 방지 점검 | `DAILY_INSPECTION` | 1 |
| W-MT-04 | 마켓 둘러보기 | `MARKET_BROWSE` | 1 |
| W-MT-05 | 차량 풀 점검 | `DAILY_INSPECTION` | 1 |
| W-MT-07 | 부품 교체 2건 | `PART_REPLACE` | 2 |
| W-MT-08 | 워셔액 풀 | `DAILY_INSPECTION` | 1 |
| W-MT-10 | 타이어 압력 체크 | `DAILY_INSPECTION` | 1 |
| W-MT-13 | 부품 교체 인증 | `PART_REPLACE` | 1 |
| W-MT-14 | 체인 청소 인증 | `MAINTENANCE_RECEIPT` | 1 |

## B. 2차 적용 — 내가 판단해 결정한 보류건 (32건)

> confidence: mid=합리적 추정 / low=제목 모호, **검토 권장**. count_distinct(정비소 비교/방문)·streak(풀점검 N일)·composite(환영 클리어)는 전용 검증기가 없어 count_event 로 **근사**(정확검증은 검증기 추가 후).

| mission_code | 제목 | action_code | target | confidence |
|---|---|---|---|---|
| O-CM-01 | 첫 좋아요 | `LIKE_RECEIVED` | 1 | mid |
| W-CM-01 | 인플루언서 | `LIKE_RECEIVED` | 100 | low |
| W-CM-02 | 컨텐츠 메이커 | `POST_CREATE` | 5 | mid |
| W-CM-03 | 추천 마스터 | `REFERRAL` | 5 | mid |
| W-CM-06 | 빠른 응답 | `COMMENT_POST` | 5 | low |
| W-CM-07 | 인기 게시물 | `LIKE_RECEIVED` | 30 | mid |
| D-DL-03 | 거래 응답왕 | `MARKET_INQUIRY` | 5 | low |
| D-DL-04 | 매너 라이더 | `DELIVERY_RECEIPT` | 5 | low |
| O-DL-02 | 첫 채팅 시도 | `MARKET_INQUIRY` | 1 | mid |
| O-DL-03 | 첫 채팅 | `MARKET_INQUIRY` | 1 | mid |
| O-DL-06 | 첫 거래 도전 | `MARKET_SUCCESS` | 1 | mid |
| W-DL-01 | 풀가동 정비 | `MAINTENANCE_RECEIPT` | 3 | low |
| W-DL-02 | 피드 스타 | `SHARE_SNS` | 5 | mid |
| W-DL-03 | 거래 챔피언 | `MARKET_SUCCESS` | 5 | mid |
| W-DL-04 | 정비 인증 마스터 | `MAINTENANCE_RECEIPT` | 5 | mid |
| W-DL-05 | 직업 선택 (선택) | `PROFILE_UPDATE` | 1 | low |
| W-DL-09 | 정비소 방문 | `MAINTENANCE_RECEIPT` | 1 | mid |
| W-DL-12 | 친절 거래 | `MARKET_SUCCESS` | 3 | low |
| W-DL-13 | 채팅 응대왕 | `MARKET_INQUIRY` | 10 | low |
| W-DL-14 | 부품 가격 가이드 | `MARKET_BROWSE` | 5 | mid |
| W-MK-01 | 부품 큐레이터 | `MARKET_LISTING` | 10 | mid |
| W-MK-02 | 차량 등록하기 | `MARKET_LISTING` | 1 | low |
| W-MK-03 | 우수 판매자 | `MARKET_SUCCESS` | 5 | mid |
| W-MT-02 | 연비 트래커 | `FUEL_RECEIPT` | 5 | low |
| W-MT-06 | 정비소 2곳 비교 | `MAINTENANCE_RECEIPT` | 2 | mid |
| W-MT-09 | 정비소 비교 | `MAINTENANCE_RECEIPT` | 2 | mid |
| W-MT-11 | 연비 측정 | `FUEL_RECEIPT` | 1 | low |
| W-MT-12 | 점검 챔피언 | `DAILY_INSPECTION` | 10 | mid |
| M-MT-01 | 풀 점검 25일 | `DAILY_INSPECTION` | 25 | mid |
| W-MT-15 | 풀 점검 7일 | `DAILY_INSPECTION` | 7 | mid |
| A-MX-01 | 1주년 친구 초대 | `REFERRAL` | 1 | mid |
| O-MX-01 | 14일 환영 클리어 | `QUEST_COMPLETE` | 5 | low |

## C. DISTANCE 유지 — 라이딩성 (9건)

| mission_code | 제목 | 사유 |
|---|---|---|
| W-DL-21 | 주 200km | km 목표(주행) |
| W-DL-22 | 주 200km | km 목표(주행) |
| A-MX-05 | 연간 10000km | km 목표(주행) |
| A-MX-06 | 연간 5000km | km 목표(주행) |
| D-MK-01 | 시장 라이딩 | 시장 라이딩(주행) |
| W-MT-03 | 우비 챔피언 | 우비 챔피언(우중 주행, 날씨신호 없어 거리 proxy) |
| A-MX-02 | 1주년 그룹 라이딩 | 1주년 그룹 라이딩(주행) |
| A-MX-03 | 1주년 축하 라이딩 | 1주년 축하 라이딩(주행) |
| A-MX-07 | 통근 풀패스 | 통근 풀패스(통근 주행) |

## 검토 부탁 포인트 (여기만 봐주시면 됩니다)

1. **B표의 `low` 건** — 제목이 모호해 임의 배정. 특히:
   - `W-CM-01 인플루언서`→받은좋아요 100, `W-CM-06 빠른 응답`→댓글, `D-DL-03 거래 응답왕`/`W-DL-13 채팅 응대왕`→문의,
   - `D-DL-04 매너 라이더`→배달5, `W-DL-05 직업 선택`→프로필, `W-DL-12 친절 거래`→거래3, `W-MT-02 연비 트래커`/`W-MT-11 연비 측정`→주유.
2. **근사 처리** — `W-MT-06/09 정비소 비교`, `W-DL-09 정비소 방문`(distinct), `M-MT-01/W-MT-15 풀 점검 N일`(streak), `O-MX-01 14일 환영 클리어`(composite) — 의미상 전용 검증기가 맞음. 지금은 count_event 근사.
3. **C(라이딩 유지)** — `W-MT-03 우비 챔피언`은 우중주행이나 날씨신호가 없어 거리 proxy 로 둠. 의도와 다르면 알려주세요.

## 후속

- emitter 연결(배달/정비/마켓 action 발행), count_distinct·streak·composite 검증기 추가.
