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
    captureInput: true,
    webContentsDebuggingEnabled: false,
    backgroundColor: '#000000',
  },
};

export default config;
