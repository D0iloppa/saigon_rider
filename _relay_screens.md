# QM 루프 — 화면 릴레이 보드

드라이버가 위에서 아래로 `PENDING` 행을 순회한다. 상태/라운드/판정은 드라이버가 갱신한다.
**사람이 할 일**: 시작 전 화면 목록을 채운다. `BLOCKED` 가 생기면 DECISION 을 읽고 결정한다.

## 상태 범례
- `PENDING` 아직 안 함 · `IN_PROGRESS` 처리 중 · `PASS` 통과(완료)
- `BLOCKED` DECISION_NEEDED 로 정지 — 대표 게이트 대기

## 이번 패스 QM_TASK
프로젝트 규약 준수 점검·수정: 동적 이미지는 `<AppImage>` 래핑(`<img>` 직접 금지) · 네이티브(`navigator.*`)는 `native.ts` 경유 · 상단여백은 `var(--status-bar-height)`(고정 px 금지) · 화면 내 하드코딩 텍스트는 i18n 키(ko/en/vi)로.

**[대표결정·Rule1 적용범위(해석 a)]** "동적 이미지"는 contents/imgproxy 매개 엔티티 이미지뿐 아니라 **원격(http) URL 을 fetch 하는 모든 `<img>`** 를 포함한다. 코드에 하드코딩된 원격 장식 URL(unsplash/picsum 등)도 `<AppImage>` 로 래핑한다. 예외는 정적 로컬 에셋(`/emoji/*`·`/assets/*` 등 동봉 파일)·emoji·인라인 svg·blob/objectURL 로컬 미리보기·transform-zoom 라이트박스(구조적 부적합). (Splash 165f208 게이트에서 확정.)

## 더티 트리 컨텍스트 (리뷰어 주입 시 무시할 파일)
대표가 동일 repo 에서 병렬 작업 중 — 현재 미커밋: quest 카드 일러스트 작업(`components/quest/QuestCard.tsx`·`QuestCard.module.css`·`quest-card-map.ts`·`QuestCardSprites.tsx`·신규 SVG 스프라이트·`quest/*.module.css`), ride(`ride/MapCanvas.tsx`·`ride/RideNav.tsx`·`ride/RideNav.module.css`), `App.tsx`·`lib/polyline.ts`·`ai-docs/context/current.md`·backend routers·`database/init/*.sql`·locale 3종·보드 `_relay_screens.md` 등 SCREEN 외 더티 파일이 수시로 생긴다.
리뷰어는 **현재 검토 중 SCREEN 파일 + 그 locale JSON 만** 근거로 삼고, 구현자 커밋이 있으면 `git show <commit>` 을, 없으면 SCREEN 파일 현재 상태를 본다. 그 외 더티 파일은 전부 무시. **ride 도메인(RideNav/RideResultFail/RideResultSuccess)은 이번 패스 제외.**
주의: locale JSON·QuestCard 컴포넌트는 quest 화면과 공유되어 더티 상태일 수 있다 — 구현자는 staged-diff 가드(자기 키만 커밋)를 유지한다.

## 화면 목록 — 전체 재패스 (47화면, ride 3 제외)

| # | SCREEN (ID / 경로) | 화면별 메모/범위(선택) | 상태 | 라운드 | 판정/비고 |
|---|---|---|---|---|---|
| 1 | frontend/src/pages/home/WorldMap.tsx | 맵·동적 이미지 다수 | PASS | 0 | 규약 4종 충족, 변경 없음 |
| 2 | frontend/src/pages/quest/QuestList.tsx | 리스트·카드 이미지·i18n | PASS | 0 | 규약 4종 충족, 변경 없음. 동적이미지 QuestCard 위임 |
| 3 | frontend/src/pages/shop/ShopCatalog.tsx | 아이템 이미지·가격 i18n | PASS | 2 | shop.slots.* 28키 i18n. commit 8cd0cd3 (de888f6 폐기·혼입분리) |
| 4 | frontend/src/pages/info/InfoFloodReport.tsx | 네이티브 위치·폼 i18n | PASS | 0 | 규약 4종 충족, 변경 없음. native.getLocation 경유, L113 영어캡션 대표유지 |
| 5 | frontend/src/pages/settings/Settings.tsx | 텍스트 다수·상단여백 | PASS | 0 | 규약 4종 충족, 변경 없음. visibilitychange는 순수 DOM(Rule2 비대상) |
| 6 | frontend/src/pages/auth/Splash.tsx | 스플래시·로고 | PASS | 0 | 대표결정 채택(해석a): hero raw<img>→AppImage. commit 165f208 |
| 7 | frontend/src/pages/auth/PhoneInput.tsx | 폼·i18n | PASS | 2 | aria-label="back"→t('common.close')(가시텍스트 일치, WCAG 2.5.3). commit 7b6098d(amend) |
| 8 | frontend/src/pages/auth/OtpInput.tsx | 폼·i18n | PASS | 0 | 규약 4종 충족, 변경 없음. CSS module도 var 확인, 7키 실재 |
| 9 | frontend/src/pages/auth/ProfileSetup.tsx | 폼·아바타 이미지 | PASS | 0 | 규약 4종 충족, 변경 없음. GifIcon 4코드 LOCAL_GIF 정적, 아바타 업로드 UI 없음 |
| 10 | frontend/src/pages/home/DistrictMap.tsx | 맵·동적 이미지 | PASS | 0 | 규약 4종 충족, 변경 없음. [systemic] 미라우팅 고아 컴포넌트(home은 InfoMap/SaigonDistrictMap 사용) |
| 11 | frontend/src/pages/quest/QuestDetail.tsx | 카드 이미지·i18n | PASS | 0 | 규약 4종 충족, 변경 없음. 본체<img>전부 emoji, 카드 QuestCard위임, currency.* 실재 |
| 12 | frontend/src/pages/shop/CouponShop.tsx | 아이템 이미지·가격 | PASS | 1 | 재오픈→aria-label="back"→t('common.back')(아이콘전용 뒤로버튼). commit b1e9d3c |
| 13 | frontend/src/pages/shop/ItemDetail.tsx | 아이템 이미지·i18n | PASS | 0 | slotLabel(L125)→shop.slots.* 재사용 치환. commit ec58427 |
| 14 | frontend/src/pages/shop/MyCoupons.tsx | 리스트·i18n | PASS | 0 | aria-label="back"→t('common.back'). commit 5c843f1. 실측 결과 t()가 다수 컨벤션 |
| 15 | frontend/src/pages/gacha/GachaMain.tsx | 동적 이미지·연출 | PASS | 0 | "GACHA"배지→gacha.badge_label + 뒤로버튼 aria-label. commit bd06ca5 |
| 16 | frontend/src/pages/gacha/GachaPull.tsx | 동적 이미지·연출 | PASS | 0 | 규약 4종 충족, 변경 없음. 18키 실재(common.skip 포함), ItemSvgRenderer SVG |
| 17 | frontend/src/pages/inventory/Inventory.tsx | 아이템 이미지 | PASS | 1 | L194 slotLabel→shop.slots.* 화면국소 치환(ItemDetail 패턴). commit c3bbc14 |
| 18 | frontend/src/pages/inventory/EquipPreview.tsx | 동적 이미지 | PASS | 0 | slotLabel 3곳(탭+보간)→shop.slots.* 치환. commit 7ca000a |
| 19 | frontend/src/pages/garage/Garage.tsx | 동적 이미지 | PASS | 0 | slotLabel 5곳→shop.slots.* 치환(L337 코드태그 유지). commit de88d08 |
| 20 | frontend/src/pages/season/SeasonPass.tsx | 보상 이미지·i18n | PASS | 0 | 규약 4종 충족, 변경 없음. reward img는 enum→emojiUrl(예외), 14키 실재 |
| 21 | frontend/src/pages/profile/ProfileMain.tsx | 아바타·텍스트 | PASS | 0 | Rule3 .settingsBtn top:60px→calc(var(--status-bar-height)+16px). commit cd91d34 |
| 22 | frontend/src/pages/profile/FollowerList.tsx | 리스트·아바타 | PASS | 0 | 규약 4종 충족, 변경 없음. 아바타 AppImage, follow.* 실재. 'Unknown' 7화면 systemic |
| 23 | frontend/src/pages/profile/FollowingList.tsx | 리스트·아바타 | PASS | 0 | 규약 4종 충족, 변경 없음. 아바타 AppImage(L61), follow.* 5키 실재 |
| 24 | frontend/src/pages/profile/FriendList.tsx | 리스트·아바타 | PASS | 0 | 친구추가 버튼 aria-label→t('follow.addFriend')(형제 컨벤션). commit 00bc033 |
| 25 | frontend/src/pages/profile/FriendAdd.tsx | 폼·i18n | PASS | 0 | 규약 4종 충족, 변경 없음. 카메라 html5-qrcode 내부, follow.* 실재 |
| 26 | frontend/src/pages/profile/SkillTree.tsx | 동적 이미지·i18n | PASS | 0 | 규약 4종 충족, 변경 없음. emoji glyph, 임베디드(R3 비해당), skill.* 9키 실재 |
| 27 | frontend/src/pages/feed/FeedList.tsx | UGC 이미지·i18n | PASS | 0 | DM버튼 aria-label="DM"→t('dm.title'). 라이트박스 raw<img> 예외 유지. commit d55bd81 |
| 28 | frontend/src/pages/feed/FeedCreate.tsx | 이미지 업로드·폼 | PASS | 0 | 삭제버튼 aria-label→feedCreate.removeImage(신규키). commit 6a9738e |
| 29 | frontend/src/pages/feed/FeedEdit.tsx | 이미지 업로드·폼 | PASS | 0 | 삭제버튼 aria-label→feedCreate.removeImage(키 재사용). commit 4921785 |
| 30 | frontend/src/pages/dm/DmList.tsx | 리스트·아바타 | PASS | 0 | 규약 4종 충족, 변경 없음. 아바타 AppImage, dm.title/empty 실재 |
| 31 | frontend/src/pages/dm/DmDetail.tsx | 채팅·아바타 | PASS | 0 | 전송버튼 aria-label→t('dm.sendBtn'). commit f137c6c |
| 32 | frontend/src/pages/info/InfoHub.tsx | 허브·i18n | PASS | 0 | 규약 4종 충족, 변경 없음. native.getLocation, 31키 전수 ko/en/vi 실재 |
| 33 | frontend/src/pages/info/InfoFloodMap.tsx | 맵·동적 이미지 | PASS | 0 | 규약 4종 충족, 변경 없음. photoUrl AppImage(L393), 34키 실재 |
| 34 | frontend/src/pages/info/InfoGasList.tsx | 리스트·i18n | PASS | 0 | 규약 4종 충족, 변경 없음. [systemic] L148 alert() toast/native 통일 별도과업 후보 |
| 35 | frontend/src/pages/info/InfoWeather.tsx | 날씨·i18n | PASS | 0 | 규약 4종 충족, 변경 없음. native.getLocation, 14키 실재 |
| 36 | frontend/src/pages/info/InfoRepairList.tsx | 리스트·i18n | PASS | 0 | 규약 4종 충족, 변경 없음. 24키 실재. [systemic] module.css dead CSS 다수(별도정리) |
| 37 | frontend/src/pages/info/InfoRepairDetail.tsx | 상세·이미지·i18n | PASS | 0 | 규약 4종 충족, 변경 없음. Hero placeholder SVG, 15키 실재. [기획] +50XP vs 70XP 불일치 |
| 38 | frontend/src/pages/info/InfoRepairWrite.tsx | 폼·이미지 업로드 | PASS | 0 | 규약 4종 충족, 변경 없음. 사진은 hasPhoto 토글 placeholder. [bug후보] catch서 success표시 |
| 39 | frontend/src/pages/settings/NotiSettings.tsx | 토글·i18n | PASS | 0 | 규약 4종 충족, 변경 없음. 14키 실재. 토글 aria는 공용 Toggle role=switch 컨벤션 |
| 40 | frontend/src/pages/settings/LangSettings.tsx | 선택·i18n | PASS | 0 | 규약 4종 충족, 변경 없음. 엔도님 비번역 정당. dead import changeLang(별도정리) |
| 41 | frontend/src/pages/settings/AccountSettings.tsx | 메뉴·i18n | PASS | 2 | r0 CHANGES: handleExport Blob/anchor 직접→native.saveTextFile 흡수(Rule2). commit d9cf5dd. [대표결정후보] 네이티브 진짜 파일저장(a:@capacitor/filesystem) vs share폴백(b,현행) |
| 42 | frontend/src/pages/settings/ProfileEdit.tsx | 폼·아바타 업로드 | PASS | 0 | 규약 4종 충족, 변경 없음. 아바타 AppImage, 17키 실재, 브라우저API 직접호출 0 |
| 43 | frontend/src/pages/settings/PrivacyPolicy.tsx | 약관 텍스트·i18n | PASS | 0 | 규약 4종 충족, 변경 없음. legal.privacyHtml dangerouslySetInnerHTML i18n 경유 |
| 44 | frontend/src/pages/settings/TermsOfService.tsx | 약관 텍스트·i18n | PASS | 0 | 규약 4종 충족, 변경 없음. legal.termsHtml i18n 경유 |
| 45 | frontend/src/pages/settings/CustomerSupport.tsx | 폼·i18n | PASS | 0 | 규약 4종 충족, 변경 없음. support.* 13키 실재 |
| 46 | frontend/src/pages/settings/SupportDetail.tsx | 상세·i18n | PASS | 0 | 규약 4종 충족, 변경 없음. support.* 동적 status_* 실재 |
| 47 | frontend/src/pages/link/LinkRouter.tsx | 라우터(UI 거의 없음) | PASS | 0 | return null 라우터, react-router navigate만. 규약 해당없음 |

> ride 도메인 제외: RideNav.tsx / RideResultFail.tsx / RideResultSuccess.tsx (대표 미커밋 작업 보호)

## 진행 로그 (드라이버가 append)

<!-- 형식: [화면] PASS@r2 commit=abc123 — 한줄요약 / 또는 [화면] BLOCKED — 결정필요 내용 -->
[전체 재패스 시작] 대표 지시 — 직전 패스(47/47 PASS, 24커밋) 종료 후 전체 리셋. quest 카드 일러스트 병렬작업이 워킹트리에 미커밋 상태이므로 더티트리 노트 갱신(quest/ride/locale 등 SCREEN 외 무시). 동일 규약 4종 과업으로 처음부터 재점검.
[WorldMap] PASS@r0 commit=none(no change) — 규약 4종 충족. avatar AppImage(L217)/emoji 정적예외/native.* 경유/header padding var/i18n 15키 실재. (선택)L193 'District 1' 폴백은 master 지역명 고유명사 — 리뷰어 PASS, i18n화는 제품 정책시 별도(직전 InfoHub info.hub.locationFallback 재사용 가능).
[QuestList] PASS@r0 commit=none(no change) — 규약 4종 충족. 본체 직접<img>는 GifIcon emoji 정적예외 1건, 동적 thumbnail 은 QuestCardBase(대표 작업) 위임. navigator無/StatusBar(var)/16키 ko/en/vi 실재. 직전패스 acceptedEmptyTitle 키 이미 반영됨.
[ShopCatalog] PASS@r2 commit=8cd0cd3 — r0 CHANGES: slotLabel(L238/278)이 api/shop.ts SLOT_LABELS 영문 하드코딩 렌더(직전패스 별도과업 보류했던 것을 이번 리뷰어 in-scope 판정). r1: 화면-국소 slotName() useCallback+t('shop.slots.{SLOT}',{defaultValue:slotLabel}) 28키 신규(ko/en/vi)·영문폴백. r1 CHANGES: 커밋 de888f6 이 locale 파일 전체 add 로 대표 ride/quest 키 혼입(Surgical). r2: de888f6 폐기→8cd0cd3 재작성, git apply --cached 로 shop.slots hunk 만 stage·대표키 워킹트리 복원. build 통과. ⚠️교훈: i18n 커밋시 locale 전체 add 금지, 자기 hunk 만 stage(PhoneInput eb2cdb2 와 동형 회귀). → 이후 implementer 프롬프트에 locale 커밋위생 규칙 상시 주입.
[InfoFloodReport] PASS@r0 commit=none(no change) — 규약 4종 충족. <img>無/인라인svg+emoji, 위치 native.getLocation()(Capacitor) 경유, status inset TopBar→StatusBar(var), info.flood.* 21키+common.save/back ko/en/vi 실재. L113 {code} 영어캡션 대표 "유지" 결정 존중 제외.
[Settings] PASS@r0 commit=none(no change) — 규약 4종 충족. 아바타 AppImage(L102), 위치권한 native.* 경유(visibilitychange/visibilityState 는 ESLint no-restricted-globals 범위밖 순수 DOM→비대상), status inset StatusBar(var), settings.* 21키 ko/en/vi 실재. 엔도님·버전덤프 라벨 비번역 정당.
[Splash] BLOCKED@r0 commit=165f208 — DECISION_NEEDED(리뷰어 발). 구현자가 photo hero raw<img>(하드코딩 원격 unsplash+onError picsum 폴백)을 <AppImage src={[...]}>로 전환. 회귀는 없음(폴백체인 정상·.photoHero img 후손셀렉터 상속·alt="" 적절). 쟁점: 이 hero 는 contents/imgproxy 매개 동적이미지가 아니라 코드 하드코딩 장식 URL — Rule1 "동적 이미지" 정의가 (a)원격 fetch 전부 vs (b)contents·imgproxy 엔티티 이미지만 인지 해석 충돌. 직전 패스는 (b)로 보고 hero 미변경 PASS 했음. 대표 결정 대기 → 루프 정지.
[대표결정] "채택(해석 a)" — 원격 fetch 하는 모든 <img> 를 AppImage 대상으로 본다(하드코딩 원격 장식 URL 포함). 165f208 유지, Splash PASS. QM_TASK 에 Rule1 적용범위 명문화 → 이후 화면 일관 적용. #1~5 는 원격 하드코딩 <img> 없어 소급 무영향.
[PhoneInput] PASS@r0 commit=none(no change) — 규약 4종 충족(해석a 적용). <img>無(국기 fi CSS클래스·▾⚠ 심볼), navigator無(document.addEventListener=DOM), L90 top calc(var(--status-bar-height)+28px), phoneInput.* 14+common.close 15키 ko/en/vi 실재. aria-label 영문(back/Select country code)은 SR 비대상. 직전 eb2cdb2 searchPlaceholder 유지.
[OtpInput] PASS@r0 commit=none(no change) — 규약 4종 충족. <img>/navigator無, StatusBar+AuthForm.module.css 모두 var(--status-bar-height)·고정px 보정 없음, otpInput.* 7키 ko/en/vi 실재(⚠는 locale 값 내 임베디드·하드코딩 아님). MM:SS 비대상.
[ProfileSetup] PASS@r0 commit=none(no change) — 규약 4종 충족(해석a). 유일 <img>(GifIcon) 4코드(1f3cd/2615/1f31f/2705) 전부 LOCAL_GIF 정적 /emoji/*.gif(실파일 존재), 아바타 업로드 UI 없음·원격이미지 無. navigator無/StatusBar(var)/profileSetup.* 13+common.errorUnexpected 14키 ko/en/vi 실재.
[DistrictMap] PASS@r0 commit=none(no change) — 규약 4종 충족(해석a). <img>無(인라인svg+lucide), navigator無, 중첩카드(top px 없음), home.district.* 12 id ko/en/vi 실재. [systemic] 이 컴포넌트는 현재 미라우팅/미마운트 고아(home은 InfoMap/SaigonDistrictMap 사용) — 삭제는 Surgical 원칙상 보류, 별도 dead-code 정리 후보.
[QuestDetail] PASS@r0 commit=none(no change) — 규약 4종 충족(해석a). 본체 <img> 4건 전부 emojiUrl(2b50/1f48e/1fa99/1f381) emoji 예외, 동적 카드일러스트는 QuestCard(customImageUrl=quest.mainImageUrl) 위임. navigator無/상단 TopBar·StatusBar 위임/currency.exp·xp·gold·item ko/en/vi 실재. 직전 1bb9a4e 유지. alt 영문(EXP/RP/ITEM)은 접근성텍스트 비대상.
[CouponShop] PASS@r0 commit=none(no change) — 규약 4종 충족. thumbnail_url(엔진 /coupons 동적URL) AppImage 래핑(L92), null폴백 emoji. navigator無, .header/.back/.headerTitle/.myBtn 전부 calc(+var(--status-bar-height)), coupon.* 13키+common.loading ko/en/vi 실재. aria-label="back" 전역 비번역 컨벤션 비대상.
[ItemDetail] PASS@r0 commit=ec58427 — Rule4: slotLabel(item.item_slot)(L125 영문 SLOT_LABELS)→t('shop.slots.{slot}',{defaultValue:slotLabel}) 치환(ShopCatalog 추가한 28키 재사용·신규無). 공유헬퍼 api/shop.ts 미수정. 아이템은 ItemSvgRenderer(SVG) 예외. 1파일1라인 surgical·build통과. [systemic] RARITY_LABEL(COMMON/RARE 등) 키 미프로비저닝·RarityChip/inventory 공유 전역 등급토큰 컨벤션→비대상(제품결정). api/shop.ts BODY_PAINT 슬롯 키 부재→raw노출(회귀아님).
[MyCoupons] PASS@r0 commit=5c843f1 — Rule4: aria-label="back"(L42)→t('common.back'). 🔑리뷰어 코드베이스 실측: aria-label t() 치환 21건 vs 리터럴 2건 = t()가 다수 컨벤션. 앞서 CouponShop/PhoneInput 의 "비번역 전역 컨벤션" 판정은 사실오류였음 → 두 화면 재오픈.
[PhoneInput] PASS@r2 commit=7b6098d(amend) — 재오픈: aria-label="back"→t() 일관화. r1 CHANGES: 버튼 가시텍스트가 t('common.close')(닫기)인데 common.back 으로 치환→WCAG SC2.5.3 label-in-name 불일치. r2: 가시텍스트 우선 원칙으로 t('common.close')로 정정(onClick=navigate(-1)이나 표면라벨 close 우선). ⚠️교훈: aria-label i18n 시 가시텍스트 있으면 그 키와 일치시킬 것.
[CouponShop] PASS@r1 commit=b1e9d3c — 재오픈: aria-label="back"(L68)→t('common.back'). 버튼은 아이콘전용(‹ 글리프, 가시텍스트 없음)+onClick=navigate(-1) 뒤로가기 → label-in-name 무관, common.back 적절. [정리완료] 리터럴 aria-label 2건(PhoneInput/CouponShop) 모두 t() 치환, 패스 내 일관성 회복.
[GachaMain] PASS@r0 commit=bd06ca5 — Rule4 2건: (1)L174 카드배지 리터럴 "GACHA"({cost_currency} GACHA)→t('gacha.badge_label')(신규 ko=가챠/en=GACHA/vi=GACHA, 헤더 gacha.title 과 분리). (2)L123 ←뒤로버튼 aria-label 누락→t('common.back'). git apply --cached 로 badge_label hunk만 stage·대표키 미혼입. 유일<img> GifIcon emoji 예외. build통과. (직전 ddc2106 의 타이틀 치환과 별개로 배지 리터럴 추가발견.)
[GachaPull] PASS@r0 commit=none(no change) — 규약 4종 충족. 원격<img>無(아이템 ItemSvgRenderer SVG), navigator無(native.haptic), .skipBtn/.topLabel/.cardsArea 전부 calc(+var), 사용 18키(gachaPull.*+common.skip/back) ko/en/vi 실재. 직전 5라벨/common.skip 정상유지.
[Inventory] PASS@r1 commit=c3bbc14 — r0 CHANGES: L194 slotLabel(item.item_slot)(api/inventory.ts SLOT_LABELS 영문)가 가시노출→ItemDetail(ec58427) 동일패턴 t('shop.slots.{slot}',{defaultValue:slotLabel}) 화면국소 치환. shop.slots 28키==SLOT_LABELS 28키 완전일치·ko/en/vi 실재(신규無). rarityLabel(전역 등급토큰)은 비대상 유지. 1파일1라인·build통과.
[EquipPreview] PASS@r0 commit=7ca000a — Rule4: slotLabel 가시렌더 3곳(L91 슬롯탭+L57 equip_done {{slot}}보간+L118 no_items 보간)→shop.slots.* t() 치환(이중t 보간 정상). 25 SLOTS 전부 키 커버·locale 무변경. <img>無(ItemSvgRenderer), navigator無, .header padding-top var. equipped_badge(a93d259) 유지. rarity 비대상.
[Garage] PASS@r0 commit=de88d08 — Rule4: slotLabel 영문 가시렌더 5곳(L226/238/249 보간+L338 .slotStat+L430 .gridTitle)→shop.slots.* t() 치환. L337 {slot.label}는 enum 코드태그(monospace uppercase, 현지명과 이중표시)로 비대상 유지. <img>3건 정적/assets+emoji 예외, navigator無, .header var. 1파일5라인·locale 무변경. [slotLabel 도메인 일관화 완료] ItemDetail/Inventory/EquipPreview/Garage 4화면 shop.slots.* 재사용 통일.
[SeasonPass] PASS@r0 commit=none(no change) — 규약 4종 충족. reward <img>는 enum(GOLD/XP/ITEM/BOX)→emojiUrl(서버 content_id/원격URL 아님, season.ts 타입에 _content_id/_url 無)이라 emoji 예외. navigator無, .header padding var, seasonPass.* 14키+common.loading ko/en/vi 실재·보간키 일치.
[ProfileMain] PASS@r0 commit=cd91d34 — Rule3 위반 1건(.settingsBtn top:60px 상태바회피 절대배치 하드코딩)→calc(var(--status-bar-height)+16px)(Splash/CouponShop 동일 컨벤션). 아바타/뱃지 AppImage 유지, emojiUrl <img> 로컬정적 예외, navigator無, LV. 브랜드토큰 비대상. CSS 1파일1라인·locale 무변경.
[FollowerList~SkillTree(22~26)] PASS — FollowerList/FollowingList/SkillTree no-change, FriendList(00bc033 친구추가 aria-label), FriendAdd no-change(카메라 html5-qrcode 내부). 'Unknown' 폴백 7화면 systemic 보류.
[FeedList(27)] PASS commit=d55bd81 — DM버튼 aria-label="DM"→t('dm.title'). 라이트박스 raw<img> 대표결정 예외+onError 폴백 유지, 본문 carousel/아바타 AppImage.
[FeedCreate(28)] PASS commit=6a9738e — 이미지삭제버튼 aria-label→신규 feedCreate.removeImage(이미지삭제/Remove image/Xóa ảnh). git apply --cached 로 대표키 분리.
[FeedEdit(29)] PASS commit=4921785 — 삭제버튼 aria-label→feedCreate.removeImage 재사용. 서버사진 AppImage·blob 미리보기 예외.
[DmList(30)] PASS no-change. [DmDetail(31)] PASS commit=f137c6c — 전송버튼 aria-label→t('dm.sendBtn').
[InfoHub(32)] PASS no-change(31키 전수). [InfoFloodMap(33)] PASS no-change(photoUrl AppImage). [InfoGasList(34)] PASS no-change([systemic] L148 alert() toast/native 통일 후보). [InfoWeather(35)] PASS no-change. [InfoRepairList(36)] PASS no-change([systemic] module.css dead CSS). [InfoRepairDetail(37)] PASS no-change([기획] +50XP vs 70XP 불일치). [InfoRepairWrite(38)] PASS no-change([bug후보] handleSubmit catch서 success 표시).
[NotiSettings(39)/LangSettings(40)] PASS no-change(LangSettings dead import changeLang 별도정리).
[AccountSettings(41)] PASS@r2 commit=d9cf5dd — r0 CHANGES: handleExport Blob/anchor 직접 다운로드 Rule2 위반(직전패스 놓침)→native.ts.saveTextFile() 흡수, 화면 DOM/Blob 제거. r2: dead eslint-disable 4개 정리. [대표결정후보] 네이티브 진짜 파일저장(a:@capacitor/filesystem) vs share폴백(b,현행). ⚠️교훈: Rule2 는 navigator.* 뿐 아니라 Blob/anchor 파일저장 등 브라우저 네이티브기능 직접호출 포함(ESLint 룰은 navigator만 막아 못 잡음).
[ProfileEdit(42)] PASS no-change(아바타 AppImage). [PrivacyPolicy(43)/TermsOfService(44)] PASS no-change(legal.*Html dangerouslySetInnerHTML i18n 경유). [CustomerSupport(45)/SupportDetail(46)] PASS no-change(support.* 동적 status_* 실재). [LinkRouter(47)] PASS no-change(return null 라우터, react-router navigate만).
[전체 재패스 종료] 47/47 PASS. 코드수정 커밋 18건: 8cd0cd3(ShopCatalog slotLabel/shop.slots 28키)·165f208(Splash hero AppImage·대표결정 해석a)·ec58427(ItemDetail)·5c843f1(MyCoupons)·7b6098d(PhoneInput)·b1e9d3c(CouponShop)·bd06ca5(GachaMain)·c3bbc14(Inventory)·7ca000a(EquipPreview)·de88d08(Garage)·cd91d34(ProfileMain)·00bc033(FriendList)·d55bd81(FeedList)·6a9738e(FeedCreate)·4921785(FeedEdit)·f137c6c(DmDetail)·d9cf5dd(AccountSettings). 대표 게이트 1회(Splash Rule1 해석a 확정). CHANGES 환류: ShopCatalog r2·PhoneInput r2·Inventory r1·AccountSettings r2 전부 수렴. push 안 함(대표 소관). [systemic 후보] 'Unknown' 폴백 7화면·aria-label 잔여·InfoGasList alt()·InfoRepairList dead CSS·DistrictMap 고아·InfoRepairWrite catch버그·InfoRepairDetail XP수치. [대표결정 대기] AccountSettings 네이티브 파일저장 a/b.

<details><summary>이전 패스 로그 (47/47 PASS, 접힘)</summary>

[WorldMap] BLOCKED@r1 → 베이스라인 커밋 3374188 후 PASS@r1(no change).
[QuestList] PASS@r0 commit=7c2b257 — acceptedEmptyTitle 키 추가.
[ShopCatalog] PASS@r1 commit=a12d626,e75c54c — 아바타 AppImage+i18n 2건+LEGENDARY 리터럴.
[InfoFloodReport] 대표결정 L113 영어코드 유지 → PASS.
[Settings] PASS@r0(no change).
[Splash] PASS@r0 commit=a75e48e — top:60px→calc(var(--status-bar-height)+16px).
[PhoneInput] PASS@r0 commit=eb2cdb2 — searchPlaceholder 키(+ride키 혼입, 이후 staged-diff 가드 도입).
[OtpInput/ProfileSetup/DistrictMap] PASS@r0(no change).
[QuestDetail] PASS@r0 commit=1bb9a4e — EXP/ITEM→currency 키.
[CouponShop] PASS@r0(no change).
[ItemDetail] PASS@r0 commit=d56cc54 — COLLECTION 라벨 키.
[MyCoupons] PASS@r0(no change).
[GachaMain] PASS@r0 commit=ddc2106 — GACHA 타이틀 키.
[GachaPull] PASS@r1 commit=1b96751+4b1c9a3 — 5라벨 키+common.skip 미존재키 회귀 해소.
[Inventory] PASS@r0(no change).
[EquipPreview] PASS@r0 commit=a93d259 — EQUIPPED 배지 키.
[Garage] PASS@r0(no change).
[SeasonPass] PASS@r0 commit=7973c64 — hours_mins/node_level 보간키.
[ProfileMain] PASS@r1 commit=3de24be — 뱃지 raw<img>→AppImage(백엔드 추적으로 동적이미지 입증).
[FollowerList/FollowingList] PASS@r0(no change).
[FriendList] PASS@r0 commit=c87c1a0 — dm.button 키.
[FriendAdd] PASS@r0 commit=0f57a17 — cameraError/followError 키.
[SkillTree] PASS@r0(no change).
[FeedList] PASS@r1 commit=db54fa6 — 라이트박스 raw<img> 의도된 예외+onError 폴백(대표결정).
[FeedCreate/FeedEdit] PASS@r0(no change).
[DmList] PASS@r0(no change).
[DmDetail] PASS@r1 commit=368a9f1 — dm.detailTitle 키.
[InfoHub] PASS@r0 commit=2b8f8ac — locationFallback 키.
[InfoFloodMap] PASS@r0(no change).
[InfoGasList] PASS@r0 — 이후 screen36서 발견된 미존재키 info.gas.loadError 재오픈→87f37fc.
[InfoWeather] PASS@r1 commit=3b1f55c — DISTRICT 1 폴백 재사용.
[InfoRepairList] PASS@r0 commit=17e5e5d — loadError/common.retry 키.
[InfoRepairDetail] PASS@r0 commit=d4b154c — transparentBar 48px→calc(var+12px).
[InfoRepairWrite] PASS@r0(no change).
[NotiSettings] PASS@r0(no change).
[LangSettings] PASS@r0 commit=3be595a — langName 부제 키.
[AccountSettings] PASS@r0 commit=9a36b98 — clipboard→native.copyToClipboard().
[ProfileEdit/PrivacyPolicy/TermsOfService/CustomerSupport/SupportDetail] PASS@r0(no change).
[LinkRouter] PASS@r0 — return null 라우터.
[전체패스 종료] 47/47 PASS. 코드수정 24커밋. 대표 게이트 3회, CHANGES 환류 5회 전부 수렴. push 안 함.

[systemic 별도과업 후보] aria-label="back" 영문 하드코딩(SR전용, 다수화면 공통) · u.nickname??'Unknown' 폴백(6+파일) · api/shop.ts SLOT_LABELS 영문 하드코딩.
</details>
