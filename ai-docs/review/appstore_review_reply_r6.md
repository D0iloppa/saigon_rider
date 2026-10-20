# App Store 심사 회신 — 6차 반려 (2026-10-20, Submission 00dc44bd-1252-48b8-8599-3558ef46eee2)

> 반려 대상: 1.0 (21), iPhone 17 Pro Max. 사유: Guideline 5.1.1(iv) — 위치 권한 프리프롬프트가 허용을 유도("Allow location" 버튼)하고 요청을 미룰 수 있음("Later" 버튼).
> 원인: `frontend/src/store/useLocationStore.ts` `preflightPermission()` 이 확인/취소 2버튼 ConfirmDialog 를 사용 — "나중에"·백드롭·ESC 로 닫으면 시스템 권한창 없이 중심가 폴백.
> 조치: 프리프롬프트를 **"계속(Continue / Tiếp tục)" 버튼 하나**로 변경, 백드롭·ESC 로 닫히지 않음(`useConfirmStore` `dismissible: false`) → 항상 iOS 시스템 권한창으로 이어짐. 거부는 시스템 창에서 하고 기존 거부 폴백(중심가 기준 탐색 + 안내 토스트)으로 간다. 검증 `frontend/e2e/appstore-r6-location-preprompt.spec.ts`(dev 통과 2026-10-20).
> iOS 앱은 `https://app.saigon-rider.com` 원격 로드 → 앱 바이너리 변경 없음, **운영 웹 배포 후 빌드 21 그대로 재제출**.

## Reply message (App Store Connect → Resolution Center)

```
Hello App Review Team,

Thank you for the review. We have fixed the issue under Guideline 5.1.1(iv).

The message shown before the location permission request no longer has the "Allow location" and "Later" buttons. It now has a single "Continue" button, and it cannot be closed in any other way. Tapping "Continue" always shows the iOS location permission request, where the user decides whether to allow or deny access.

If the user denies location access, the app continues to work: listings are shown for central Ho Chi Minh City and a short notice explains that location is not available.

How to check: install the app fresh (or reset location permissions for the app), open it, and the message appears with only the "Continue" button, followed by the iOS permission request.

Please let us know if you need anything else.

Thank you.
```

## 재제출 절차

1. [ ] 운영 프론트 배포 — `saigon-prod-new` `/app/SaigonRider` `git pull` → `docker compose --env-file .env up --build -d frontend`
2. [ ] 운영 확인 — 아이폰에서 앱 삭제 후 재설치(또는 설정 > 일반 > 전송 또는 iPhone 재설정 > 재설정 > 위치 및 개인정보 보호 재설정) → 앱 실행 시 "계속" 버튼 하나만 → 누르면 iOS 권한창
3. [ ] App Store Connect → 앱 → 심사 메시지(Resolution Center)에 위 회신 붙여넣어 답장
4. [ ] 같은 버전 1.0 (21) 그대로 "심사에 추가/재제출"(빌드 교체 불필요)
