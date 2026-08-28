# Live Activity — 경로안내·거래 진행 잠금화면 카드 (2026-08-29)

> **SoT** — 이 문서가 Live Activity 기능의 단일 출처다.
> **상태**: Phase 1 구현 완료(2026-08-29, 실기기 미검증) / Phase 2·3 착수 예정.
> **확정 경위**: 대표 결정 2026-08-29 — D-1 (a) Xcode GUI 타겟 생성(완료, Product Name `SaigonRiderWidgets`), D-2 Phase 1→2→3 순차 전부, D-3/D-4 권고안, D-5 최소 iOS 16.2, D-6 (b) Android 거래 카운트다운 알림 포함.
> **참조 화면**: Grab "11:46 PM에 도착할 예정입니다" 잠금화면 카드.

---

## 1. 목적

거래·경로안내처럼 **몇 분~몇십 분 이어지는 진행 상태**를 앱을 열지 않고 잠금화면/다이나믹아일랜드에서 확인하게 한다. iOS Live Activity(ActivityKit) + Android ongoing 알림, 단일 인터페이스(`native.liveActivity`) 뒤에서 플랫폼 분기.

## 2. 아키텍처

```
RideNav.tsx / DmDetail.tsx  ──▶  native.liveActivity.{start,update,end}   (frontend/src/lib/native.ts)
                                      │  raw: frontend/src/lib/plugins/liveActivity.ts  (registerPlugin 'LiveActivity')
            ┌─────────────────────────┴──────────────────────────┐
  iOS  Shared/Plugins/LiveActivityPlugin.swift            Android  LiveActivityPlugin.java (ongoing 알림, FGS 없음)
       Activity<RideActivityAttributes|DealActivityAttributes>
       콘텐츠 계약: Shared/LiveActivityAttributes.swift  ← 앱·위젯 두 타겟에 컴파일
       UI: SaigonRiderWidgets/{Ride,Deal}LiveActivity.swift (WidgetBundle 등록)
```

원칙: **문구는 전부 JS(i18n)가 만들어 넘긴다** — 네이티브/위젯은 숫자·아이콘·레이아웃만. 콘텐츠 필드를 바꾸면 TS 타입 · Swift Attributes · Java 세 곳을 함께 고친다.

### 두 케이스의 차이
| | 경로안내(ride) | 거래(deal) |
|---|---|---|
| 데이터 원천 | 앱 자체(GPS 틱) | 서버(상대 행동) |
| 갱신 | 로컬 `update` — 표시값(ETA 시각·진행률 5%·상태) 변화 시, 최소 5초 간격 | Phase 2: 로컬(앱 포그라운드) + 카운트다운은 위젯이 자체 진행 / Phase 3: APNs 원격 갱신 |
| 시작/종료 | 안내 시작 → 도착(도착 모습 2분 유지) 또는 중단/이탈 시 즉시 | `ACCEPTED` & T-30분 → `COMPLETED`/`CANCELLED` 즉시, T+60분 자동 소멸 |
| 낡음 처리 | iOS staleDate 10분 / Android timeoutAfter 10분 | Android timeoutAfter 약속+60분 |

## 3. Phase 별 범위·완료 기준

### Phase 1 — 경로안내 + 기반 (✅ 구현 완료 2026-08-29, 실기기 미검증)
- 위젯 익스텐션 타겟 `SaigonRiderWidgetsExtension`(번들 `com.user.SaigonRiders.SaigonRiderWidgets`, 배포 16.2 — Xcode 기본 26.0 에서 하향. 26.0 이면 iOS 26 미만 기기에서 익스텐션 자체가 로드되지 않아 기능이 조용히 죽는다).
- iOS 플러그인·Attributes·위젯 UI 2종(ride/deal), Android 플러그인, TS 채널, RideNav 배선, LinkRouter `ride` 딥링크.
- **완료 기준**: ① iOS 16.2+ 실기기에서 경로안내 시작 → 잠금화면 카드, ETA 갱신, 도착 시 "도착" 후 2분 내 소멸, 탭 → 경로안내 화면 복귀 ② Android: ongoing 알림 표시·갱신·도착 후 자동 제거 ③ 웹 무변화 ④ `tsc`·ESLint·Xcode 빌드 통과.

### Phase 2 — 거래 로컬 LA (✅ 구현 완료 2026-08-29, 실기기 미검증)
- `DmDetail.tsx` 약속 카드: `ACCEPTED` & 약속 T-30분~T+60분 창 → `start({kind:'deal'})`; 상태 변경(완료 요청/완료/취소) → `update`/`end`. `App.tsx` 포그라운드 복귀 시 활성 약속 재조회로 고아 Activity 정리.
- 내용: 상대 닉네임 · 매물 제목 · 약속까지 카운트다운(위젯 자체 진행) · 장소 · 상태 칩.
- 완료 기준: 창 진입 시 카드, 카운트다운 흐름, 완료/취소 시 소멸, 탭 → 해당 대화방.

### Phase 3 — 거래 원격 갱신 (착수 예정, 위치공유 선행)
- iOS: Activity `pushTokenUpdates` → BFF `POST /live-activities/token`(약속별). engine `apns_push.py` 신설 — HTTP/2 + `.p8`(RN99TMWZ59) JWT, `apns-push-type: liveactivity`, `aps.event/content-state/timestamp`. **FCM 경유 불가**(Activity 푸시토큰은 FCM 토큰이 아니다).
- 트리거: `market.py` 수락/완료/취소 · 위치공유 갱신 → outbox 이벤트 → noti_worker 핸들러 → engine APNs.
- 상대 거리/ETA 문구는 [`260827_deal_location_sharing_task.md`](260827_deal_location_sharing_task.md) 구현 이후.
- `.env`/`.env.example` 동기: `APNS_KEY_ID`, `APNS_TEAM_ID`, `APNS_KEY_PATH`.

## 4. 배선 체크리스트 (구현만 하고 연결 안 되는 사고 방지 — 하나라도 빠지면 카드가 안 뜬다)

| # | 지점 | 상태 |
|---|---|---|
| 1 | `native/ios/App/capacitor.config.json` `packageClassList` 에 `LiveActivityPlugin` | ✅ |
| 2 | `Shared/LiveActivityAttributes.swift` 가 **앱·위젯 두 타겟** Sources 에 등록(pbxproj) | ✅ |
| 3 | `Shared/Plugins/LiveActivityPlugin.swift` 앱 타겟 Sources 등록 | ✅ |
| 4 | `SaigonRiderWidgets/SaigonRiderWidgetsBundle.swift` 에 `RideLiveActivity`·`DealLiveActivity` 등록 | ✅ |
| 5 | 앱 Info.plist `NSSupportsLiveActivities` + `NSSupportsLiveActivitiesFrequentUpdates` | ✅ |
| 6 | 위젯 타겟 배포 16.2 | ✅ |
| 7 | `frontend/src/lib/native.ts` `readonly liveActivity` 채널 + `plugins/index.ts` export | ✅ |
| 8 | `RideNav.tsx` start/update/end 3지점(GPS 이펙트 · 도착/중단 이펙트 · unmount) | ✅ |
| 9 | `LinkRouter.tsx` `ride` case(파라미터 복원) | ✅ |
| 10 | Android `MainActivity.registerPlugin(LiveActivityPlugin.class)` | ✅ |
| 11 | Phase 2: `DmDetail.tsx` 약속 카드 start/end(창 진입 1분 재평가) — `App.tsx` 복귀 동기화는 "내 활성 약속" API 부재로 보류(Phase 3 원격 갱신이 대체) | ✅ |
| 12 | Phase 3: 푸시토큰 등록 API · engine APNs 클라이언트 · outbox 핸들러 · env 키 | ⬜ |

## 5. 확정 결정

| ID | 결정 |
|---|---|
| D-1 | (a) Xcode GUI 타겟 생성 — `SaigonRiderWidgets` (완료) |
| D-2 | Phase 1→2→3 순차 전부 진행 |
| D-3 | 거래 LA: `ACCEPTED`+T-30분 시작, 완료/취소 즉시 종료, T+60분 자동 소멸. 내용 상대·매물·카운트다운·장소·상태 칩(Phase 3 상대 거리) |
| D-4 | 경로안내 LA: ETA 시각·목적지·잔여 거리·진행바. **다음 안내 문구는 제외** — RideNav 가 현재 스텝 위치를 추적하지 않아 오표시 위험. 갱신은 표시값 변화 시·최소 5초 간격 |
| D-5 | 익스텐션 최소 iOS 16.2(앱 15.2 유지) |
| D-6 | (b) Android 거래 카운트다운 알림 포함 |

## 6. 비스코프
- 위젯 표면 안 인터랙션(버튼) — Phase 1~3 모두 탭→앱 복귀만.
- Android 16 Live Updates(promoted ongoing) — 후속.
- 워키토키 Live Activity(`WalkieTalkiePlugin.swift` 내 Attributes) 위젯 등록 — Attributes 를 `Shared/` 공유 파일로 분리하는 별건.
