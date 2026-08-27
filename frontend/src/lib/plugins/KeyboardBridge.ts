import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface KeyboardWillShowEvent {
  /** 키보드가 웹뷰를 덮는 높이(px). */
  height: number;
  /** 키보드 애니메이션 duration(ms). */
  duration: number;
}

export interface KeyboardWillHideEvent {
  /** 키보드 애니메이션 duration(ms). */
  duration: number;
}

export interface KeyboardBridgePlugin {
  /** iOS 키보드 input accessory bar(^ v Done) 표시 여부. iOS 전용. */
  setAccessoryBarVisible(options: { visible: boolean }): Promise<void>;
  /** 네이티브 컨테이너/웹뷰 배경색("#RRGGBB"). 키보드 리사이즈 시 노출되는 영역 색. iOS 전용. */
  setBackgroundColor(options: { color: string }): Promise<void>;

  /**
   * 네이티브(iOS/Android) 키보드 오버레이 이벤트. 네이티브는 웹뷰를 리사이즈하지 않고
   * 키보드를 순수 오버레이로만 띄우며, 이 이벤트로 높이를 알린다. 키보드 전환 등으로
   * 높이가 바뀌면 새 height 로 keyboardWillShow 가 재발행된다.
   */
  addListener(
    eventName: 'keyboardWillShow',
    listenerFunc: (event: KeyboardWillShowEvent) => void,
  ): Promise<PluginListenerHandle>;
  addListener(
    eventName: 'keyboardWillHide',
    listenerFunc: (event: KeyboardWillHideEvent) => void,
  ): Promise<PluginListenerHandle>;
}

export const KeyboardBridge = registerPlugin<KeyboardBridgePlugin>('KeyboardBridge');
