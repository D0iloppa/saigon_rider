---
title: "휴먼 검증 시나리오 — Game Hub Sheet + 게임 컴포넌트 5종"
---

:::info 자동 동기화 문서
이 페이지는 `ai-docs/TEST/260519_game_hub_test.md` 에서 자동 복사되었습니다.
편집은 **원본 파일**에서, 발행은 프로젝트 루트의 `./wikidoc_publish.sh` 로 수행하세요.
:::

# 휴먼 검증 시나리오 — Game Hub Sheet + 게임 컴포넌트 5종

> **작성일**: 2026-05-19
> **대상**: GAP-H3 (#34) UI 컴포넌트 + FAB Game Hub 네비게이션 연결
> **전제**: `npm run dev` 실행 후 로그인 상태

---

## 사전 준비

```bash
# 1. Engine 서버 (DB 필요)
cd engine && uvicorn app.main:app --port 8090

# 2. BFF 서버
cd backend && uvicorn app.main:app --port 8080

# 3. 프론트 dev 서버
cd frontend && npm run dev
# → http://localhost:5173 에서 로그인 후 테스트
```

> Engine/BFF 없이도 프론트 단독 테스트 가능 (API 에러 시 빈 화면이지만 네비게이션/컴포넌트 렌더는 확인 가능)

---

## 컴포넌트 → 화면 연계 맵

```
TabBar FAB 🏍
  └─ tap → GameHubSheet (BottomSheet)
              ├── CurrencyHUD (GP/GC 표시)
              ├── 게러지     → /inventory  (임시, GARAGE 미구현)
              ├── 인벤토리   → /inventory
              ├── 상점       → /shop
              ├── 가챠       → /gacha
              └── 시즌패스   → /season

/gacha (GachaMain.tsx)
  └── PityBar (components/game) — 각 가챠 카드 하단 천장 게이지

/gacha/pull/:code (GachaPull.tsx)
  ├── GachaCardBack (components/game) — 로딩 "SUMMONING…" 상태
  ├── ConfettiLayer (components/game) — L/M 등급 결과 시 상단 파티클
  └── RarityChip (components/game) — 카드 등급 배지 + 결과 breakdown

CurrencyBadge (components/game) — 독립 컴포넌트, 화면 미연결 (향후 사용)
```

---

## 시나리오 1: FAB → Game Hub Sheet

| 항목 | 내용 |
|---|---|
| **경로** | 아무 페이지 (예: `/home`) |
| **절차** | 1. 하단 탭바 가운데 🏍 FAB 버튼 탭<br />2. 바텀 시트가 아래에서 올라옴<br />3. 상단에 GP/GC HUD 표시 확인 (🪙 1,820 GP / 💎 240 GC)<br />4. 5개 아이콘 그리드 확인 (게러지/인벤토리/상점/가챠/시즌패스)<br />5. 배경(backdrop) 탭 → 시트 닫힘<br />6. 다시 FAB 탭 → ESC 키 → 시트 닫힘 |
| **기대** | 시트 slide-up 애니메이션 0.25s, 배경 blur 처리, grabber 바 표시 |

- [ ] 시트 열림/닫힘 정상
- [ ] CurrencyHUD 렌더 정상
- [ ] 5개 아이콘+라벨 전부 표시
- [ ] ESC 키로 닫힘
- [ ] 배경 탭으로 닫힘

---

## 시나리오 2: 시트에서 각 게임 화면 진입

| 항목 | 내용 |
|---|---|
| **절차** | 1. FAB 탭 → "가챠" 셀 탭 → URL이 `/gacha`로 이동 확인<br />2. 뒤로가기 → FAB 탭 → "상점" → `/shop` 확인<br />3. FAB 탭 → "인벤토리" → `/inventory` 확인<br />4. FAB 탭 → "시즌패스" → `/season` 확인<br />5. FAB 탭 → "게러지" → `/inventory` 확인 (GARAGE 미구현, 임시 매핑) |
| **기대** | 셀 탭 시 시트 자동 닫힘 → 해당 페이지로 이동. 뒤로가기 시 이전 페이지 복귀 |

- [ ] 가챠 (`/gacha`) 진입 정상
- [ ] 상점 (`/shop`) 진입 정상
- [ ] 인벤토리 (`/inventory`) 진입 정상
- [ ] 시즌패스 (`/season`) 진입 정상
- [ ] 게러지 진입 정상 (임시 `/inventory`)
- [ ] 시트 닫힘 후 페이지 전환 (깜빡임 없음)

---

## 시나리오 3: 기존 탭바 회귀

| 항목 | 내용 |
|---|---|
| **절차** | 1. 월드 탭 → `/home` 정상<br />2. 퀘스트 탭 → `/quests` 정상<br />3. 피드 탭 → `/feed` 정상<br />4. 프로필 탭 → `/profile` 정상<br />5. FAB이 `/quests`로 이동하지 **않는** 것 확인 |
| **기대** | 4탭 기존 동작 유지. 활성 탭 인디케이터(주황 바) 정상 |

- [ ] 월드 탭 정상
- [ ] 퀘스트 탭 정상
- [ ] 피드 탭 정상
- [ ] 프로필 탭 정상
- [ ] FAB은 시트만 열고 페이지 이동하지 않음

---

## 시나리오 4: PityBar — 가챠 목록 천장 게이지

| 항목 | 내용 |
|---|---|
| **경로** | `/gacha` |
| **전제** | Engine 서버 구동, 가챠 정의 + pity 데이터 존재 |
| **절차** | 1. `/gacha` 진입<br />2. 천장 있는 가챠(예: LEGEND) 카드에 "천장까지 N회 남음" 텍스트 확인<br />3. 진행 바가 current/ceiling 비율대로 채워져 있는지 확인<br />4. 80% 이상이면 주황 펄스 애니메이션(`.pity-bar-fill[data-near="true"]`) 확인 |
| **기대** | 천장 바가 기존과 동일하게 렌더. 레이아웃 깨짐 없음 |

- [ ] 천장 텍스트 표시
- [ ] 진행 바 비율 정확
- [ ] 80% 이상 펄스 애니메이션

---

## 시나리오 5: GachaCardBack — 뽑기 로딩 카드

| 항목 | 내용 |
|---|---|
| **경로** | `/gacha/pull/GARAGE_NORMAL?is10=false` |
| **전제** | GP 잔고 충분 |
| **절차** | 1. `/gacha`에서 1회 버튼 클릭<br />2. 로딩 상태: 어두운 줄무늬 패턴 카드 + `?` 텍스트가 Y축 flip 하는지 확인<br />3. "SUMMONING…" 텍스트 표시 확인<br />4. 결과 도착 시 카드가 실제 아이템으로 교체 |
| **기대** | flip 애니메이션 1.2s 주기. 로딩→결과 전환 자연스러움 |

- [ ] 카드 뒷면 렌더 (줄무늬 + `?`)
- [ ] Y축 flip 애니메이션
- [ ] "SUMMONING…" 텍스트
- [ ] 결과 도착 시 자연스러운 교체

---

## 시나리오 6: ConfettiLayer + RarityChip — 뽑기 결과

| 항목 | 내용 |
|---|---|
| **경로** | `/gacha/pull/GARAGE_NORMAL?is10=true` |
| **전제** | 10연 뽑기 가능한 GP 보유 |
| **절차** | 1. 10연차 실행<br />2. L/M 등급 포함 시: 화면 상단 46% 영역에 색색 사각형 ConfettiLayer 표시<br />3. C/R/E만 나온 경우: Confetti 없음 확인<br />4. 각 카드에 등급 배지(RarityChip) 표시: C=회색, R=파란, E=보라, L=주황그라데이션, M=무지개<br />5. 하단 시트 "PULL RESULT" 섹션에 `RARE x2` 같은 breakdown chips |
| **기대** | 기존과 동일한 등급 배지 + Confetti. count 표시 포함 breakdown |

- [ ] L/M 시 ConfettiLayer 표시
- [ ] C/R/E만 시 Confetti 없음
- [ ] RarityChip 등급별 색상 정확
- [ ] Breakdown chips에 count 표시

---

## 시나리오 7: 기존 화면 회귀 (인라인 rarity-chip CSS 호환)

| 항목 | 내용 |
|---|---|
| **경로** | `/inventory`, `/shop`, `/shop/item/:code`, `/season` |
| **절차** | 1. `/inventory` → 아이템 그리드의 등급 배지 색상 정상 확인<br />2. `/shop` → 상점 아이템 카드의 등급 배지 + 가격 정상<br />3. `/shop/item/:code` → 아이템 상세의 등급 chip<br />4. `/season` → 시즌 보상 카드의 등급 라벨 |
| **기대** | 인라인 `.rarity-chip` CSS 사용 화면 전부 깨지지 않음. tokens.css 변경은 keyframe 추가뿐 |

- [ ] 인벤토리 등급 배지 정상
- [ ] 상점 등급 배지 정상
- [ ] 아이템 상세 등급 chip 정상
- [ ] 시즌패스 보상 라벨 정상

---

## 시나리오 8: i18n 언어 전환

| 항목 | 내용 |
|---|---|
| **경로** | `/settings/language` → 언어 변경 후 FAB 탭 |
| **절차** | 1. 설정 → 언어 → English 선택<br />2. FAB 탭 → 시트 라벨이 "Garage/Inventory/Shop/Gacha/Season Pass"인지 확인<br />3. 언어 → Tiếng Việt 선택<br />4. FAB 탭 → "Garage/Kho đồ/Cửa hàng/Gacha/Season Pass" 확인 |

- [ ] 영문 라벨 정상
- [ ] 베트남어 라벨 정상
- [ ] 한국어 복귀 정상

---

## 알려진 제한사항

| 항목 | 상태 | 비고 |
|---|---|---|
| CurrencyHUD GP/GC 값 | 하드코딩 (1820/240) | API 연동 별도 작업 필요 |
| 게러지 페이지 | 미구현 | 시트에서 `/inventory`로 임시 매핑 |
| CurrencyBadge 컴포넌트 | 화면 미연결 | 독립 컴포넌트, 향후 ShopCatalog/SeasonPass 등에서 사용 |
| Engine/BFF 미실행 시 | API 에러 | 네비게이션/컴포넌트 렌더는 확인 가능, 데이터 의존 기능은 불가 |
