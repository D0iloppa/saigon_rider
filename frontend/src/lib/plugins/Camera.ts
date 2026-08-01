import { registerPlugin, type PluginListenerHandle } from '@capacitor/core';

export interface CameraPermissionEvent {
  granted: boolean;
}

export interface CameraPlugin {
  /**
   * 카메라 권한 요청. 결과는 'cameraPermission' 이벤트로 통지.
   * iOS: AVCaptureDevice.requestAccess.
   * Android: ActivityCompat.requestPermissions(CAMERA).
   */
  requestPermission(): Promise<void>;

  /** 권한이 거부된 상태에서 설정 앱으로 이동 유도 (iOS 전용). */
  requestPermissionAlert(): Promise<void>;

  addListener(
    eventName: 'cameraPermission',
    listenerFunc: (event: CameraPermissionEvent) => void,
  ): Promise<PluginListenerHandle>;
}

export const Camera = registerPlugin<CameraPlugin>('Camera');
