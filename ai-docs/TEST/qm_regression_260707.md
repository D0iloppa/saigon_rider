# 회귀 스윕 + P1 안정성 패키지 (2026-07-07)

> ① 최근 변경(QM 18건·결정 후속 4건·디자인 업리프트)에 대한 read-only 회귀 검증(8유닛 병렬, 브라우저+API)
> ② handoff ③의 P1 워커·머니경로 안정화 구현. 스크린샷 `tools/qm/shots/reg-*.png`.

## ① 회귀 스윕 결과 — 41체크: PASS 38 / 이슈 3 / BLOCKED 1(측정환경)

핵심 수정 전건 유지 확인: 플랫 리스트(4화면)·가격 `N đ`·좌표 등록 201·가격제안 시트/게이팅·홈 상세 진입·댓글 카운트 증가(DB 확인)·알림설정 저장 유지·닉네임 힌트·DM 무인증 가드(419/403)·골드부족 토스트·SVG 콘솔에러 재발 없음.

발견·조치 (전건 수정 완료):

| 심각도 | 결함 | 조치 |
|---|---|---|
| P2 | 상세 가격 `đ` 단독 줄바꿈 (배지+pill 혼잡 행) | `.price` nowrap + `.priceRow` wrap |
| P2 | 지도 피드 탭 selected 강조가 CSS 선언 순서로 무효화 | `.feedCard.selected` 복합 선택자 추가 |
| P2 | ProfileSetup maxLength=12 < 자동 닉네임(~18자) — 자기 닉네임 truncate로 중복확인 오판 | maxLength/isValid 20으로 |
| P2 | **신규 유저 첫 상점 구매 400** (xp_balance row 부재 → SQL 에러) | shop.purchase에 `get_or_create_balance` 선생성 (가챠와 동일 패턴). 검증: 신규계정 402 "insufficient GP balance: have 0, need 300" |
| P3 | 상점/가챠 402·400에 raw SQL 에러 원문 노출 | RAISE 메시지만 추출해 detail로 |
| — | MarketCreate priceLabel 데드 코드 | 제거 (`price === ''` 직접 체크) |

미조치(기록): dev-login 동일 phone 재호출 시 직전 세션 무효화(P3, dev 전용 — 병렬 QM은 번호 분리로 회피), BFF→DB 간헐 asyncpg DNS 오류(P3, WSL2 — 운영 환경 무관 추정, 관찰 유지).

## ② P1 안정성 패키지 (inspection 260703 §3 P1)

| ID | 조치 | 검증 |
|---|---|---|
| **E-1** | 워커 메시지 단위 격리: 실패 메시지만 ack 보류(재클레임 재시도), 5회 도달 시 DLQ `sre:messages:dlq`(maxlen 10k) 격리. 트림 메시지(PEL 잔류) 정리 가드 | 실Redis 테스트: 실패 격리(pending 1, 정상건 ack)·5회차 DLQ 이동(orig_id/deliveries 보존) PASS ×2회 |
| **E-2** | 루프 사이클 완주 시 heartbeat SETEX(TTL 30s) + compose healthcheck — livelock 시 TTL 만료로 unhealthy 노출 | `saigon_worker (healthy)` |
| **E-4** | quest_completed 콜백: 전송실패·5xx·**401/403(키 설정 오류)** 은 raise→재시도→DLQ 보존, 그 외 4xx만 영구 종결 | 422 → "permanent, not retried" + ack 라이브 확인 |
| **E-9** | engine bff_client `AsyncHTTPTransport(retries=3)` — 연결 수립 단계만 재시도(비멱등 POST 안전, httpcore semantics 리뷰 확인) | 코드+적대리뷰 REFUTED(안전) |
| **B-1** | BFF info 4라우터 suppress → `engine_client.post_event_safe`(log+bool, **201+REJECTED도 미지급으로 판정**) 통일. repair/flood/gas 응답 보상 표기를 실제 적립 성공분만 합산 | ruff 0, weather 200 |

**적대 리뷰(High) 반영**: DLQ xadd 실패 시 배치 중단→이중 적립 경로(P2) 차단, tombstone `xack(None)` DataError livelock 가드, heartbeat 위치 이동(false healthy 방지), REJECTED 인지, 401/403 재시도.

**후속 백로그 (리뷰어 권고)**:
1. **GPS 마일리지 msg_id 멱등키** — xack 실패 창의 이중 적립 근본 해소 (`UserMileageLog.msg_id` unique + ON CONFLICT)
2. quest-card-completed `SELECT FOR UPDATE` — 워커 스케일아웃 전제 시 TOCTOU
3. E-5~E-8 멱등키/쿼터 락 (가챠·상점·쿠폰 — inspection §3 잔여)
4. weather notify-rain 표기 정직화 (동일 클래스, 응답 비노출이라 후순위)

**운영 배포 시**: 워커 이미지 재빌드+재시작(코드 변경), compose healthcheck 반영. DB 마이그 없음.
