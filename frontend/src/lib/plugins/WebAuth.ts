import { registerPlugin } from '@capacitor/core';

export interface WebAuthPlugin {
  /**
   * ASWebAuthenticationSession으로 인증 URL을 열고 커스텀 스킴 콜백 URL을 직접 반환한다.
   *
   * SFSafariViewController(@capacitor/browser)은 서버가 302로 커스텀 스킴(com.saigonrider.user://)으로
   * 리다이렉트해도 앱으로 전달하지 못해(appUrlOpen 미발화) 빈 화면으로 멈춘다. ASWebAuthenticationSession은
   * callbackURLScheme 콜백을 직접 캡처하므로 appUrlOpen 없이 콜백 URL을 받는다.
   *
   * @param options.url            인증 시작 URL (BFF .../oauth/{provider}/start)
   * @param options.callbackScheme 콜백 커스텀 스킴 (예: 'com.saigonrider.user')
   * @returns 최종 콜백 URL 전체 문자열 (com.saigonrider.user://oauth/callback?userId=...)
   */
  authenticate(options: { url: string; callbackScheme: string }): Promise<{ callbackUrl: string }>;
}

export const WebAuth = registerPlugin<WebAuthPlugin>('WebAuth');
