# §3 엔진(SRE) 기능 점검

> 진척도: [../progress.md](../progress.md) · 이슈 로그: [../issues.md](../issues.md)

엔진은 **별도 컨테이너(`saigon_engine` :8090)** 로 동작하며, BFF는 `engine_client` HTTP 클라이언트(서비스 키 인증)를 통해서만 호출한다. 모바일 앱은 엔진을 **직접 호출할 수 없다**(Nginx `/engine/`은 내부 네트워크만 허용).

## 3.1 화면 ↔ 엔진 연계 매트릭스

| 트리거 화면 | 사용자 행동 | BFF 라우터 | Engine 호출 | Engine 액션 코드 | 사이드이펙트 | 상태 |
|---|---|---|---|---|---|---|
| RIDE-RESULT-S | 라이딩 종료 제출 | `ride.submit_ride()` | `POST /v1/events` × 1 | `RIDE_KM` | `rp_transaction` EARN, `sre_user.lifetime_earned` ↑, mission progress 갱신 | ⬜ |
| RIDE-RESULT-S | 퀘스트 완료 동반 | `ride.submit_ride()` | `POST /v1/events` × 1 (추가) | `QUEST_COMPLETE` | mission progress + RP EARN | ⬜ |
| RIDE-RESULT-S / FEED-001 | 결과 공유 / 피드 작성 | `feed.create_feed_post()` | `POST /v1/events` × 1 | `SHARE_SNS` | RP EARN, SHARE 카테고리 diversity 누적 | ⬜ |
| PROFILE-001 | RP 잔액 조회 | `profile.get_rp_balance()` | `GET /v1/users/{id}/balance` | — (조회) | 응답 캐시 없음(실시간) | ⬜ |
| (미정) | 친구 초대 | `users.*` (P2 ROADMAP) | `POST /v1/events` | `REFERRAL` | 등록 자 발생 시 1회 | ⬜ |

## 3.2 Engine API 점검 항목 (서비스간 직접 호출)

> 점검용 호출은 BFF 내부에서만 가능하나, 점검 편의를 위해 `docker exec saigon_bff sh -c 'curl ...'` 또는 호스트에서 `X-Service-Key` 헤더로 `localhost:18090/engine/...`(IP 제한 해제 시) 사용 가능.

| 엔드포인트 | Method | 인증 | 용도 | 점검 | 상태 |
|---|---|---|---|---|---|
| `/v1/events` | POST | `X-Service-Key` | 액션 이벤트 발행 (RP 파이프라인) | 멱등키 동일값 재호출 시 동일 응답·중복 적립 없음. `action_event` insert 1건만 확인 | ⬜ |
| `/v1/events/{event_id}` | GET | `X-Service-Key` | 이벤트 단건 조회 | event_id로 status/processed_at 확인 | ⬜ |
| `/v1/users/{user_id}/balance` | GET | `X-Service-Key` | 잔액 / lifetime / 만료예정 / 등급 | `current_balance == lifetime_earned − lifetime_spent − expired` 검증 | ⬜ |
| `/v1/users/{user_id}/transactions` | GET | `X-Service-Key` | 트랜잭션 페이지네이션 | `tx_type` 쿼리 EARN/REDEEM/EXPIRE/ADJUST_PLUS/ADJUST_MINUS/REFUND 필터 | ⬜ |
| `/v1/users/{user_id}/expirations` | GET | `X-Service-Key` | N일 내 만료예정 RP | `?days=30` 응답 합 == `expiring_in_30d` | ⬜ |
| `/v1/users/{user_id}/missions` | GET | `X-Service-Key` | 사용자 미션 진행도 | `status=ACTIVE/COMPLETED/EXPIRED/CANCELLED`, `category` 필터 | ⬜ |
| `/v1/users/{user_id}/missions/{progress_id}` | GET | `X-Service-Key` | 단건 미션 진행도 | progress_id 단건 조회 | ⬜ |
| `/v1/users/{user_id}/missions/{progress_id}/abandon` | POST | `X-Service-Key` | 미션 포기 | 상태가 CANCELLED로 변경 | ⬜ |
| `/v1/catalog` | GET | `X-Service-Key` | 보상 카탈로그 목록 | `is_active=true`, `visible_from/until` 게이트 통과 항목만 | ⬜ |
| `/v1/catalog/{catalog_id}` | GET | `X-Service-Key` | 카탈로그 단건 | 활성 항목만 노출 | ⬜ |
| `/v1/users/{user_id}/redemptions` | POST | `X-Service-Key` | 보상 교환(차감) | RP 부족 시 402, 재고/노출기간 외 409; 정상 시 PENDING/APPROVED | ⬜ |
| `/v1/users/{user_id}/redemptions` | GET | `X-Service-Key` | 교환 내역 | `status=PENDING/APPROVED/REJECTED/FULFILLED` | ⬜ |
| `/v1/users/{user_id}/redemptions/{id}` | GET | `X-Service-Key` | 교환 단건 | 단건 상태 확인 | ⬜ |
| `/v1/admin/action-definitions` | GET/POST/PUT | Admin JWT | 액션 정의 CRUD | `verify_admin_jwt` 통과 필요 | ⬜ |
| `/v1/admin/users/{user_id}` | GET | Admin JWT | 유저 요약 + 잔액 + 등급 | 단건 어드민 조회 | ⬜ |
| `/v1/admin/users/{user_id}/adjust` | POST | Admin JWT | 수동 RP 가감 | `audit_log` 1행 추가 + `rp_transaction` ADJUST_PLUS/MINUS | ⬜ |
| `/v1/admin/audit-logs` | GET | Admin JWT | 감사 로그 | 페이지네이션 | ⬜ |

## 3.3 Engine 서비스 레이어 점검 포인트

| 서비스 | 책임 | 점검 시나리오 | 상태 |
|---|---|---|---|
| `event_bus.py` | 이벤트 처리 파이프라인 11단계 (멱등→검증→어뷰징→일일캡→다양성→RP계산→트랜잭션→미션→등급) | 동일 idempotency_key 두 번 호출 → 1건만 처리. 동일일자 RIDE_KM 다회 호출 시 일일캡(`SRE_DAILY_CAP_STANDARD=250`) 초과분 미적립 | ⬜ |
| `point_ledger.py` | 잔액 / 트랜잭션 / 일일적립 | EARN 후 `rp_balance.current_balance` 증가. 만료 시 EXPIRE 트랜잭션 | ⬜ |
| `anti_abuse.py` | GPS_SPEED_RANGE(REJECT), DUPLICATE_RECEIPT(REJECT), NEW_ACCOUNT_50(REDUCE), DAILY_RP_CAP(CAP) | 가입 3일 이내 계정은 적립 ×0.5 적용; 비현실 속도 페이로드 → 거부 | ⬜ |
| `diversity.py` | 카테고리 다양성 배율 (월 단위) | 한 달 내 1~5종 카테고리 활동 → 배율 1.0 / 1.0 / 1.2 / 1.4 / 1.6 (최대 2.0) | ⬜ |
| `mission.py` | 액션 → 미션 진행도 누적 | 매핑된 액션 발생 시 `user_mission_progress.progress` ↑, 목표 도달 시 COMPLETED | ⬜ |
| `tier.py` | 등급 재평가 | 누적 lifetime_earned 임계 도달 시 `user_tier` 갱신 | ⬜ |
| `reward.py` | 보상 교환 트랜잭션 | RP 차감 + `reward_redemption` 생성 (멱등 보장) | ⬜ |
| `audit.py` | 모든 상태변경 감사 로그 | 어드민 adjust 후 `audit_log.entity_type/action_code/before/after` 적재 | ⬜ |

## 3.4 Engine 배치 잡 (APScheduler — VN 시간)

| 잡 | 스케줄 | 동작 | 점검 | 상태 |
|---|---|---|---|---|
| `expire_rp.py` | 매일 04:00 | 만료된 RP를 EXPIRED 처리·잔액 차감·EXPIRE 트랜잭션 적재 | 실행 후 `rp_expiration_schedule.status=EXPIRED`, 동일 금액 `rp_transaction` EXPIRE 행 존재 | ⬜ |
| `expire_missions.py` | 매일 04:05 | 만료된 미션 EXPIRED 마크 | `user_mission_progress.expires_at < now()` 행이 EXPIRED 로 전환 | ⬜ |
| `cleanup_idem.py` | 매일 04:10 | 멱등키 TTL 만료분 삭제 (`SRE_IDEMPOTENCY_TTL_DAYS=7`) | 7일 경과 `idempotency_key` 삭제 확인 | ⬜ |
| `verify_balance.py` | 매일 04:30 | `rp_balance` 캐시와 트랜잭션 합 일치 검증 — 불일치 시 structlog 경고 | 일부러 캐시 변조 후 잡 실행 → 로그에 mismatch 출력 | ⬜ |

**잡 수동 실행 점검 (개발 환경)**:
```bash
docker exec saigon_engine python -m app.jobs.expire_rp
docker exec saigon_engine python -m app.jobs.verify_balance
```

## 3.5 Engine 관측성 / 운영

| 항목 | 점검 | 상태 |
|---|---|---|
| Prometheus 메트릭 | `curl http://localhost:18090/api/sre/metrics` (또는 `/v1/metrics`) — counter/histogram 노출 확인 | ⬜ |
| structlog JSON 로깅 | `docker logs saigon_engine` — 키-값 JSON 형태로 출력 | ⬜ |
| 헬스체크 | `curl -i http://localhost:18090/api/sre/healthz` → 200 | ⬜ |
| 단위 테스트 | `docker exec saigon_engine pytest app/tests/` — `test_event_bus`, `test_point_ledger`, `test_anti_abuse` 통과 | ⬜ |
| 환경변수 | `.env` — `ENGINE_SERVICE_KEY`, `ENGINE_ADMIN_JWT_SECRET`, `SRE_DAILY_CAP_*`, `SRE_NEW_ACCOUNT_*`, `SRE_RP_EXPIRY_MONTHS` 설정 여부 | ⬜ |

## 3.6 데이터 정합성 점검 SQL

```sql
-- 1. 잔액 == 트랜잭션 합산 일치 검증
SELECT u.external_user_uuid,
       b.current_balance,
       COALESCE(SUM(CASE WHEN t.tx_type IN ('EARN','ADJUST_PLUS','REFUND') THEN t.amount
                         WHEN t.tx_type IN ('REDEEM','EXPIRE','ADJUST_MINUS') THEN -t.amount
                    END),0) AS computed
  FROM sre_user u
  JOIN rp_balance b ON b.user_id = u.id
  LEFT JOIN rp_transaction t ON t.user_id = u.id
 GROUP BY u.external_user_uuid, b.current_balance
HAVING b.current_balance <> COALESCE(SUM(...),0);  -- 결과 0행이 정상

-- 2. 멱등키 중복 처리 없음
SELECT idempotency_key, COUNT(*) FROM idempotency_key GROUP BY 1 HAVING COUNT(*) > 1;

-- 3. 신규 계정 0.5배 적용 확인
SELECT ae.*, t.amount, t.applied_multiplier
  FROM action_event ae JOIN rp_transaction t USING (event_id)
 WHERE ae.user_id = '<신규 가입 3일 이내 user uuid>'
 ORDER BY ae.occurred_at;

-- 4. 일일 적립 캡 확인 (STANDARD=250)
SELECT user_id, occurred_at::date AS day, SUM(amount) AS daily_earn
  FROM rp_transaction
 WHERE tx_type = 'EARN'
 GROUP BY 1,2 HAVING SUM(amount) > 250;
```
