import { registerPlugin } from '@capacitor/core';

export interface KeyboardBridgePlugin {
  /** iOS 키보드 input accessory bar(^ v Done) 표시 여부. iOS 전용. */
  setAccessoryBarVisible(options: { visible: boolean }): Promise<void>;
  /** 네이티브 컨테이너/웹뷰 배경색("#RRGGBB"). 키보드 리사이즈 시 노출되는 영역 색. iOS 전용. */
  setBackgroundColor(options: { color: string }): Promise<void>;
}

export const KeyboardBridge = registerPlugin<KeyboardBridgePlugin>('KeyboardBridge');
