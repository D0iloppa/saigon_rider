# 260710 알림 에이전트 레이어 (noti_worker) + 설정 화면 정비 + 인앱 알림함

> **SoT는 이 md 문서** (Plane 오염 방지 결정 — 2026-07-10 대표 지시. Plane 등록하지 않음).
> 진행현황은 §0 에 단계별로 갱신 — 다른 세션에서 이 문서 하나로 이어받는다.
> 실행 방식: 드라이버(메인)는 오케스트레이션만, 구현은 qm-implementer/qm-reviewer 서브에이전트 순차 위임(병렬 금지 — 토큰 관리).

## 0. 진행현황 (Session Carry-Over)

| 단계 | 상태 | 모델(근거) | 커밋 | 비고 |
|---|---|---|---|---|
| P1 설정 화면 정비 | ✅ DONE·리뷰 PASS (2026-07-10) | 구현 Sonnet(기계적 UI 제거+컬럼 추가 — 패턴 미러링) / 리뷰 Sonnet | `ec2f61a` | init/111 dev DB 적용됨. 종단 curl 검증 완료(:18090 dev-login→GET/PUT keyword_alert). 퀘스트 4토글 UI만 제거·백엔드 보존 확인 |
| P2 noti_worker 신설 | ✅ DONE·리뷰 PASS (2026-07-10) | 구현 Fable(신규 워커 레이어·at-least-once 정합성 — 복잡 로직) / 리뷰 Fable(워커 정합성 적대 검토) | `c39cb52` | 스트림 `noti:events`/그룹 `noti-workers`/DLQ, docker 서비스 `noti_worker`(healthy). init/112(KEYWORD enum+notifications.link) dev 적용. 종단 6종(DM/키워드/게이트/DLQ/Redis다운 회귀) 전건 PASS. 결정: 토글은 푸시만 게이트, 인앱 row 항상 기록. 리뷰 비차단 노트: ①dm.py 고아 logging import→P3 서 정리 ②NotificationOut.link 미노출→P3 필수 ③commit-ack 사이 크래시 시 인앱 row 중복 가능(수용) |
| P4 홈 헤더 압축 | ✅ DONE·리뷰 PASS (2026-07-10) | 구현 Fable(시각 밀도·정렬 판단이 핵심인 UI 디테일) / 리뷰 Sonnet. 후속 여백 1줄은 Fable 재개로 처리됨 — **라우팅 미스 인정, 이후 마이크로 후속은 신규 Sonnet 스폰 규칙 확립** | `57614fa`+`80fd969`(후속: 구분선~첫 섹션 타이틀 여백 22px, hScroll 리듬 동일 스케일) | 목업(`_tmp/image copy 23.png`) 4포인트 전부 일치 판정: 레벨칩+위치 row 제거·Lv칩 아바타 overlay·위치|거리 우측 2단·벨/RP필 크기 불변. 부수: 벨 터치영역 27→44px(시각 불변, 네거티브 마진), locName ellipsis 가드. 비차단 노트: 벨 마진 가로 비대칭 ~7px(간섭 없음, 정밀 대칭 원하면 right -17px). 미인증 분기는 코드에 부재(verified 줄 무조건 렌더) — 출렁임 리스크 없음 |
| P3 인앱 알림함 | ✅ DONE·리뷰 PASS (2026-07-10) | 구현 Fable(신규 화면 UI 품질) / 리뷰 Sonnet(재리뷰 포함 2회) | `92dc289`+`becaba6`+`a3e9fba` | 알림함 화면(/notifications)+홈 벨 뱃지+개별 read API. 1차 리뷰 CHANGES: **GET /notifications 무인증 열람(DM 미리보기 노출, P0 46d13ee 동일 클래스)** → becaba6 서 GET 2종 세션검증+본인스코프 404. 구현자 추가 발견 PUT /settings 세션-바디 uid 미대조 → a3e9fba 서 차단. notifications 라우터 4엔드포인트 전부 본인 스코프 일관. 재리뷰 PASS(우회 여지·고아·회귀 없음) |

**이어받기 절차**: 이 표에서 첫 미완 단계 확인 → 해당 단계 §의 과업을 qm-implementer 에 주입(모델은 표의 근거대로) → 완료 시 qm-reviewer 검토 → PASS 후 이 표 갱신. 리뷰 CHANGES 시 환류 주입 재구현.

**P1~P3 전건 완료 (2026-07-10)** — 잔여는 §4 마무리 항목:
- [ ] codebase-memory `index_repository(moderate)` 재인덱싱 — **이 세션에서 MCP 연결 끊김으로 미수행, 다음 세션 필수** (변경 대량: noti_worker 신규 모듈, notifications/dm/market 라우터, 알림함 화면). frontend-page-map/ADR 에 알림함 화면(/notifications, 홈 벨 진입) 추가도 함께.
- [ ] push 전 `/code-review`(medium) 게이트 — 커밋 4건(ec2f61a, c39cb52, 92dc289+becaba6+a3e9fba) 대상. 단 P2 는 Fable 적대 리뷰, P3 는 2회 리뷰를 이미 통과했으므로 중복 판단은 드라이버 재량.
- [ ] 실기기/FCM 실전달 검증은 SGR-274 잔여 축과 동일(빌드머신 의존).

## 1. 배경 · 현황 (2026-07-10 탐색 결과, 사실 기준)

- 알림설정 화면 `frontend/src/pages/settings/NotiSettings.tsx` 의 5토글(quest_recommend/quest_expire/event/ride_result/social)은 `PUT /notifications/settings` 로 **저장만 되고 어떤 발송 경로도 이 값을 읽지 않음** (죽은 설정).
- 키워드 알림: UI는 마켓 화면(`frontend/src/pages/market/MarketMain.tsx`, `api/market.ts:491-511`), 백엔드 `marketplace_keyword_alerts` + `_notify_keyword_matches()`(`backend/app/routers/market.py:70-88`) — **매물 등록 요청 경로 안에서 전체 키워드 풀스캔 후 동기 푸시**. 설정 화면에는 항목 자체가 없음.
- 인앱 알림: `notifications` 테이블(`backend/app/models.py:628-639`) + `GET /notifications`(`backend/app/routers/notifications.py:30-68`) 존재하나 **INSERT 하는 곳 0, 프론트 호출 0** — 완전 스텁.
- 실동작 푸시: DM 신규 메시지(`backend/app/routers/dm.py:353`), 키워드 매칭, 어드민 수동발송 3곳. 발송 실체는 Engine `POST /v1/push/notify`(`engine_client.notify_user_push`, FCM v1).
- 인프라: Redis Streams 컨슈머 그룹 워커가 **Engine 쪽에 이미 존재**(`engine/app/workers/__main__.py`, `sre:messages`/`sre-workers`/xclaim/DLQ — P1 안정화 하드닝 완료 상태). BFF 도 Redis 접속 보유(`backend/app/services/redis_cache.py`).

## 2. 결정사항 (2026-07-10 확정)

1. **agent manager 별도 구현 안 함** — Redis Streams 컨슈머 그룹(XREADGROUP/XPENDING/XCLAIM/DLQ)이 producer-consumer 오케스트레이션을 브로커 차원에서 제공. 컨트롤 플레인 = 스트림 관측(XPENDING/XLEN/DLQ 길이).
2. **단일 알림 바운디드 컨텍스트**: 도메인별 특화 agent 다수가 아니라 알림 도메인 워커 1종(`noti_worker`)이 이벤트 타입별 파이프라인 분기. (우버/그랩/당근 공통형: 도메인 이벤트버스 → 단일 Notification Service → 채널 발송. 이 스케일에선 Kafka 대신 Redis Streams 가 올바른 다운스케일.)
3. **워커 위치 = BFF 스택**: 알림 도메인 데이터(notification_settings, marketplace_keyword_alerts, notifications)가 전부 BFF DB 소유. "BFF↔Engine DB 직접 접근 금지" 제약상 BFF 코드베이스의 별도 프로세스(docker 서비스)로. FCM 발송만 기존 `engine_client.notify_user_push()` HTTP 경유.
4. **스트림 분리**: `noti:events` 신규 (GPS 고빈도 트래픽과 경합 방지, `sre:messages` 오염 금지).
5. **DM 푸시 이벤트화** (대표 결정) — dm.py 인라인 발송 제거, 이벤트 발행으로 전환. social 토글이 처음으로 실효.
6. **인앱 알림함 이번 스코프 포함** (대표 결정) — P3.
7. **퀘스트 계열 토글 UI 제거** (게이미피케이션 잠정보류): quest_recommend/quest_expire/event/ride_result 4종 UI만 제거, DB 컬럼·백엔드 필드 보존 (다크모드 보존 방침과 동일).

## 3. 목표 아키텍처

```
BFF 핸들러 (매물등록 market.py / DM전송 dm.py / 향후 소셜·스케줄러)
    │ XADD noti:events {type, payload}   ← 요청 경로는 발행만. 발행 실패는 요청 실패로 전파 금지(try/except)
    ▼
noti_worker (docker 서비스 신규, backend 이미지, python -m app.noti_worker)
    │ XREADGROUP group=noti-workers + XAUTOCLAIM 재할당 + DLQ noti:events:dlq
    │ (engine/app/workers/__main__.py 의 검증된 소비 패턴 미러링)
    ├─ ① 타입별 핸들러 분기 (market.listing_created / dm.message_sent / ...)
    ├─ ② 매칭 (키워드: 기존 풀스캔 로직 이관 — 현 스케일 충분, 확장 시 역인덱스)
    ├─ ③ notification_settings 체크 (social→DM, keyword_alert→키워드) ← 죽은 토글 실효화
    ├─ ④ notifications row INSERT (인앱 알림함 생산자)
    └─ ⑤ engine_client.notify_user_push() → Engine → FCM
```

- 멱등/전달보장: at-least-once + DLQ. 스트림 msg id 를 처리 로그에 남김. 중복 푸시는 허용(치명적이지 않음), notifications INSERT 는 (user_id, type, ref, msg_id) 기준 중복 방지 가능하면 적용.
- datetime 은 timezone-aware 강제 (Engine 규칙을 BFF 워커에도 동일 적용).
- 신규 .env 키 없음 예상(REDIS_URL 재사용). 키 추가 시 .env/.env.example 동시 갱신 필수.

## 4. 단계별 과업

### P1 — 설정 화면 정비 (프론트 + 소규모 스키마)

- [ ] `NotiSettings.tsx`: 퀘스트/결과 섹션(quest_recommend, quest_expire, event, ride_result) UI 제거. social 유지.
- [ ] **키워드 알림 섹션 신설**: 마스터 토글 `keyword_alert` + 캡션("키워드 등록·관리는 마켓 화면에서" 안내, 필요 시 마켓 키워드 관리로 이동 링크). 키워드 CRUD UI 는 마켓 화면 기존 것 유지(중복 구현 금지 — Simplicity First).
- [ ] 스키마: `notification_settings` 에 `keyword_alert BOOLEAN NOT NULL DEFAULT true` — 기존 `init/*.sql` 다음 번호로 작성 + **dev DB 적용**.
- [ ] 백엔드: `routers/notifications.py` GET/PUT settings 에 keyword_alert 필드 추가, `models.py` 반영.
- [ ] 프론트 `api/notifications.ts` 타입 반영, i18n ko/en/vi.
- 검증: tsc 0 / eslint 에러 0 / 설정 화면에서 토글 저장→재조회 값 유지(dev API 실호출) / 제거된 토글 렌더링 안 됨.

### P2 — noti_worker + 이벤트 발행 전환 (백엔드)

- [ ] `backend/app/noti_worker/`(또는 backend 관례에 맞는 위치) 신규: `python -m app.noti_worker` 진입점. engine worker 의 xreadgroup/xautoclaim/DLQ/graceful shutdown 패턴 미러링.
- [ ] 발행 헬퍼 `backend/app/services/noti_events.py`: `publish(type, payload)` → XADD `noti:events`. 실패 시 로그만(요청 실패 전파 금지).
- [ ] 생산자 전환 ①: `market.py` 매물 등록 → `_notify_keyword_matches()` 인라인 호출 제거, `market.listing_created` 이벤트 발행. 매칭 로직은 워커로 이관.
- [ ] 생산자 전환 ②: `dm.py send_message` → 인라인 `notify_user_push` 제거, `dm.message_sent` 이벤트 발행.
- [ ] 워커 파이프라인: 타입 분기 → 매칭 → **settings 체크(social/keyword_alert)** → `notifications` INSERT → `notify_user_push`. 수신자 본인 제외 규칙 유지.
- [ ] `docker-compose.yml`: `noti_worker` 서비스 추가 (backend 이미지, command 오버라이드, REDIS_URL, depends_on redis+database healthy, profile backend).
- [ ] notifications INSERT 시 딥링크 정보 저장 (기존 규약: DM=`dm&id=<conv_id>`, 마켓 매물 상세 링크) — P3 알림함 클릭 이동에 사용.
- 검증: ruff 0 / 워커 기동 클린 / 실Redis 종단: 이벤트 XADD→notifications row 생성+push 시도 로그 / 토글 OFF 시 미발송 확인 / DLQ 경로(핸들러 강제 예외) 동작 / DM 전송·매물등록 API 회귀 무. **워커는 자동 reload 없음 — 코드 변경 시 재시작 필수** (2026-06-05 교훈).

### P3 — 인앱 알림함 (프론트 + 보조 API)

- [ ] 백엔드: 읽음 처리 API 추가 (`PUT /notifications/read-all` 및/또는 개별 read) + 미읽음 카운트(목록 응답에 포함으로 충분하면 별도 API 금지 — Simplicity First).
- [ ] 프론트 알림함 화면 신규 (`GET /notifications` 최초 연결): 목록(타입 아이콘·제목·본문·상대시간), 클릭 → 저장된 딥링크 규약으로 이동(기존 `LinkRouter` 재사용), 읽음 처리, 빈 상태(QM UX 렌즈: 빈 상태 디자인 필수).
- [ ] 진입점: 홈 헤더 벨 아이콘 + 미읽음 뱃지 (당근 관례). i18n ko/en/vi.
- [ ] 동적 이미지 사용 시 `<AppImage>`, 상단 여백 `var(--status-bar-height)`.
- 검증: tsc 0 / eslint 에러 0 / dev 에서 P2 워커로 생성된 실데이터 알림 목록 표시→클릭 이동→읽음 반영→뱃지 감소.

### P4 — 홈 헤더 압축 (2026-07-10 추가, 대표 목업 승인)

목업 `/home/doil/workspace/w_dev/saigon_rider/_tmp/image copy 23.png` (현행 비교: `image copy 22.png`). 대상: `frontend/src/pages/home/WorldMapV2.tsx` + module.css.

- [ ] '레벨 뱃지'+'위치 | 누적거리'가 차지하던 row 제거.
- [ ] 레벨 뱃지(Lv.N)는 프로필 아바타 **하단부 overlay**로 (아바타도 목업 수준으로 축소).
- [ ] '위치 | 누적거리'는 우측 컬럼(RP 필·벨) **하단**으로 재배치.
- [ ] **벨 아이콘 축소 금지** (위치만 이동, 목업 참고) — P3 미읽음 뱃지 위치 정합 유지, 44px 터치영역 유지.
- [ ] 미인증 유저(본인인증 줄 부재) 분기에서 레이아웃 출렁임 없는지 확인.
- 검증: tsc 0 / eslint 에러 0 / qm-shot 스크린샷 목업 대조 / 확보 여백만큼 검색바·첫 상품행 상승 확인.

### 마무리 (전 단계 완료 후)

- [ ] codebase-memory `index_repository`(moderate) 재인덱싱 + frontend-page-map/ADR 갱신(알림함 화면 추가분).
- [ ] `ai-docs/context/current.md` 활성 태스크 반영.
- [ ] push 전 `/code-review` (medium) — CLAUDE.md 게이트.

## 5. 운영 배포 시 잔여 (누적)

- init/111(keyword_alert), init/112(KEYWORD enum+notifications.link) 운영 DB 적용.
- docker-compose `noti_worker` 서비스 운영 반영: `docker compose --env-file .env up --build -d noti_worker` + healthy 확인. 워커는 자동 reload 없음 — 이후 코드 변경 시 재시작 필수.
- FCM 실전달은 실기기 검증 의존(SGR-274 잔여와 동일 축).
