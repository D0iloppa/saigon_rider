# 프로필 '내 바이크' 장착 아이콘 깨짐 (broken image)

> 260602 · 상태: ✅ 해소 (배포·시각검증 완료, Plane SGR-212 DONE)

## 증상

프로필 화면 > "내 바이크" 배너의 장착 아이템 미니 행(최대 5개)에서 일부 아이콘이 iOS broken-image 글리프(점선 박스 `?`)로 깨져 표시됨.

## 원인 분석

`ProfileMain.tsx` 의 장착 아이템 아이콘이 **슬롯 이모지**로 렌더되고 있었다:

```tsx
<img src={emojiUrl(SLOT_EMOJI[item.item_slot] ?? '1f4e6')} width={18} height={18} alt="" />
```

1. **stale SLOT_EMOJI** — `ProfileMain` 의 `SLOT_EMOJI` 맵이 슬롯 체계 개편(SGR-200/201) 이전 구버전(`BODY_PAINT/EXHAUST/HEADLIGHT/DECAL/NAMEPLATE`)이라, 현재 아이템 슬롯(`BODY/SEAT/ENGINE/TAIL/STICKER/HANDLE/NUMBER/PANTS/KNEE/...`)이 **맵에 없음** → 폴백 `1f4e6`(📦).
2. **폴백 이모지 CDN 404** — `emojiUrl()` 은 로컬셋에 없는 코드를 Noto **animated** CDN(`.../{code}/512.gif`)으로 보내는데, `1f4e6` 등 일부 코드는 애니메이션 셋에 없어 404 → 이미지 깨짐.
3. **onError 부재** — 이 `<img>` 만 형제 `<img>`(384/389/394/403)들과 달리 `onError` 폴백이 없어 깨진 글리프가 그대로 노출.

`Garage.tsx` 에는 최신 `SLOT_EMOJI` 가 있으나 ProfileMain 과 **이중 정의·불일치** 상태였다.

## 해결 방법

슬롯 이모지 대신 앱 표준 **`ItemSvgRenderer`** 로 실제 아이템 SVG를 렌더 (가챠·인벤토리와 동일 방식):

```tsx
<ItemSvgRenderer itemCode={item.item_code} slot={item.item_slot} size={18} rarity={item.rarity} />
```

- `ItemSvgRenderer` 는 심볼 미존재 시 기본 viewBox 폴백을 가져 broken-image 부류를 원천 차단.
- 이모지-CDN 의존 제거, 실제 장착 아이템 아트 노출(UX 개선).
- orphan 이 된 `ProfileMain.SLOT_EMOJI` 상수 제거.

검증: eslint 0 errors(기존 warning 7건 unchanged), tsc 통과, 프론트 재빌드. 브라우저 시각검증 → 해소 확인 예정.

## 비고 (후속 여지)

`SLOT_EMOJI` 가 `Garage.tsx` 에 여전히 1벌 남아있다(슬롯 칩 빈 슬롯 표시용). 깨짐과 무관하나, 이모지 슬롯 표기는 동일 CDN 404 위험이 있어 추후 단일화/검토 여지. (이번 변경 범위 외 — 언급만)
