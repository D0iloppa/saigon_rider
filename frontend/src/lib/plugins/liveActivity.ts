import { registerPlugin } from '@capacitor/core';

/**
 * `LiveActivity` 커스텀 Capacitor 플러그인 — iOS 잠금화면/다이나믹아일랜드 Live Activity,
 * Android 는 같은 인터페이스 뒤에서 ongoing 알림으로 대응한다.
 *
 * 콘텐츠 계약은 네이티브 `native/ios/Shared/LiveActivityAttributes.swift` 와 1:1 이다 —
 * 필드를 바꾸면 그 파일(앱·위젯 두 타겟)과 Android `LiveActivityPlugin.java` 를 함께 고친다.
 * 표시 문구는 전부 여기(JS, i18n)서 로컬라이즈해 넘긴다 — 네이티브는 문장을 만들지 않는다.
 *
 * 화면 코드는 이 raw 플러그인이 아니라 `native.liveActivity`(lib/native.ts)만 호출한다.
 */
export type LiveActivityKind = 'ride' | 'deal';

export interface RideActivityAttributes {
  destinationName: string;
  /** 탭 시 복귀 딥링크(navigateTo 규약) — 예: `ride&lat=..&lng=..&name=..`. */
  deepLink: string;
}
export interface RideActivityState {
  /** 도착 예정 시각 "23:46" (ICT). */
  etaClock: string;
  /** "도착 예정 · 12분". */
  etaLabel: string;
  /** "남은 거리 약 2.3 km" — 없으면 "". */
  remainingText: string;
  /** 0..1 */
  progress: number;
  /** 보조 상태 — "" | 경로 이탈 | 도착. */
  statusText: string;
  arrived: boolean;
}

export type DealStatusKind = 'accepted' | 'completionRequested' | 'completed' | 'cancelled';
export interface DealActivityAttributes {
  conversationId: string;
  listingTitle: string;
  peerName: string;
  /** `dm&id=<conversationId>` */
  deepLink: string;
}
export interface DealActivityState {
  statusText: string;
  statusKind: DealStatusKind;
  placeName: string;
  /** 약속 시각 epoch ms — 위젯이 카운트다운을 스스로 흘린다. */
  appointmentAtMs: number;
  /** Phase 3(위치공유) 상대 거리 문구. 없으면 "". */
  peerDistanceText: string;
}

export type LiveActivityStartOptions =
  | { kind: 'ride'; attributes: RideActivityAttributes; state: RideActivityState }
  | { kind: 'deal'; attributes: DealActivityAttributes; state: DealActivityState };
export type LiveActivityUpdateOptions =
  | { kind: 'ride'; state: RideActivityState }
  | { kind: 'deal'; state: DealActivityState };
export type LiveActivityEndOptions =
  | { kind: 'ride'; finalState?: RideActivityState; dismissAfterSec?: number }
  | { kind: 'deal'; finalState?: DealActivityState; dismissAfterSec?: number };

export interface LiveActivityPlugin {
  /** iOS: ActivityKit 사용 가능(설정에서 끄지 않음) / Android: 알림 권한 보유. */
  getCapability(): Promise<{ available: boolean }>;
  /** kind 당 하나 — 이미 떠 있으면 갱신(upsert). */
  start(opts: LiveActivityStartOptions): Promise<void>;
  update(opts: LiveActivityUpdateOptions): Promise<void>;
  /** finalState 가 있으면 마지막 모습으로 두고 dismissAfterSec 뒤 사라진다(도착/완료 연출). 없으면 즉시 제거. */
  end(opts: LiveActivityEndOptions): Promise<void>;
}

export const LiveActivity = registerPlugin<LiveActivityPlugin>('LiveActivity');
