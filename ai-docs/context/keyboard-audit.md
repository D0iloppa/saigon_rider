# 키보드 UX 검수 — 진행상태 트래커

> 목적: 프론트 전체에서 키보드가 뜨는 화면/컴포넌트를 인벤토리하고, 각각이 [`keyboard-ux.md`](keyboard-ux.md)의 정답 패턴(케이스1 스크롤 페이지형 / 케이스2 오버레이 바텀시트형)을 따르는지 판정한다.
> 이 문서는 **순차 검수의 진행상태 트래커**다. 각 항목 status 를 pending/done/skip 으로 갱신하며 진행한다. 다른 세션은 이 문서만 읽고 이어서 착수할 수 있다. 판정 기준·정답 코드는 반드시 [`keyboard-ux.md`](keyboard-ux.md) 원문을 먼저 읽을 것.

조사 범위: `frontend/src/` 전체의 `<input>` / `<textarea>` / `contentEditable` 사용처. `<select>`(네이티브 피커)는 제외. BottomSheet 소비 컴포넌트 중 텍스트 입력이 없는 것(피커류: CategoryPickerSheet, LocationPickerSheet, MarkerLocationPicker, GameHubSheet, Garage, ProfileMain, WaitReportSheet)은 키보드 무관이라 표에서 제외.

판정 범례: **준수** = 규약 충족 / **위반** = 안티패턴(backdrop 에 paddingBottom) / **불필요** = 상단 입력이라 오버레이만으로 충분 / **미처리** = 처리 필요한데 없음.

## 점검 대상 표

| # | 화면/컴포넌트 | 파일경로 | 유형 | 현재처리 | 판정 | 우선순위 | status | 비고 |
|---|---|---|---|---|---|---|---|---|
| 1 | BizApply (파트너 신청) | `frontend/src/pages/biz/BizApply.tsx` | a | `useKeyboard` + `.body`(overflow-y:auto)에 `paddingBottom: kb.height` | 준수(reference) | - | done | keyboard-ux.md 케이스1 원본 |
| 2 | PlaceSuggestSheet (장소 제안, 동네지도/프로필 공용) | `frontend/src/pages/map/PlaceSuggestSheet.tsx` | b | `useKeyboard` + `.sheet` 자신에 `paddingBottom`+`maxHeight` 상한 | 준수(reference) | - | done | keyboard-ux.md 케이스2 원본 |
| 3 | BottomSheet 공용 컴포넌트 (인프라) | `frontend/src/components/ui/BottomSheet.tsx` | b | iOS: `sheet.style.paddingBottom`(+높이 확장), `maxHeight` CSS 기본(`calc(100% - 60px)`). imperative(ref) | 준수 | 4순위 | done | `.sheet`에 `transition: padding-bottom 0.28s cubic-bezier(0.25, 0.46, 0.45, 0.94)` 추가(`BottomSheet.module.css`) — 케이스2 체크리스트 4번째 충족. 7개 상속 시트(MarketDetail 가격/MarketMain 키워드/MarketSearch 필터/PriceOfferSheet/ReviewSheet/FeedList 댓글/DmDetail 약속잡기) 자동 반영 |
| 4 | MarketCreate (매물 등록) | `frontend/src/pages/market/MarketCreate.tsx` | a | `useKeyboard` + `.body`에 `paddingBottom: kb.height` | 준수 | - | done | |
| 5 | MarketDetail — 가격 수정 시트 | `frontend/src/pages/market/MarketDetail.tsx` | b | BottomSheet 인프라 상속 | 준수 | - | done | #3 소스 |
| 6 | MarketMain — 키워드 알림 시트 | `frontend/src/pages/market/MarketMain.tsx` | b | BottomSheet 인프라 상속 | 준수 | - | done | #3 소스 |
| 7 | MarketSearch — 상단 검색바 | `frontend/src/pages/market/MarketSearch.tsx:108` | c | 처리 없음 | 불필요 | - | skip | `.header` 최상단 고정 |
| 8 | MarketSearch — 가격대 필터 시트 | `frontend/src/pages/market/MarketSearch.tsx:208` | b | BottomSheet 인프라 상속 | 준수 | - | done | #3 소스 |
| 9 | PriceOfferSheet (가격제안, DM/매물상세 공용) | `frontend/src/components/market/PriceOfferSheet.tsx` | b | BottomSheet 인프라 상속 | 준수 | - | done | |
| 10 | ReviewSheet (거래 후기, DM/프로필 공용) | `frontend/src/components/market/ReviewSheet.tsx` | b | BottomSheet 인프라 상속 | 준수 | - | done | |
| 11 | ReportSheet (신규 장소 제보: 주유소·정비소 공용) | `frontend/src/components/info/ReportSheet.tsx:59` | b | `useKeyboard` 사용하나 **`.backdrop`**(fixed+flex-end)에 `paddingBottom` | **위반** | 1순위 | done | 안티패턴 정확히 일치. 사용처: `InfoGasList`, `InfoRepairList` |
| 12 | BizReviewSheet (업체 후기 작성) | `frontend/src/pages/biz/BizReviewSheet.tsx:61` | b | `useKeyboard` 사용하나 **`.backdrop`**에 `paddingBottom` | **위반** | 1순위 | done | 주석엔 "장소 제안 시트 패턴 미러"라 돼 있으나 실제론 backdrop 적용 — 잘못 베낀 사례 |
| 13 | InfoFloodMap — 침수 제보 시트 (인라인) | `frontend/src/pages/info/InfoFloodMap.tsx:338` | b | `useKeyboard` + `.reportSheet` 자신에 `paddingBottom`+`maxHeight` 상한 + `transition` | 준수 | - | done | 케이스2 적용 완료 |
| 14 | InfoRepairWrite (정비 후기 작성) | `frontend/src/pages/info/InfoRepairWrite.tsx` | a | `useKeyboard` + `.scroll`에 `paddingBottom: kb.height` | 준수 | - | done | sticky CTA(`.ctaWrap`)는 스크롤 밖 유지 |
| 15 | InfoWeather (날씨 알림 등록) | `frontend/src/pages/info/InfoWeather.tsx:86` | a | `useKeyboard` + `.scroll`에 `paddingBottom: kb.height` | 준수 | - | done | BizApply 동일 구조 |
| 16 | WorldMapV2 (홈 검색바) | `frontend/src/pages/home/WorldMapV2.tsx:319` | c | 처리 없음 | 불필요 | - | skip | `.fixedHeader` 내부, 최상단 |
| 17 | NeighborhoodMap — 검색바(2곳) | `frontend/src/pages/map/NeighborhoodMap.tsx:1495,1616` | c | 처리 없음 | 불필요 | - | skip | 지도 상단 오버레이 |
| 18 | ProfileSetup (온보딩 — 닉네임+스타일) | `frontend/src/pages/auth/ProfileSetup.tsx` | a | `useKeyboard` + `.body`에 `paddingBottom: kb.height` | 준수 | - | done | `.bottomCta` 버튼 노출 확보 |
| 19 | ProfileEdit (닉네임/스타일 수정) | `frontend/src/pages/settings/ProfileEdit.tsx` | a | `useKeyboard` + `.body`에 `paddingBottom: kb.height` | 준수 | - | done | |
| 20 | CustomerSupport (문의 등록) | `frontend/src/pages/settings/CustomerSupport.tsx:85` | a | `useKeyboard` + `.form`에 `paddingBottom: kb.height` | 준수 | 4순위 | done | Fragment 렌더 구조 확인됨: `TopBar`(`position: sticky; top:0`, `TopBar.module.css:4-5`)와 `.form`이 AppShell `.viewport`(`flex:1; overflow-y:auto`)의 형제로 렌더 — `.form`/`.formCard` 모두 자체 overflow/height 제약 없어 `paddingBottom`이 `.viewport` 스크롤로 그대로 흡수되고 TopBar는 sticky로 고정 유지. 구조 정상, 코드 변경 불필요 |
| 21 | FriendAdd (친구 검색) | `frontend/src/pages/profile/FriendAdd.tsx:130` | c/a | 처리 없음. `.content` overflow-y:auto이나 입력창 최상단 | 불필요(요확인) | 4순위 | skip | 검색 입력 상단 고정형. 결과 리스트 하단 가림 가능성 낮음 |
| 22 | FeedCreate (피드 작성) | `frontend/src/pages/feed/FeedCreate.tsx` | a | `useKeyboard` + `.body`(overflow-y:auto 보강)에 `paddingBottom: kb.height` | 준수 | - | done | `.body` overflow 없던 것 케이스1 구조로 보정(공유 CSS) |
| 23 | FeedEdit (피드 수정) | `frontend/src/pages/feed/FeedEdit.tsx` | a | `FeedCreate.module.css` 공유, `useKeyboard` + `.body`에 `paddingBottom: kb.height` | 준수 | - | done | #22와 동일 CSS 보정 반영 |
| 24 | FeedDetail — 댓글 입력 액션바 | `frontend/src/pages/feed/FeedDetail.tsx:192` | d | `useKeyboard` + `.actionBar` 자신에 `paddingBottom: kb.height` | 준수(자체응용) | - | done | 하단 상시 고정 액션바 — 원칙 준수한 제3 패턴 |
| 25 | FeedList — 댓글 시트 | `frontend/src/pages/feed/FeedList.tsx:398` | b | BottomSheet 인프라 상속 | 준수 | - | done | #3 소스 |
| 26 | ProfileCard — 댓글 오버레이 | `frontend/src/components/ProfileCard.tsx:178` | b | `useKeyboard` + imperative로 `commentSheet` 자신에 `paddingBottom`+`maxHeight` | 준수 | 4순위 | done | `.commentSheet`에 `transition: padding-bottom 0.28s cubic-bezier(0.25, 0.46, 0.45, 0.94)` 추가(`ProfileCard.module.css`) — #3과 동일 갭 해소 |
| 27 | DmDetail — 메시지 입력(MessageComposer) | `frontend/src/components/ui/MessageComposer.tsx` | d | `useKeyboard` 기반 스페이서 패턴(예약 슬롯 높이 계산) | 준수(자체구현) | - | done | 채팅 입력 전용 제3 패턴, 원칙 준수 |
| 28 | DmDetail — 약속잡기 시트 | `frontend/src/pages/dm/DmDetail.tsx:638` | b | BottomSheet 인프라 상속 | 준수 | - | done | #3 소스 |
| 29 | BizAdsNew (광고 등록) | `frontend/src/pages/biz/BizAdsNew.tsx` | a | `useKeyboard` + `.body`에 `paddingBottom: kb.height` | 준수 | - | done | footer 버튼 고정 구조 유지 |
| 30 | BizManage (비즈니스 프로필 인라인 수정) | `frontend/src/pages/biz/BizManage.tsx` | a | `useKeyboard` + `.body`에 `paddingBottom: kb.height` | 준수 | - | done | `.editForm` 인라인 name/phone input |

## 순차 처리 순서 (우선순위 높은 것부터)

**1순위 — 안티패턴 위반 (backdrop → sheet 이동 + maxHeight + transition, 케이스2 적용)**
1. `ReportSheet.tsx`(#11) — `.backdrop`의 `paddingBottom`을 `.sheet`로 이동 + `maxHeight` 상한 + `transition`. 영향: `InfoGasList`, `InfoRepairList` 자동 반영.
2. `BizReviewSheet.tsx`(#12) — 동일 케이스2 교정.

**2순위 — 미처리 (케이스1/케이스2 신규 적용)**
3. `InfoFloodMap.tsx`(#13) — 인라인 침수 제보 시트에 `useKeyboard` 도입 + 케이스2.
4. `ProfileSetup.tsx`(#18) — `.body`에 케이스1.
5. `ProfileEdit.tsx`(#19) — 케이스1.
6. `BizAdsNew.tsx`(#29) — 케이스1.
7. `BizManage.tsx`(#30) — 케이스1(인라인 편집 폼).
8. `InfoRepairWrite.tsx`(#14) — `.scroll`에 케이스1, sticky CTA 위치 확인.
9. `FeedCreate.tsx`/`FeedEdit.tsx`(#22,#23) — `.body` overflow 유무 확인 후 케이스1(공유 CSS, 한 번에).

**4순위 — 선택/저위험 (기능 정상, 마감 완성도)** — 전건 완료
10. `BottomSheet.tsx`(#3), `ProfileCard.tsx`(#26) — CSS `transition: padding-bottom` 추가로 케이스2 체크리스트 완전 충족. (done)
11. `CustomerSupport.tsx`(#20) — 외부 프레임 overflow 거동 확인(요확인) → 구조 정상 확인, 코드 변경 없음. (done)
12. `FriendAdd.tsx`(#21) — 결과 리스트 하단 가림 실사용 확인 후 필요시만. (skip 유지 — 이번 범위 아님)

## 요약 카운트

- 총 **30개** 화면/컴포넌트
- **준수 25** (reference 2 포함) / **불필요 4** / **skip 1**(#21, 범위 외)
- 1~4순위(위반 2 + 미처리 8 + 선택 3) 전건 처리 완료
- pending 없음 — 남은 항목은 #21(FriendAdd) skip 뿐
