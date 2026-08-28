import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

/**
 * `WalkieTalkie` 커스텀 Capacitor 플러그인 (A-4/A-5) — 순수 녹음 기능만 담당한다.
 * capability 조회·overlay/Live Activity·플로팅 UI·native.ts 통합은 후속 티켓(A-6/A-7) 범위.
 *
 * 설계서(`ai-docs/task/active/260827_walkie_talkie_task.md` §4-2) 의 `WalkieTalkieChannel` 상위
 * 추상 인터페이스와 메서드 이름은 최대한 맞췄지만, 이 레이어는 registerPlugin 원시 래퍼라 반환값이
 * 네이티브 Capacitor 콜백 관례(객체 반환)를 그대로 따른다 — 예: `requestPermission` 은 상위
 * 인터페이스처럼 `Promise<boolean>` 이 아니라 `Promise<{ granted: boolean }>`. A-6 이 이 래퍼를
 * `WalkieTalkieChannel` 로 감싸며 형태를 맞춘다.
 */

export type WalkieTalkieMicPermissionStatus = 'granted' | 'denied' | 'prompt';

export interface WalkieTalkieRecordingResult {
  /** 네이티브 로컬 파일 경로. */
  filePath: string;
  /** 'audio/m4a' 고정 (A-1 허용 MIME 과 일치). */
  mimeType: string;
  durationMs: number;
  sizeBytes: number;
}

export interface PendingRecording {
  id: string;
  filePath: string;
  mimeType: string;
  durationMs: number;
  sizeBytes: number;
  /** 녹음 시점의 대상 채널(대화방 id). 빈 문자열이면 대상을 알 수 없어 폐기한다. */
  channelId: string;
  createdAt: number;
}

export interface WalkieTalkieRecordingStateEvent {
  state: 'idle' | 'recording' | 'stopping';
  elapsedMs: number;
  /** 0..1 정규화된 레벨미터 값. */
  level: number;
}

export interface WalkieTalkieStartOptions {
  /** 최대 녹음 길이(초). 미지정 시 60초(D-4 확정) — 60 초과 요청은 네이티브에서 60으로 clamp. */
  maxDurationSec?: number;
}

/**
 * 채널 참여 상태 위젯(Android ongoing 알림 / iOS Live Activity) 컨텐츠.
 * **상태 표시 전용** — 위젯 표면 안에서 마이크 캡처/재생을 새로 시작하는 것은 양 플랫폼 모두
 * 금지라(Apple 백그라운드 오디오 세션 / Android 12+ 알림발 FGS 제한) 탭 시 딥링크만 한다.
 * 텍스트는 JS 가 이미 로컬라이즈해 넘긴다 — 네이티브에 i18n 을 두지 않는다.
 */
export interface WalkieChannelStatus {
  /** 대화방 id — 탭 딥링크 대상 (navigateTo "dm&id=<channelId>" 규약 재사용). */
  channelId: string;
  channelName: string;
  /** 참석 인원 (presence.present.length). */
  presentCount: number;
  /** 채널 전체 인원 (presence.members.length). 0 이면 카운트 미표시. */
  totalCount: number;
  /** 로컬라이즈된 "OO님이 말하는 중" 문구. 아무도 말하지 않으면 빈 문자열. */
  speakingText: string;
}

export interface WalkieTalkiePlugin {
  /** 마이크(+Android 오버레이, B-2) 권한 상태 조회. */
  checkPermission(): Promise<{ mic: WalkieTalkieMicPermissionStatus; overlay?: boolean }>;
  /** 권한 요청. 'mic' 은 다이얼로그, 'overlay'(B-2, Android)는 설정화면 유도 — 결과는
   *  비동기(설정화면에서 돌아온 뒤 checkPermission() 재조회 필요)라 granted 는 항상 false 로 온다. */
  requestPermission(opts: { kind: 'mic' | 'overlay' }): Promise<{ granted: boolean }>;
  /** OS 앱 설정 화면 열기 (권한이 denied 로 굳어 재요청이 막힌 경우). */
  openAppSettings(): Promise<void>;

  /** 토글 녹음 시작. Android 는 Foreground Service 로 위임되어 백그라운드에서도 계속된다(D-3). */
  startRecording(opts?: WalkieTalkieStartOptions): Promise<void>;
  /** 토글 녹음 종료 — 결과 파일 반환(토글 두 번째 탭에 대응). */
  stopRecording(): Promise<WalkieTalkieRecordingResult>;
  /** 녹음 취소(버리기) — 파일 삭제, 결과 없음. */
  cancelRecording(): Promise<void>;

  /**
   * B-1(Android) — **앱이 실행 중이 아닐 때** 오버레이 버블·위젯으로 녹음된 결과 큐.
   * 헤드리스 녹음은 파일만 남기고 업로드는 못 하므로, 앱이 뜰 때 이 큐를 비워 전송해야 한다.
   * (iOS 는 헤드리스 녹음 경로가 없어 항상 빈 배열.)
   */
  getPendingRecordings(): Promise<{ items: PendingRecording[] }>;
  /** 업로드를 마친 항목 제거. 지우지 않으면 다음 실행에 또 보낸다. */
  clearPendingRecording(opts: { id: string }): Promise<void>;
  /**
   * 녹음 파일을 base64 로 읽는다 (iOS 전용 — Android 플러그인에는 없다).
   * 원격 https 페이지에서 `capacitor://` 로컬 파일을 fetch 하면 WebKit 이 혼합 콘텐츠로
   * 차단하기 때문에(`Load failed`), iOS 는 이 경로로 바이트를 받는다.
   */
  readRecording(opts: { filePath: string }): Promise<{ dataBase64: string; sizeBytes: number }>;

  /** 경과시간/레벨미터/자동종료 상태 이벤트. 60초 자동중지 시 state:'idle' 로 통지된다. */
  addListener(
    eventName: 'recordingState',
    listenerFunc: (event: WalkieTalkieRecordingStateEvent) => void,
  ): Promise<PluginListenerHandle>;

  /** B-2(Android) — SYSTEM_ALERT_WINDOW 오버레이 버블 표시. 탭하면 헤드리스 토글 녹음(B-1)이 뜬다. */
  showOverlayBubble(opts: { channelId?: string }): Promise<void>;
  /** B-2(Android) — 오버레이 버블 숨김. */
  hideOverlayBubble(): Promise<void>;
  /** Android 홈화면 위젯 고정 요청(requestPinAppWidget). 네이티브 구현은 후속 티켓 범위. */
  pinToHomeScreen(): Promise<void>;
  /** Android 채널 바로가기 위젯이 읽을 활성 채널을 SharedPreferences 에 동기화한다. */
  syncActiveChannel(opts: { channelId: string; channelName: string }): Promise<void>;

  /**
   * 채널 참여 상태 위젯 시작 (Android: FGS ongoing 알림 / iOS: ActivityKit Live Activity).
   * 네이티브는 upsert 로 처리한다 — 이미 떠 있으면 갱신(순서 경합에 안전).
   */
  startChannelStatus(opts: WalkieChannelStatus): Promise<void>;
  /** 채널 참여 상태 위젯 갱신 (참석수/발화상태 변경 시). */
  updateChannelStatus(opts: WalkieChannelStatus): Promise<void>;
  /** 채널 참여 상태 위젯 종료 (채널 퇴장/버블 닫기). */
  endChannelStatus(): Promise<void>;
}

export const WalkieTalkie = registerPlugin<WalkieTalkiePlugin>('WalkieTalkie');
