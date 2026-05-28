# Capacitor 마이그레이션 — Native 빌드 가이드

> 2026-05-27 단일 PR 컷오버. raw `WKScriptMessageHandler` / `@JavascriptInterface` → Capacitor Plugin.
> WSL 에서는 JS-side (`npm run build`) 만 검증. iOS/Android 실 빌드는 Mac / Android Studio 에서 진행.

---

## 0. 사전 — `frontend/` 의존성 설치

```bash
cd frontend
npm install
npm run build          # webDir = frontend/dist 갱신
npx cap sync           # capacitor.config.ts 의 ios.path / android.path 로 자산 동기화
```

`@capacitor/cli` 가 Node ≥22 를 권장하지만 Node 20.x 에서도 동작 (warn 만 발생).

---

## 1. iOS — Xcode 측 작업

### 1.1 의존성 (CocoaPods)

```bash
cd native/ios
pod install
# 이후 SaigonRider.xcworkspace 를 Xcode 에서 연다 (xcodeproj 가 아님!)
```

`Podfile` 의 핵심:
- `Capacitor`, `CapacitorCordova`, `CapacitorGeolocation` 는 `frontend/node_modules/@capacitor/*` 의 podspec 을 가리킴
- Firebase, GoogleMobileAds 는 그대로 유지

### 1.2 프로젝트 구조 변경 사항

| 경로 | 처리 |
|------|------|
| `Shared/SaigonRiderApp.swift` | **수정됨** — `CAPBridgeViewController` 호스트로 변경 |
| `Shared/WebViewController.swift` | **삭제됨** |
| `Shared/WebView.swift` | **삭제됨** |
| `Shared/ContentView.swift` | **삭제됨** |
| `Shared/Plugins/*.swift` | **신규** — Capacitor Plugin (Device/Gps/IAP/Ad/Camera/ImageViewer/Fcm) |
| `Shared/DeviceIDManager.swift` | 유지 (Plugin 이 사용) |
| `Shared/BackgroundService.swift` | 유지 |
| `Shared/LocationTracker.swift` | 유지 |
| `Shared/AppConfig.swift` | 유지 |
| `Shared/ImageViewer*.swift`, `Secure*.swift` | 유지 |
| `Shared/AppDelegate.swift` | 유지 (FCM/푸시 NotificationCenter 발행은 그대로) |
| `App/capacitor.config.json` | **신규** — Capacitor 가 읽는 정적 설정 (sync 시 갱신 가능) |
| `Podfile` | **신규** |

### 1.3 Xcode target 추가 작업

Capacitor 가 SaigonRider target 으로 Plugin 을 인식하려면 **새 .swift 파일들이 build target 에 포함**돼야 한다:

1. Xcode 에서 `SaigonRider.xcworkspace` 열기
2. `Shared/Plugins` 폴더를 프로젝트 네비게이터로 드래그 → Target Membership 에 `SaigonRider` 체크
3. `Shared/SaigonRiderApp.swift` 가 이미 target 에 있음을 확인 (수정됨)
4. `App/capacitor.config.json` 을 SaigonRider target 의 **Copy Bundle Resources** 에 추가
5. Info.plist 에 `NSAppTransportSecurity` 등 기존 키 유지 (변경 불필요)

### 1.4 빌드 검증 시나리오

- 앱 부팅 → `https://saigon.doil.me` 로드 → 자동 로그인
- Safari Web Inspector 로 `[device-uuid] received from native: <uuid>` 로그 확인
- `device_user_map` upsert 가 DB 에 반영되는지
- DB 에서 `device_uuid` 변조 후 재시작 → 자가 치유 (UUID 가 Keychain 영구 값과 동일)
- GPS 송신: `LocationTracker.shared` 가 3 초 주기로 `BackgroundService.shared.send(.gps, ...)`
- 광고/IAP/카메라 권한 — 각 진입 화면에서 동작 확인

---

## 2. Android — Android Studio 측 작업

### 2.1 의존성

```bash
cd native/android
./gradlew :app:assembleDebug
```

`settings.gradle` 이 `frontend/node_modules/@capacitor/{android,geolocation}` 를 모듈로 include — 별도 install 불필요.

### 2.2 변경 사항

| 경로 | 처리 |
|------|------|
| `app/build.gradle` | **수정** — `implementation project(':capacitor-android')`, google-services plugin 추가 |
| `build.gradle` | **수정** — `com.google.gms:google-services` classpath 추가 |
| `settings.gradle` | **수정** — Capacitor 모듈 include |
| `app/src/main/java/.../MainActivity.java` | **수정** — `extends BridgeActivity` + `registerPlugin(...)` |
| `app/src/main/java/.../DevicePlugin.java` | **신규** |
| `app/src/main/java/.../GpsPlugin.java` | **신규** |
| `app/src/main/java/.../CameraPlugin.java` | **신규** |
| `app/src/main/java/.../LocationForegroundService.java` | 유지 (GpsPlugin 이 ACTION_START/STOP 으로 호출) |
| `app/src/main/java/.../BackgroundService.java` | 유지 |
| `app/src/main/java/.../AppConfig.java` | 유지 |
| `AndroidManifest.xml` | **권한 유지** — Capacitor 가 추가 권한 요구 없음 |

### 2.3 검증

- `./gradlew :app:assembleDebug` 성공
- 앱 부팅 → 자동 로그인 → `device_user_map` upsert 확인
- DB UUID 변조 후 재시작 → 자가 치유 (ANDROID_ID 가 안정적)
- GPS Foreground Service notification 표시 + 3 초 주기 송신
- 카메라 권한 다이얼로그 동작

---

## 3. 회귀 체크리스트 (양 플랫폼 공통)

- [ ] iOS 자동 로그인 → device_uuid 가 DB 의 기존 행과 매칭
- [ ] Android 자동 로그인 → 동일
- [ ] iOS DB device_uuid 변조 후 재기동 → 자가 치유 (Keychain 영구 값으로 복구)
- [ ] Android DB device_uuid 변조 후 재기동 → 자가 치유 (ANDROID_ID 안정)
- [ ] GPS 송신 동작 — admin 메시지 스트림에서 `(phone) device-xxxx` 표시
- [ ] iOS 광고 / IAP / 카메라 권한 / 이미지 뷰어
- [ ] Android 카메라 권한

회귀 발견 시 별도 commit 으로 수정 (단, Capacitor 양립 상태로 되돌리지 않음).

---

## 4. 롤백 시나리오 (긴급)

이 PR 이전 commit 으로 `git revert` — 완전한 단일 PR 컷오버이므로 부분 롤백 불가. raw 브리지 파일들은 동일 PR 안에서 삭제됨.
