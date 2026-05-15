
# Saigon Rider Reward Engine (SRE) — 설계서 v1.0

> 발행일: 2026-05-13
> 적용 대상: Saigon Rider v1 (모바일) + 향후 확장 채널
> 분리 목적: UI/앱 로직과 무관한 **미션·포인트·보상 엔진**을 독립 서비스로 운영
> 핵심 원칙: **"엔진은 똑똑하게, 보상은 단순하게"**

---

## 1. 왜 엔진을 분리하는가

| 문제 | 분리하지 않을 때 | 분리할 때 |
|---|---|---|
| UI 변경 시 보상 로직 재배포 | 매번 발생 | 영향 없음 |
| 마켓플레이스/관리자/외부 파트너 추가 | 보상 로직 중복 구현 | API 호출 한 줄 |
| 미션 룰 변경 (XP, 가중치 등) | 앱 업데이트 필요 | 엔진 룰 테이블만 수정 |
| 어뷰징 가드레일 | 클라이언트 신뢰 불가 | 서버 단일 진입점에서 검증 |
| 정산/감사 추적 | 분산되어 검증 어려움 | 단일 트랜잭션 로그 |

**결론**: 엔진은 채널-중립(channel-neutral)이어야 하며, "어떤 사용자가 어떤 행동을 했다"라는 **이벤트만 받아서 RP를 계산·적립·교환**하는 책임만 갖는다.

---

## 2. SRE 도메인 경계 (Bounded Context)

```
┌──────────────────────────────────────────────────────────────┐
│                  Saigon Rider Mobile App                     │
│  (UI, 라이딩 추적, 화면 흐름, 알림, 인증)                    │
└────────────────────────┬─────────────────────────────────────┘
                         │ HTTPS / REST or gRPC
                         │ event:        { user_id, action_code, payload }
                         │ query:        balance, missions, catalog
                         │ command:      redeem, claim
                         ▼
┌──────────────────────────────────────────────────────────────┐
│           Saigon Rider Reward Engine (SRE)                   │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────┐  │
│  │ Mission    │ │ Point      │ │ Reward     │ │ Anti-    │  │
│  │ Module     │ │ Module     │ │ Module     │ │ Abuse    │  │
│  └────────────┘ └────────────┘ └────────────┘ └──────────┘  │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐ ┌──────────┐  │
│  │ Tier &     │ │ Diversity  │ │ Event Bus  │ │ Audit    │  │
│  │ Streak     │ │ Calculator │ │ (Inbound)  │ │ Log      │  │
│  └────────────┘ └────────────┘ └────────────┘ └──────────┘  │
└────────────────────────┬─────────────────────────────────────┘
                         │
              ┌──────────┴──────────┐
              │                     │
              ▼                     ▼
   ┌────────────────────┐   ┌────────────────────┐
   │  SRE Database      │   │  External APIs      │
   │  (MySQL)           │   │  - Got It / Urbox   │
   │                    │   │  - Viettel Topup    │
   └────────────────────┘   └────────────────────┘
```

### SRE가 담당하는 것 (In-Scope)
- 행동 이벤트 수집 → RP 계산 → 적립
- 미션 정의 / 진행률 / 완료 처리
- 다양성 계수 / 등급 / 스트릭 계산
- RP 잔액 / 거래 원장 / 만료 처리
- 보상 카탈로그 / 교환 / 외부 API 발급 호출
- 어뷰징 검증 (속도, 빈도, GPS 패턴, 중복)
- 모든 거래의 감사 로그

### SRE가 담당하지 않는 것 (Out-of-Scope)
- 사용자 인증 / 세션 (별도 Auth 서비스)
- 푸시 알림 발송 (Notification 서비스가 SRE 이벤트를 구독)
- GPS 트래킹, 지도 렌더링 (모바일 앱)
- 피드 게시물 / 댓글 (Feed 서비스)
- 결제 (v2 마켓플레이스가 별도)

---

## 3. 8개 모듈 책임 정의

### 3.1 Event Bus (Inbound Gateway)
- 모든 외부 이벤트의 단일 진입점
- 인증된 호출자(앱/관리자/외부)만 허용
- 멱등성(idempotency) 키로 중복 차단
- 이벤트 → 적절한 모듈로 라우팅

### 3.2 Mission Module
- 미션 정의 CRUD (관리자 전용)
- 사용자별 진행률 추적
- 자동 추천 (부족한 카테고리 우선)
- 완료 시 Point Module로 RP 적립 요청

### 3.3 Point Module (Ledger)
- **이중 원장(Double-entry ledger)** 구조
- `rp_balance`는 캐시(잔액 스냅샷), 진실은 `rp_transactions`
- 적립/사용/만료/조정 모든 변동을 트랜잭션으로 기록
- 만료 처리 배치 (3개월 미사용 시 소멸)

### 3.4 Reward Module
- 보상 카탈로그 관리
- 교환 요청 → RP 차감 → 외부 API 발급 → 결과 저장
- 외부 API 실패 시 RP 자동 환불 (보상 트랜잭션)

### 3.5 Anti-Abuse Module
- 속도 제한 (1일 SP 상한)
- GPS 패턴 검증 (속도 범위, 워프 감지)
- 중복 영수증 OCR
- 신규 계정 페널티 (3일간 50% 적립)

### 3.6 Tier & Streak Module
- 누적 RP + 다양성 계수 → 등급 갱신
- 스트릭(연속일) 추적 및 보너스 트리거

### 3.7 Diversity Calculator
- 월간 행동 카테고리 카운트
- 다양성 계수 1.0~2.0 동적 계산
- Mission/Point 모듈이 계산 시 참조

### 3.8 Audit Log
- 모든 RP 변동 / 보상 교환 / 미션 완료 영구 기록
- 정산 / 분쟁 / 어뷰징 조사용

---

## 4. 핵심 데이터 모델 개요

### 도메인별 테이블 그룹

| 도메인 | 테이블 |
|---|---|
| **사용자 식별** | `sre_user` (외부 user_id 매핑만) |
| **이벤트** | `action_event`, `action_definition` |
| **미션** | `mission_definition`, `user_mission_progress`, `mission_recommendation` |
| **포인트 (Ledger)** | `rp_balance`, `rp_transaction`, `rp_expiration_schedule` |
| **다양성 / 등급** | `behavior_category_log`, `user_diversity_score`, `tier_definition`, `user_tier` |
| **보상** | `reward_catalog`, `reward_redemption`, `reward_partner` |
| **어뷰징** | `abuse_rule`, `abuse_event`, `idempotency_key` |
| **감사** | `audit_log` |

### 핵심 개념: RP Transaction = 진실의 원천

`rp_balance`는 빠른 조회용 캐시일 뿐, 실제 진실은 `rp_transaction`의 합계.
모든 적립/사용/만료/조정은 반드시 `rp_transaction`에 기록되어야 하며,
배치로 `rp_balance`를 재계산할 수 있어야 한다 (정합성 검증 가능).

---

## 5. API 인터페이스 (요약)

### 5.1 이벤트 수신
```
POST /v1/events
{
  "user_id": 123,
  "action_code": "RIDE_KM",
  "occurred_at": "2026-05-13T10:23:45Z",
  "payload": { "distance_km": 5.2, "ride_id": 9876 },
  "idempotency_key": "ride-9876-final"
}
→ { "rp_awarded": 36, "transaction_id": 1234567, "diversity_multiplier": 1.4 }
```

### 5.2 잔액 조회
```
GET /v1/users/{user_id}/balance
→ { "rp_balance": 2340, "expiring_in_30d": 120, "tier": "Veteran" }
```

### 5.3 미션 목록
```
GET /v1/users/{user_id}/missions?status=active
→ [ { mission_id, title, progress, target, reward_rp, expires_at }, ... ]
```

### 5.4 보상 교환
```
POST /v1/users/{user_id}/redemptions
{ "catalog_id": 42, "idempotency_key": "redeem-..." }
→ { "redemption_id": 999, "status": "fulfilled", "voucher_code": "GOTIT-..." }
```

### 5.5 관리자 룰 갱신
```
PUT /v1/admin/action-definitions/RIDE_KM
{ "base_rp": 1, "is_active": true }
```

---

## 6. 핵심 룰 (v1 기본값)

### 행동별 기본 RP
| action_code | 설명 | base_rp |
|---|---|---|
| RIDE_KM | 1km 주행 | 1 |
| QUEST_COMPLETE | 퀘스트 완료 | 50~500 |
| STREAK_7 | 7일 연속 | 500 |
| GROUP_RIDE | 그룹 라이딩(3+) | 거리 × 1.2 |
| MAINTENANCE_RECEIPT | 정비 인증 | 200 |
| FUEL_RECEIPT | 주유 인증 | 50 (1일 1회) |
| MARKET_LISTING | 중고 부품 등록 | 30 (1일 3건) |
| MARKET_SUCCESS | 거래 성공 | 500 (양쪽) |
| REVIEW_PHOTO | 리뷰 작성 | 100 |
| REFERRAL | 친구 초대 | 250 (양방) |
| SHARE_SNS | TikTok/Zalo 공유 | 30 (1일 1회) |
| DELIVERY_RECEIPT | 배달 영수증 인증 | 5/건 (1일 100건) |

### 다양성 계수 (월간 카테고리 수)
| 카테고리 | 계수 |
|---|---|
| 1개 | 1.0 |
| 2개 | 1.2 |
| 3개 | 1.4 |
| 4개 | 1.6 |
| 5개+ | 2.0 |

### 등급
| 등급 | 누적 RP | 다양성 요건 |
|---|---|---|
| Rookie | 0 | - |
| Rider | 5,000 | 카테고리 2+ |
| Veteran | 25,000 | 카테고리 3+ |
| Pro | 100,000 | 카테고리 4+ |
| Legend | 500,000 | 카테고리 5+ |

### 어뷰징 가드
- 일일 RP 상한: 250 (일반) / 2,000 (인증된 드라이버)
- 신규 계정 3일간 적립률 50%
- RP 만료: 3개월 미사용 시 소멸
- GPS 속도 범위: 5~80 km/h (도심 라이딩)

---

## 7. 트랜잭션 흐름 예시

### 예시 A: 라이딩 종료 → RP 적립
```
1. 모바일 → POST /v1/events  (action: RIDE_KM, distance_km: 5.2)
2. SRE Event Bus → Anti-Abuse 검증
3. Anti-Abuse 통과 → Action Module이 base_rp 계산 (5.2 × 1 = 5)
4. + 퀘스트 완료 이벤트 (action: QUEST_COMPLETE, reward: 84) → 84
5. Diversity Calculator → 현재 1.4배
6. 최종 RP = (5 + 84) × 1.4 = 124
7. Point Module → rp_transaction INSERT, rp_balance UPDATE
8. Tier Module → 등급 재평가
9. Audit Log INSERT
10. 응답 → { rp_awarded: 124, ... }
```

### 예시 B: 보상 교환
```
1. 모바일 → POST /v1/users/123/redemptions (catalog_id: 42)
2. SRE Reward Module → 잔액 조회 (≥ required_rp 검증)
3. RP 차감 트랜잭션 (rp_transaction: type=REDEEM, -1200)
4. External API 호출 (Got It API) → 바우처 코드 수령
5. reward_redemption INSERT (status: fulfilled, voucher_code)
6. 외부 API 실패 시 → RP 환불 트랜잭션 + status=failed
7. Audit Log INSERT
8. 응답 → 바우처 코드 / 사용 가이드
```

---

## 8. 운영 / 확장 고려사항

### v1 (3개월) 범위
- 8개 모듈 모두 구현하되 룰은 단순하게
- 보상 카탈로그: 6~10개 항목 (Got It + 데이터 + 자체 굿즈)
- 어뷰징은 필수 룰 3가지만 (속도, 빈도, 신규)

### v2 이후 자연스러운 확장
- `reward_catalog`에 항목만 추가 → UI/엔진 수정 불필요
- `action_definition`에 행동 코드만 추가 → 미션 자동 생성 가능
- 외부 파트너 채널 추가 → API 키 발급만으로 동일 엔진 재사용

### 모니터링 핵심 지표
- DAU 대비 이벤트 수 (정상 범위)
- 평균 다양성 계수 (1.0~1.4 분포)
- RP 발행량 vs 소진량 (인플레이션 감시)
- 보상 교환 성공률 (외부 API SLA)

---

## 9. 보안 / 신뢰 모델

- 모바일 앱은 SRE를 직접 호출하지 않고, **앱 백엔드 게이트웨이**가 중계
- SRE는 게이트웨이의 서비스 토큰만 신뢰
- 모든 이벤트는 `idempotency_key` 필수
- 관리자 API는 별도 Admin Token + RBAC
- 모든 트랜잭션은 외부 변경 불가능한 `audit_log` 보존

---

## 10. 마이그레이션 / 배포 전략

| 단계 | 액션 |
|---|---|
| 1 | 기존 모놀리식 DB에 SRE 테이블 추가 (같은 DB) |
| 2 | 코드만 모듈화 (engine 패키지로 분리) |
| 3 | 트래픽 안정화 후 별도 DB 인스턴스로 분리 |
| 4 | gRPC/REST API로 분리 배포 |

**v1에서는 1~2단계로 충분**. 완전 분리는 트랙션 본 후 진행.

---

(끝)
