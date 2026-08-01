import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export type IAPResult = 'success' | 'cancelled' | 'failed';

export interface IAPResultEvent {
  productId: string;
  result: IAPResult;
}

export interface IAPPlugin {
  /**
   * 인앱 결제 시작. command 는 iOS AppConfig.productIDs 의 키
   * (buyItem / buyItem3 / buyItem7 / buyItem15 / buyItem30 / buyItemAd).
   * 결과는 'iapResult' 이벤트로 비동기 통지.
   */
  purchase(options: { command: string }): Promise<void>;

  addListener(
    eventName: 'iapResult',
    listenerFunc: (event: IAPResultEvent) => void,
  ): Promise<PluginListenerHandle>;
}

export const IAP = registerPlugin<IAPPlugin>('IAP');
