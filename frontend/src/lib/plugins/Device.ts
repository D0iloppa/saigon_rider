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

  /**
   * 설치본 앱 버전 (F-19 강제 업데이트 판정용).
   * Android: PackageInfo.versionName. iOS: CFBundleShortVersionString.
   */
  getAppVersion(): Promise<{ version: string }>;
}

export const Device = registerPlugin<DevicePlugin>('Device');
