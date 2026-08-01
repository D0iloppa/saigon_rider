import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.saigonrider.user',
  appName: 'Saigon Rider',
  webDir: 'dist',
  bundledWebRuntime: false,
  server: {
    url: 'https://saigon.doil.me',
    cleartext: false,
    androidScheme: 'https',
    iosScheme: 'https',
  },
  ios: {
    path: '../native/ios',
    contentInset: 'never',
    scrollEnabled: true,
    limitsNavigationsToAppBoundDomains: false,
    backgroundColor: '#000000',
  },
  android: {
    path: '../native/android',
    allowMixedContent: true,
    // captureInput=true 는 한글 IME 조합을 깬다(CapacitorWebView 가 조합 미지원 InputConnection 반환). F-03-IME.
    captureInput: false,
    webContentsDebuggingEnabled: false,
    backgroundColor: '#000000',
  },
};

export default config;
