# 워키토키(토글 음성메시지) 기능 설계 — 2026-08-27

> **SoT** — 이 문서가 워키토키 기능의 단일 출처다. 구현 스레드는 이 문서만 읽고 착수할 수 있어야 한다.
> **상태**: 설계 확정 / **Phase A 구현 완료 · Phase B 대부분 구현**(2026-08-28 기준 — 이 문서의 §7 "현재 코드베이스 실태"는 설계 시점 스냅샷이라 stale). 운영 규칙은 [`context/service-rules.md`](../../context/service-rules.md) §워키토키 가 SoT.
> **확정 경위**: 대표 인터뷰 + 감독 세션(2026-08-27)에서 형태·범위·Phase 분리·아키텍처 원칙 확정. **재질문 금지 — 아래 §2 는 결정사항이다.**
> **선행 의존**: 그룹채널 스키마는 [`260827_community_enhancement_task.md`](260827_community_enhancement_task.md) 가 소유한다. 이 문서는 그 위에 얹는 의존관계만 명시하며 **DM 스키마를 재설계하지 않는다.**
> **법률 리서치**: [`ai-docs/research/260827_walkie_talkie_location_privacy/SYNTHESIS.md`](../../research/260827_walkie_talkie_location_privacy/SYNTHESIS.md) (§8)
> **착수 방법**: `/doil-supervise` — Phase 별 서브에이전트 라우팅.

---

## 1. 목적 / 배경

DM 에서 텍스트 입력 없이 **한 번의 탭으로 말하고, 한 번 더 탭해 즉시 보내는** 음성 커뮤니케이션 수단을 제공한다. 베트남 이용자층의 타이핑 부담(성조 입력·주행 중 상황)을 낮추고, 거래·모임 대화의 응답 지연을 줄이는 것이 목표다. 진짜 실시간 PTT(무전) 가 아니라 **토글 녹음 → 음성메시지 전송**이므로 WebRTC/SFU 같은 실시간 미디어 인프라가 필요 없고, 기존 채팅 + 미디어 업로드 인프라의 확장으로 처리한다. 1단계는 앱 내 플로팅 버튼, 2단계는 앱을 켜지 않아도 쓰는 OS 레벨 진입점(Android 완전 / iOS 축소)이다.

---

## 2. 확정 요구사항 (재논의 대상 아님)

1. **형태 = 토글**. 버튼 탭 → 녹음 시작, 다시 탭 → 즉시 전송. 누르고 있는 동안 스트리밍하는 hold-to-talk 실시간 PTT 아님.
2. **대상 = DM 전반의 범용 기능**. 특정 거래·특정 화면 전용이 아니다. 채널은 **1:1 DM + 그룹채널 둘 다**.
3. **인프라 = 기존 것 확장**. WebRTC/SFU 도입 금지. 파일 업로드 + 기존 메시지 파이프라인 재사용.
4. **Phase A** — 앱 내 플로팅(이동 가능·닫기 가능한 PIP 스타일) 토글 녹음 버튼. 웹뷰 레벨 구현이라 iOS/Android 동일 지원.
5. **Phase B** — OS 레벨 위젯/백그라운드. Android 는 홈스크린 위젯 또는 SYSTEM_ALERT_WINDOW 오버레이 버블(챗헤드)로 완전 구현. **iOS 는 Apple 정책상 시스템 전역 오버레이 버블 자체가 불가** — iOS 17+ 인터랙티브 위젯(단순 탭), Live Activity(잠금화면/다이나믹아일랜드 상태표시), Control Center 위젯 수준으로 축소.
6. **Phase C** — 진짜 실시간 스트리밍 PTT(WebRTC/SFU). **이번 범위 아님**, 로드맵 언급만.
7. **아키텍처 = capability 기반 공통 인터페이스**. 기존 `native.ts`(NativeInterface) 패턴을 그대로 따라 `WalkieTalkieChannel` 하나를 정의하고, `getCapability()` 로 런타임에 플랫폼 지원 범위를 조회해 UI 가 기능을 켜고 끈다. 코어 앱 로직은 **인터페이스만 보고** 짠다 — 플랫폼 분기를 화면 코드에 심지 않는다.

---

## 3. Phase 범위와 완료 기준

### Phase A — 인앱 플로팅 토글 녹음 (필수, 1단계)

**범위**
- 마이크 권한 요청 + 녹음/중지/취소 네이티브 플러그인 (Android/iOS).
- 플로팅 버블 UI (웹뷰 내 DOM): 드래그 이동, 화면 가장자리 스냅, 닫기 버튼, 녹음 중 상태(경과 시간·레벨 인디케이터).
- 녹음 결과 오디오 업로드 → `message_type="voice"` 메시지 전송.
- DM 타임라인의 음성메시지 카드: 재생/일시정지, 길이 표시, 재생 진행바.
- 대상 채널 선택(현재 열려 있는 DM 이 기본, 플로팅이 떠 있으면 최근 채널 고정).

**완료 기준 (verifiable)**
1. Android/iOS 실기기에서 탭→녹음→탭→전송이 3초 내 완료되고 상대 단말 타임라인에 재생 가능한 음성메시지가 뜬다.
2. 권한 거부 상태에서 크래시 없이 권한 안내 UI 가 뜨고, 설정 앱으로 유도된다.
3. 녹음 중 앱 백그라운드 전환 시 정책대로 동작한다(중단 또는 유지 — §9 미해결 D-3).
4. 최대 녹음 길이(기본 60초) 초과 시 자동 전송 또는 자동 중지된다.
5. 웹(브라우저)에서는 플로팅 버튼이 **표시되지 않는다**(capability=false) — 회귀 없음.
6. `npm run lint` / `tsc -b` 0, `ruff` 0.

### Phase B — OS 레벨 진입점 (Android 완전 / iOS 축소)

**범위**
- Android: 포그라운드 서비스(마이크) + SYSTEM_ALERT_WINDOW 오버레이 버블 **또는** 홈스크린 위젯(둘 중 택1은 §9 D-1). 앱 미실행 상태에서 탭→녹음→탭→전송.
- iOS: 인터랙티브 위젯(탭 시 앱 열기/짧은 액션), Live Activity 로 녹음·전송 상태 표시. **전역 오버레이 미제공**.
- 수신 알림에서 바로 재생(알림 액션).

**완료 기준 (verifiable)**
1. Android: 앱을 스와이프로 종료한 상태에서 오버레이/위젯 탭만으로 음성메시지가 전송된다.
2. Android: 포그라운드 서비스 알림이 정책에 맞게 상시 표시되고, 배터리 최적화 예외 안내가 동작한다.
3. iOS: `getCapability()` 가 `overlayBubble:false`/`homeWidget:true`/`liveActivity:true` 를 반환하고, UI 가 미지원 기능을 **노출조차 하지 않는다**.
4. 두 플랫폼 모두 코어 앱 코드에 `if (platform === 'ios')` 분기가 **추가되지 않는다**(capability 조회로만 분기) — 코드리뷰 게이트.

### Phase C — 실시간 스트리밍 PTT (로드맵)

WebRTC/SFU 기반 진짜 실시간 무전. **이번 설계 범위 밖**이며, Phase A/B 실사용 지표(음성메시지 사용률·평균 길이) 확인 후 착수 여부를 재판단한다.

---

## 4. 아키텍처 — capability 기반 공통 인터페이스

### 4-1. 원칙

- `frontend/src/lib/native.ts` 의 NativeInterface 패턴을 그대로 따른다. 화면 코드는 `native.walkieTalkie.*` 만 호출하고, 플랫폼별 구현은 어댑터가 갖는다.
- 미지원 기능은 **throw 하지 않고** capability 로 사전 차단한다. 웹 환경은 전부 no-op + `available:false`.
- 커스텀 플러그인은 repo 에 이미 확립된 **3-레이어 패턴**(Android Java Plugin + iOS Swift Plugin + TS `registerPlugin` 래퍼)으로 신규 파일 세트를 추가한다(§7 참조).

### 4-2. 인터페이스 시그니처 초안

```ts
// frontend/src/lib/plugins/walkieTalkie.ts (registerPlugin 래퍼)
// frontend/src/lib/native.ts 에서 native.walkieTalkie 로 조합 노출

export type WalkieTalkieCapability = {
  available: boolean;        // 이 플랫폼에서 워키토키 사용 가능 여부 (웹=false)
  record: boolean;           // 인앱 녹음 (Phase A)
  floatingButton: boolean;   // 웹뷰 내 플로팅 버블 (Phase A, 웹뷰면 항상 true)
  backgroundService: boolean;// 앱 미실행/백그라운드 녹음 (Android only)
  overlayBubble: boolean;    // OS 전역 오버레이 버블 (Android only, iOS 영구 false)
  homeWidget: boolean;       // 홈스크린 위젯
  liveActivity: boolean;     // iOS Live Activity / 다이나믹아일랜드 (iOS only)
  maxDurationSec: number;    // 플랫폼별 최대 녹음 길이
};

export type RecordingResult = {
  filePath: string;          // 네이티브 로컬 경로
  mimeType: string;          // 'audio/m4a' | 'audio/aac' ...
  durationMs: number;
  sizeBytes: number;
};

export interface WalkieTalkieChannel {
  getCapability(): Promise<WalkieTalkieCapability>;

  // 권한
  checkPermission(): Promise<{ mic: 'granted'|'denied'|'prompt'; overlay?: boolean }>;
  requestPermission(kind: 'mic' | 'overlay' | 'notification'): Promise<boolean>;

  // 토글 녹음 (Phase A 코어)
  startRecording(opts?: { maxDurationSec?: number }): Promise<void>;
  stopRecording(): Promise<RecordingResult>;   // 토글 두 번째 탭
  cancelRecording(): Promise<void>;            // 버리기

  // 상태 이벤트 (레벨미터/경과시간/자동종료)
  addListener(
    event: 'recordingState',
    cb: (s: { state: 'idle'|'recording'|'stopping'; elapsedMs: number; level: number }) => void
  ): Promise<{ remove: () => void }>;

  // Phase B — capability 가 false 면 호출부에서 노출 자체를 안 함
  showOverlayBubble(opts: { channelId: string }): Promise<void>;
  hideOverlayBubble(): Promise<void>;
  startBackgroundChannel(opts: { channelId: string }): Promise<void>;
  stopBackgroundChannel(): Promise<void>;
  updateLiveActivity(opts: { state: 'recording'|'sending'|'idle' }): Promise<void>;
}
```

### 4-3. capability 매트릭스

| capability | Android | iOS | Web(브라우저) | 비고 |
|---|---|---|---|---|
| `available` | ✅ | ✅ | ❌ | 웹은 전부 no-op |
| `record` | ✅ | ✅ | ❌ | Phase A |
| `floatingButton` | ✅ | ✅ | ❌ | 웹뷰 내 DOM — 플랫폼 무관 |
| `backgroundService` | ✅ (FGS + `FOREGROUND_SERVICE_MICROPHONE`) | ⚠️ 제한 (백그라운드 오디오 세션, 정책 심사 리스크) | ❌ | §9 D-2 |
| `overlayBubble` | ✅ (`SYSTEM_ALERT_WINDOW`) | ❌ **플랫폼 불가** | ❌ | Apple 정책상 전역 오버레이 없음 |
| `homeWidget` | ✅ (AppWidget, 탭→녹음) | ⚠️ iOS 17+ 인터랙티브 위젯 (단순 탭 수준) | ❌ | |
| `liveActivity` | ❌ | ✅ | ❌ | 상태표시 전용, 녹음 트리거 아님 |
| 블루투스 PTT 버튼 | ⚠️ 가능(미디어키) | ⚠️ 제한 | ❌ | Phase B 이후 옵션 |

**비대칭 수용 원칙**: iOS 는 "인앱 완전 지원 + 백그라운드는 Live Activity 상태표시" 수준으로 확정. 두 플랫폼을 억지로 맞추지 않는다(§9 D-4 대표 확인 대상).

---

## 5. 데이터 모델 변경안

### 5-1. 메시지

- `DmMessage.message_type = "voice"` 를 신설한다(기존 자유 문자열 컬럼 재사용 — `appointment`/`price_offer` 선례와 동일).
- **`audio_content_id UUID FK → contents` 컬럼을 신설**한다. 기존 `image_content_id` 를 재사용하지 않는다 — 이름이 이미지 전제라 네이밍 혼동을 낳는다.
- `meta`(JSONB) 에 `{ durationMs, waveform?: number[] }` 저장 — 재생바/파형 렌더용. 파형은 선택(Phase A 에서는 생략 가능).

### 5-2. 콘텐츠(업로드)

- `Content` 모델/테이블 자체는 범용이라 오디오 저장에 **재사용한다**.
- `backend/app/routers/contents.py` 의 `POST /contents/upload` 는 `ALLOWED_MIME_TYPES` 4종(이미지)만 허용하고 `_sniff_mime()` 도 이미지 매직바이트만 검증하므로 **오디오용 분기 또는 신규 엔드포인트가 필요**하다. 응답의 `imgproxy_url` 은 오디오에 무의미 — 오디오는 별도 재생 URL 규약을 정한다(§9 D-5).
- 허용 MIME: `audio/m4a`, `audio/aac`, `audio/mp4`(권장 컨테이너 통일). 사이즈 상한(예: 60초 ≒ 1MB 내외) + 매직바이트 검증 필수.

### 5-3. 그룹채널 의존관계 (중요)

- 현재 `DmConversation` 은 `participant_1`/`participant_2` **고정 컬럼 2개**인 순수 1:1 구조이고, `dm_policy.py` 의 `require_participant`/`require_unblocked` 도 2인 참여자를 가정한다. 그룹채널은 `conversation_participants` 조인 테이블로 가는 **스키마 재설계**가 필요하다.
- **이 재설계는 [`260827_community_enhancement_task.md`](260827_community_enhancement_task.md) 가 소유한다.** 워키토키는 그 결과물 위에 얹기만 한다.
- 따라서 **Phase A 는 1:1 DM 만으로 착수 가능**하고, **그룹채널 대상 워키토키는 커뮤니티 스키마 머지 이후**에 배선한다. 워키토키 스레드에서 참여자 스키마를 임의로 바꾸지 말 것.

---

## 6. 레퍼런스 / 벤치마크

| 서비스 | 플랫폼 | 무엇을 참고하나 | 이 설계와의 관계 |
|---|---|---|---|
| **Voxer** | iOS/Android | 토글 녹음→전송, 수신측은 도착 즉시 재생 가능 | **Phase A 1차 벤치마크** — 확정한 토글 UX 의 원형 |
| **Zello** | iOS/Android | 진짜 실시간 PTT 표준. Android 홈스크린 위젯, 블루투스 PTT 버튼, 백그라운드 채널 상시 유지 | **Phase B 벤치마크**(백그라운드/채널 유지·위젯). 실시간 PTT 자체는 Phase C |
| **Facebook Messenger Chat Heads** | **Android 전용** | 앱 위에 뜨는 movable 버블의 원조 | **Phase B Android 오버레이 버블 벤치마크**. iOS 엔 이 기능이 애초에 없다 — 플랫폼 제약의 근거 사례 |
| **HeyTell** (서비스 종료) | 역사적 참고 | 초기 토글 음성메시지 UX 의 원형 | 기능 최소셋 정의 참고용 |

---

## 7. 현재 코드베이스 실태 (2026-08-27 조사 완료 — 재조사 불필요)

### DM / 채팅
- `backend/app/models.py:1334` `DmConversation` — `participant_1`/`participant_2` 고정 2컬럼(순수 1:1).
- `backend/app/models.py:1350` `DmMessage` — `conversation_id`/`sender_id`/`content`/`message_type`(자유 문자열)/`meta`(JSONB)/`image_content_id`(FK→contents).
- `backend/app/routers/dm.py` (510줄) — DM API. `backend/app/services/dm_policy.py` — `require_participant`/`require_unblocked`, **둘 다 2인 참여자 가정**.
- 프론트: `frontend/src/pages/dm/DmList.tsx`, `frontend/src/pages/dm/DmDetail.tsx`, `frontend/src/store/useDmStore.ts`, `frontend/src/api/dm.ts`, `frontend/src/components/ui/MessageComposer.tsx`.
- → 그룹채널은 조인 테이블 재설계 필요. **커뮤니티 문서 소유(§5-3)**.

### 미디어 업로드
- `backend/app/routers/contents.py` — `POST /contents/upload`. `ALLOWED_MIME_TYPES`(37행)가 `image/jpeg|png|gif|webp` **4종 하드코딩**, `_sniff_mime()` 도 이미지 매직바이트만 검증. 응답 `imgproxy_url` 은 이미지 리사이즈 전용.
- `Content` 테이블 자체는 범용 — 오디오 재사용 가능. **엔드포인트만 신규 분기/신설 필요**.

### native.ts / 네이티브 플러그인
- `frontend/src/lib/native.ts` (764줄) — Device/Gps/IAP/Ad/Camera/ImageViewer/Fcm/WebAuth/KeyboardBridge 등록. **마이크 녹음·백그라운드·오버레이 관련 기능 전무**.
- Android `native/android/app/src/main/AndroidManifest.xml` — `RECORD_AUDIO`/`SYSTEM_ALERT_WINDOW`/`FOREGROUND_SERVICE_MICROPHONE` **없음**(현재 CAMERA/위치/FCM/`FOREGROUND_SERVICE_LOCATION` 만).
- iOS `Info.plist` — `NSMicrophoneUsageDescription` **없음**.
- → 권한·플러그인 전부 신규 구현 대상.

### Capacitor 네이티브 프로젝트 / 플러그인 3-레이어 패턴
- `frontend/capacitor.config.ts` 가 `../native/ios`, `../native/android` 를 가리킨다 → 실제 프로젝트는 `/mnt/c/DEV/saigon_rider/native/{android,ios}`.
- 기존 패턴:
  - Android — `native/android/app/src/main/java/com/saigonrider/user/{Camera,Device,Fcm,Gps,WebAuth}Plugin.java`
  - iOS — `native/ios/Shared/Plugins/{Camera,Device,Fcm,Gps,IAP,ImageViewer,KeyboardBridge,WebAuth}Plugin.swift`
  - TS — `frontend/src/lib/plugins/*.ts` (`registerPlugin`) → `native.ts` 에서 조합 노출
- **워키토키 플러그인도 이 패턴 그대로 신규 3파일 세트(Android + iOS + TS)로 추가한다.**

---

## 8. 리서치 문서 포인터

- **[`ai-docs/research/260827_walkie_talkie_location_privacy/SYNTHESIS.md`](../../research/260827_walkie_talkie_location_privacy/SYNTHESIS.md)** (+ `sources/` 하위 원문 3건: `A_decree13_sensitive_data.md`, `B_recording_correspondence_secrecy.md`, `C_pdpl2025_transition.md`)
- 한 줄 요지: 2026-01-01 부로 PDPL 2025(Law 91/2025/QH15) + Decree 356/2025 가 구 Decree 13/2023 을 대체했고, **위치정보는 명시적 민감정보 / 음성은 불명확(보수적으로 민감정보 준용 권장)**, 위치+음성 "결합" 자체에 대한 가중 의무 조항은 발견되지 않아 **데이터 유형별로 고지·동의·옵트아웃·보관기간만 각각 지키면 된다**.
- **출시 전 필수**: 비실시간 저장 음성메시지에 통신비밀(감청) 법제가 적용되는지가 리서치 신뢰도 최저 항목 — 베트남 현지 변호사 재검증.
- 구현 반영 사항: 최초 녹음 시 **목적 고지 + 명시적 동의** 화면, 설정에서 **옵트아웃**, 음성 파일 **보관기간·삭제** 정책 필요(§9 D-6).

---

## 9. 대표 판단 필요 (미해결)

| ID | 쟁점 | 선택지 | 권고 |
|---|---|---|---|
| D-1 | Phase B Android 진입점 | (a) SYSTEM_ALERT_WINDOW 오버레이 버블 (b) 홈스크린 위젯 (c) 둘 다 | (b) 먼저 — 권한 마찰·스토어 심사 리스크가 낮다 |
| D-2 | **iOS/Android capability 비대칭 수용 여부** | (a) 비대칭 그대로 출시(iOS 는 인앱+Live Activity) (b) 최소공통분모로 하향 통일 (c) Phase B 를 Android 선출시 | (a) 또는 (c) — (b) 는 Android 강점을 버린다 |
| D-3 | 녹음 중 앱 백그라운드 전환(Phase A) | (a) 즉시 중단 후 파기 (b) 중단 후 임시저장 (c) 계속 녹음(FGS 필요) | (b) — Phase A 는 FGS 없이 간다 |
| D-4 | 최대 녹음 길이 / 자동 종료 동작 | 30초 / 60초 / 120초, 초과 시 자동전송 vs 자동중지 | 60초 + 자동중지(사용자가 전송 확정) |
| D-5 | 오디오 재생 URL 규약 | (a) `/contents/{id}/raw` 신설 (b) 기존 이미지 경로에 오디오 분기 | (a) — imgproxy 경로와 분리 |
| D-6 | 음성 파일 보관기간 | 무기한 / 90일 / 대화 삭제 시 즉시 | 정책 확정 후 구현 — 법률 요건(§8)과 연동 |
| D-7 | Phase C(실시간 PTT) 착수 시점 | Phase A/B 지표 확인 후 재판단 / 착수 안 함 | 지표 후 재판단 |

---

## 10. Phase 별 서브티켓 초안 (제목만 — 발행은 감독이 별도로 함)

### Phase A
- A-1 오디오 업로드 경로 신설 (`contents.py` 오디오 MIME/매직바이트 분기 + 재생 URL 규약)
- A-2 `DmMessage` 스키마 확장 (`message_type="voice"` + `audio_content_id` 마이그레이션)
- A-3 음성메시지 전송/조회 API (`dm.py` 임베드 — appointment/price_offer 패턴 미러)
- A-4 워키토키 네이티브 플러그인 3-레이어 (Android Java + iOS Swift + TS 래퍼)
- A-5 마이크 권한 선언 및 권한 플로우 (AndroidManifest / Info.plist / 거부 시 설정 유도)
- A-6 `WalkieTalkieChannel` 인터페이스 + `native.ts` 통합 + `getCapability()` 배선
- A-7 플로팅 토글 버블 UI (드래그·스냅·닫기·녹음 상태 인디케이터)
- A-8 DM 타임라인 음성메시지 카드 (재생/일시정지/진행바/길이)
- A-9 개인정보 고지·동의·옵트아웃 UI + i18n 3로케일(vi/ko/en)
- A-10 실기기 스모크(Android/iOS) + 웹 회귀 확인

### Phase B
- B-1 Android 포그라운드 서비스(마이크) + 백그라운드 채널 유지
- B-2 Android 오버레이 버블 또는 홈스크린 위젯 (D-1 결정 후)
- B-3 iOS 인터랙티브 위젯 + Live Activity 상태표시
- B-4 알림에서 바로 재생(알림 액션)
- B-5 capability 매트릭스 확장 + 미지원 기능 UI 은폐 검증

### Phase C (로드맵)
- C-1 실시간 스트리밍 PTT(WebRTC/SFU) 타당성 검토 — **착수 전 대표 승인 필요**

---

## 11. 비스코프

- 실시간 스트리밍 PTT (Phase C 로 분리).
- 음성 → 텍스트 변환(STT), 자동 번역.
- 그룹채널 스키마 자체 설계 — 커뮤니티 문서 소유.
- 통화(1:1 음성/영상 콜) 기능.
