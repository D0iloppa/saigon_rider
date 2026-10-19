# App Store 심사 회신 — 5차 반려 (2026-10-18, Submission 00dc44bd-1252-48b8-8599-3558ef46eee2)

> 반려 대상: 1.0 (21), iPhone 17 Pro Max. 사유: Guideline 4 Design — 차단 기능 문구가 앱 언어와 다름.
> 원인: 코드에서 쓰는 i18n 키 27개가 ko/en/vi 로케일 파일 전부에 없어, 코드의 한국어 `defaultValue` 가 영어·베트남어 화면에 그대로 노출. 차단 메뉴("이 사용자 차단")·차단 확인창·해제 확인창("차단을 해제하시겠습니까?") 등.
> 조치: 커밋 `1742ed2f`(누락 키 27개 ko/en/vi 추가), 검증 `frontend/e2e/appstore-r5-block-i18n.spec.ts`(영어 환경 차단→해제 흐름 한글 0, dev 통과 2026-10-19).
> iOS 앱은 `https://app.saigon-rider.com` 원격 로드 → 앱 바이너리 변경 없음, **운영 웹 배포 후 빌드 21 그대로 재제출**.

## Reply message (App Store Connect → Resolution Center)

```
Hello App Review Team,

Thank you for the review. We have fixed the issue under Guideline 4.

Some text in the blocking feature (the "Block this user" menu item, the block confirmation dialog and the unblock confirmation dialog) was displayed in Korean even when the app language was English or Vietnamese. We have translated all of this text. We also checked the entire app for other untranslated text and fixed every instance we found, including the chat message actions and the live location buttons.

The blocking feature is now fully displayed in the app's language (English, Vietnamese or Korean).

How to check: sign in with the demo account, open any user's profile, tap the "..." button at the top right and choose "Block this user". To unblock, go to Profile > Settings > Manage blocked users.

Please let us know if you need anything else.

Thank you.
```
