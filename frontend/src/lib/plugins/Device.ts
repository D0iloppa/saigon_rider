import { registerPlugin } from '@capacitor/core';

export interface DevicePlugin {
  /**
   * iOS: Keychain 영구 UUID (DeviceIDManager).
   * Android: Settings.Secure.ANDROID_ID.
   * 기존 device_uuid base 호환을 위해 @capacitor/device 의 Device.getId() 는 사용하지 않는다.
   */
  getDeviceUUID(): Promise<{ uuid: string }>;

  /** Android only: FirebaseMessaging.getInstance().getToken() */
  getFcmToken(): Promise<{ token: string }>;
}

export const Device = registerPlugin<DevicePlugin>('Device');
