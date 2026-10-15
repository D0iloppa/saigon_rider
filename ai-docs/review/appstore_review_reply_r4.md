# App Store 심사 회신 — 4차 반려 (2026-10-15, Submission 00dc44bd-1252-48b8-8599-3558ef46eee2)

> 반려 대상: 1.0 (21), iPad Air 11-inch (M3). 사유: 5.1.2(i) 지도에 다른 사용자 위치 표시 시 개인정보 보호 조치.
> 지도에 타인 위치가 뜨는 곳은 DM 채팅방 실시간 위치공유(`LiveLocationModal`) 하나뿐. 시작·참가마다 동의 모달(취소 가능), 3시간 자동 종료, 최신 위치 1개만 보관·종료 시 삭제, 자동 공유 설정 없음 → ③④는 이미 충족.
> 앱 바이너리 변경 없음 — **빌드 21 그대로 재제출**. (앱 내 처리방침 문구는 웹 콘텐츠라 운영 배포로 반영)

## 1) Reply message (App Store Connect → Resolution Center)

```
Hello App Review Team,

Thank you for the review. We have addressed Guideline 5.1.2(i) as follows.

1. Age rating: We have set the age rating to 18+ using "Override to a Higher Age Rating" in App Store Connect.

2. Privacy policy URL: We have added our privacy policy URL to App Store Connect: https://app.saigon-rider.com/app_privacy/ . The policy now describes live location sharing in detail (English, Korean and Vietnamese).

3. Permission to display location, with the option to decline: The only place where another user's location appears on a map is "Live location sharing" inside a one-to-one chat. It is not shown to nearby users, on the public map, or to anyone outside that chat. Each time a user starts or joins live location sharing, the app shows a consent screen explaining what is shared, with whom and for how long. The user can tap "Cancel" to decline, and all other features remain available.

4. Manual check-in each time, no automatic check-ins: Sharing never starts automatically and there is no setting to enable it automatically. The user must manually start or join sharing, and agree to the consent screen, every time. Each sharing session ends when the user taps "Leave" or automatically after at most 3 hours. No location history is stored; only the latest position is kept during the session and it is deleted when the session ends.

To see it: sign in with the demo account, open a chat, tap "+" and choose "Live location" — the consent screen appears first.

Please let us know if you need anything else.

Thank you.
```

## 2) App Review Information → Notes (기존 Notes 끝에 추가)

```
Location display: other users' locations are never shown on the public map. The only feature that shows another user's location is "Live location" inside a chat (chat → "+" → "Live location"). It requires explicit consent each time it is started or joined (can be declined), only chat participants can see it, it ends on "Leave" or after at most 3 hours, and no location history is stored. Age rating: 18+. Privacy policy: https://app.saigon-rider.com/app_privacy/
```

## 보내기 전 확인 (대표)

- [ ] ASC → App Information → Age Rating → "Override to a Higher Age Rating" → **18+**
- [ ] ASC → App Information → Privacy Policy URL = `https://app.saigon-rider.com/app_privacy/`
- [ ] 운영 배포 후 위 URL 에 "Live location sharing" 문단이 보이는지 확인 (nginx/pages 는 볼륨 마운트 — 운영 `git pull` 만으로 반영, 앱 내 문구는 frontend 재빌드)
- [ ] 회신 문구의 "+" → "Live location" 메뉴 라벨이 실제 iPad 화면 라벨과 같은지 확인
- [ ] 빌드 21 그대로 Submit for Review
- 미결(대표 판단): 마켓 매물 좌표가 정확 좌표로 공개됨(`backend/app/routers/market.py:211`) — 이번 반려 사유는 아니지만 흐림 처리 여부 결정 필요
