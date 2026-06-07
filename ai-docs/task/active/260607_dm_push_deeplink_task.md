# DM 푸시 알림 + 알림 클릭 → 해당 DM 딥링크

> 발행 2026-06-07. SoT. Plane Feature/Todo·Notion 미러 연동.
> 관련 TODO(current.md 스프레드시트): A-5(FCM 토큰 서버전송) / A-6(admin PUSH) / B-4(iOS 알림클릭 페이지이동) / B-5(Android 알림클릭 페이지이동) / B-6(앱푸시연동·미열람개수).

## 목적

DM 기능과 FCM 인프라는 각각 완비돼 있으나 연결돼 있지 않다. 이 작업은 둘을 잇는다:
- DM 메시지 전송 → 수신자에게 FCM 푸시 발송 (매 메시지마다)
- 알림 클릭 → 해당 DM 대화방(`/dm/<conv_id>`)으로 직행 (iOS·Android 양 플랫폼, 앱 실행중/종료 모두)

## 기존 자산 (재사용)

| 영역 | 위치 | 비고 |
|---|---|---|
| FCM 토큰 저장 | `device_user_map.fcm_token` (engine) | `/auth/device-map` 로그인 시 등록 |
| 푸시 발송 | `engine/app/services/fcm_push.py` `send_push()` | `data` payload·badge·이력 지원 |
| BFF→engine push | `backend/app/engine_client.py` `send_push()` | `/v1/admin/push/send` |
| DM 엔드포인트 | `backend/app/routers/dm.py` | 대화/메시지/읽음 5종 |
| DM 프론트 | `/dm`, `/dm/:conversationId` (`App.tsx`) | DmList/DmDetail |
| 딥링크 라우터 | `frontend/src/pages/link/LinkRouter.tsx` | `/link?action=X&id=Y` |
| 알림 클릭 브리지 | `native.ts onNotificationClick`, iOS `FcmPlugin.swift` | iOS는 navigateTo 포워딩 구현됨 |
| 매핑 | BFF user UUID = `sre_user.external_user_uuid` | engine BigInt user_id로 token 해석 |

## 딥링크 규약 (기존 컨벤션 유지)

`data.navigateTo = "dm&id=<conv_id>"` → 웹 `native.onNotificationClick` → `navigate('/link?action=' + navigateTo)` → `/link?action=dm&id=<conv_id>` → `LinkRouter` → `/dm/<conv_id>`.

## Phase

### P1 — Backend (BFF/Engine)
- **1-1** engine `POST /v1/push/notify` (service-key) — `{external_user_uuid, title, body, data}`. external_uuid→sre_user→device_user_map.fcm_token 해석. 토큰 없으면 `{"sent":0}`(에러 아님). `device_map.py`에 추가.
- **1-2** `fcm_push.send_push`에 `log_history: bool = True` 파라미터. False면 `_save_log` 스킵(badge는 유지). admin 호출 무변경.
- **1-3** `engine_client.notify_user_push(external_user_uuid, title, body, data)`.
- **1-4** `dm.py send_message` commit 직후 수신자(`_other_user_id`)에 푸시. title=발신자 닉네임, body=content[:50] 또는 "사진을 보냈습니다", data={navigateTo}. try/except로 감싸 실패해도 메시지 전송 201 유지.

### P2 — Frontend (웹)
- **2-1** `LinkRouter.resolveAction`에 `case 'dm'` → `/dm/${id}`.
- **2-2** `App.tsx`에 `native.onNotificationClick` 구독 useEffect → `navigate('/link?action=' + e.navigateTo)`.
- **2-3** 콜드스타트: `native.ts getPendingNotification()` 추가 + 부트 시 1회 drain.

### P3 — Android native (별도 repo)
- **3-1** `FcmPlugin.java` 신규 (jsName "Fcm"): notificationClick 발행 + getPendingNotification + static emitOrBuffer.
- **3-2** `MyFirebaseMessagingService.showNotification`: data `navigateTo`를 Intent extra로 PendingIntent에 첨부.
- **3-3** `MainActivity`: registerPlugin(FcmPlugin) + onCreate/onNewIntent에서 extra 읽어 emitOrBuffer.

### P4 — iOS native (별도 repo)
- **4-1** `FcmPlugin.swift`: `getPendingNotification` 추가 (`AppDelegate.pendingPushPayload` 소비). 앱 실행중 경로는 기존 유지.

### P5 — 검증
- lint/build: eslint·tsc·ruff 에러 0.
- 단위: `/v1/push/notify` curl (토큰有→sent:1, 無→sent:0), DM 전송→엔진 push 로그 1건·admin 이력 미적재, credentials 없을 때 BFF 201 유지.
- 웹: `/link?action=dm&id=<conv_id>` → `/dm/<id>` 이동.
- 실기기(양 플랫폼): 빌드머신(Mac) 대기. native는 각 origin main 직접 push.

## 제약 / 범위 밖
- DM 외 알림 타입(quest 등 LinkRouter 기존), 푸시 throttle/묶음, 다국어 푸시 본문은 범위 밖.
- 운영 활성은 firebase-credentials.json 마운트(current.md 배포 후속 ②) 후.
