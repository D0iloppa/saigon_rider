import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface AdPlugin {
  /** 전면 광고 노출. 종료/실패 시 'adCompleted' 이벤트 발행. iOS 전용. */
  showAd(): Promise<void>;

  addListener(
    eventName: 'adCompleted',
    listenerFunc: () => void,
  ): Promise<PluginListenerHandle>;
}

export const Ad = registerPlugin<AdPlugin>('Ad');
