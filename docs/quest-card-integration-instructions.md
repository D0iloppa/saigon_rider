# Saigon Rider — 퀘스트 카드 통합 코드 작업 지시서 v1.0

> 발행일: 2026-05-27
> 대상: Claude Code
> 작업: Skywork 퀘스트 카드 25개 SVG sprite를 React에 통합 + 기존 실사 이미지 교체
> 소요 시간: 1-2일 (단일 개발자)
> 전제: Skywork v6 퀘스트 카드 검수 완료 (3 HTML 파일 받음)

---

## §0. 작업 개요

### 0.1 무엇을 하는지

3개의 HTML sprite 파일을 받아 React 컴포넌트로 통합:

```
입력:
  docs/saigon-quest-cards-rider.html    (12 카드)
  docs/saigon-quest-cards-season.html   (8 카드)
  docs/saigon-quest-cards-mythic.html   (5 카드)

작업:
  1. 각 HTML에서 SVG 25개 추출 → sprite 파일로 분리
  2. 미션 → 카드 매핑 로직 (240 미션 → 25 카드)
  3. QuestCard 컴포넌트 생성
  4. 기존 QuestList / QuestDetail의 실사 이미지 교체

결과: 모든 퀘스트 카드가 RPG 다크 일러스트로 통일
```

### 0.2 파일 위치

```
saigon_rider/
├── frontend/
│   ├── public/
│   │   └── assets/
│   │       └── quest-cards/                       ⭐ 신규 폴더
│   │           ├── rider-sprite.svg               ⭐ 12 카드 sprite
│   │           ├── season-sprite.svg              ⭐ 8 카드 sprite
│   │           ├── mythic-sprite.svg              ⭐ 5 카드 sprite
│   │           └── README.md                      ⭐ 카드 ID 목록
│   └── src/
│       ├── components/
│       │   └── quest/                             ⭐ 신규 폴더
│       │       ├── QuestCard.tsx                  ⭐ 메인 컴포넌트
│       │       ├── QuestCard.module.css           ⭐ 스타일
│       │       ├── quest-card-map.ts              ⭐ 240 미션 → 25 카드 매핑
│       │       └── quest-card-map.test.ts         ⭐ 매핑 테스트 (선택)
│       └── pages/
│           └── quest/
│               ├── QuestList.tsx                  🔧 카드 교체
│               └── QuestDetail.tsx                🔧 hero 이미지 교체
└── docs/
    ├── saigon-quest-cards-rider.html              📥 입력
    ├── saigon-quest-cards-season.html             📥 입력
    ├── saigon-quest-cards-mythic.html             📥 입력
    └── quest-card-integration-instructions.md     📥 이 문서
```

---

## §1. Phase 0 — SVG 추출 (1-2시간)

### Task 1.1: HTML에서 SVG 추출 스크립트

`scripts/extract_quest_card_sprites.py` (백엔드든 어디든 임시 위치):

```python
"""
3개의 HTML 파일에서 SVG sprite를 추출.

Skywork이 보낸 HTML은 검수용 페이지 + 카드 SVG를 함께 담고 있음.
React에서 사용하려면 순수 SVG sprite 파일로 분리해야 함.

각 SVG에 id 추가해서 React가 <use href="...#card-RIDING_DAILY"/> 로
참조 가능하게 함.
"""
from pathlib import Path
import re

DOCS = Path('docs')
OUT = Path('frontend/public/assets/quest-cards')
OUT.mkdir(parents=True, exist_ok=True)


def extract_sprite(html_path: Path, out_path: Path, prefix: str):
    """
    HTML에서 SVG들을 추출해서 단일 sprite SVG로 합치기.
    각 카드에 id="card-XXX" 부여 (XXX는 card-label에서 추출).
    """
    html = html_path.read_text(encoding='utf-8')
    
    # card-wrap 단위로 분리
    wraps = re.findall(
        r'<div class="card-wrap">.*?</div>\s*</div>',
        html,
        re.DOTALL
    )
    
    cards = []
    for wrap in wraps:
        # label 추출 (예: "01 · RIDING_DAILY · 오늘의 라이딩")
        label_match = re.search(
            r'<div class="card-label">(.*?)</div>',
            wrap,
            re.DOTALL
        )
        if not label_match:
            continue
        
        # label에서 카드 코드 추출 (RIDING_DAILY 형식)
        label_text = re.sub(r'<[^>]+>', '|', label_match.group(1))
        code_match = re.search(r'([A-Z][A-Z_0-9]+)', label_text)
        if not code_match:
            continue
        card_code = code_match.group(1)
        
        # SVG 추출
        svg_match = re.search(r'<svg[^>]*>.*?</svg>', wrap, re.DOTALL)
        if not svg_match:
            continue
        svg_content = svg_match.group(0)
        
        # SVG → <symbol> 변환 (sprite에 합치기 위해)
        svg_content = re.sub(
            r'<svg([^>]*)>',
            f'<symbol id="card-{card_code}" \\1>',
            svg_content,
            count=1
        )
        svg_content = svg_content.replace('</svg>', '</symbol>')
        
        cards.append((card_code, svg_content))
        print(f"  추출: card-{card_code}")
    
    # sprite 합치기
    sprite = '<svg xmlns="http://www.w3.org/2000/svg" style="display:none">\n'
    for code, svg in cards:
        sprite += svg + '\n'
    sprite += '</svg>'
    
    out_path.write_text(sprite, encoding='utf-8')
    print(f"✓ {out_path} 저장 ({len(cards)} 카드)")
    return [c[0] for c in cards]


def main():
    print("=== RIDER sprite ===")
    rider_codes = extract_sprite(
        DOCS / 'saigon-quest-cards-rider.html',
        OUT / 'rider-sprite.svg',
        'RIDER'
    )
    
    print("\n=== SEASON sprite ===")
    season_codes = extract_sprite(
        DOCS / 'saigon-quest-cards-season.html',
        OUT / 'season-sprite.svg',
        'SEASON'
    )
    
    print("\n=== MYTHIC sprite ===")
    mythic_codes = extract_sprite(
        DOCS / 'saigon-quest-cards-mythic.html',
        OUT / 'mythic-sprite.svg',
        'MYTHIC'
    )
    
    print(f"\n총 {len(rider_codes) + len(season_codes) + len(mythic_codes)} 카드 추출 완료")
    print(f"RIDER: {rider_codes}")
    print(f"SEASON: {season_codes}")
    print(f"MYTHIC: {mythic_codes}")


if __name__ == '__main__':
    main()
```

### Task 1.2: 실행 + 검증

```bash
cd saigon_rider
python scripts/extract_quest_card_sprites.py

# 결과 확인
ls -la frontend/public/assets/quest-cards/
# 기대: rider-sprite.svg, season-sprite.svg, mythic-sprite.svg

# 각 sprite의 카드 수 검증
for f in frontend/public/assets/quest-cards/*.svg; do
  echo "$f: $(grep -c '<symbol' $f) 카드"
done
# 기대: rider 12, season 8, mythic 5
```

### Task 1.3: README.md 작성

`frontend/public/assets/quest-cards/README.md`:

```markdown
# Quest Card Sprites

Saigon Rider 퀘스트 카드 SVG sprite.

## 사용법

```tsx
<svg viewBox="0 0 320 200">
  <use href="/assets/quest-cards/rider-sprite.svg#card-RIDING_DAILY" />
</svg>
```

## 카드 목록 (총 25개)

### RIDER (12) — `rider-sprite.svg`
- card-RIDING_DAILY (오늘의 라이딩)
- card-RIDING_WEEKLY (이번 주 라이딩)
- card-RIDING_MONTHLY (이달의 라이딩)
- card-COMMUNITY_DAILY (오늘의 커뮤니티)
- card-COMMUNITY_WEEKLY (이번 주 커뮤니티)
- card-MAINT_DAILY (오늘의 정비)
- card-MAINT_WEEKLY (이번 주 정비)
- card-MARKET_DAILY (오늘의 시장)
- card-MARKET_WEEKLY (이번 주 시장)
- card-MIXED_DAILY (오늘의 혼합 챌린지)
- card-DELIVERY_DAILY (오늘의 배달)
- card-ONBOARDING (라이더 입문)

### SEASON (8) — `season-sprite.svg`
- card-TET_SEASON (Tết Nguyên Đán, 음력 설)
- card-HUNG_KINGS_SEASON (Giỗ Tổ Hùng Vương, 4월 베트남 시조 기념일)
- card-REUNIFICATION_SEASON (Ngày 30/4, 남부 해방일)
- card-GHOST_SEASON (Tháng 7 Âm Lịch, 음력 7월 귀신달)
- card-MID_AUTUMN_SEASON (Tết Trung Thu, 추석)
- card-RAIN_SEASON (Mùa Mưa Sài Gòn, 우기)
- card-NEW_YEAR_SEASON (Năm Mới 2026, 양력 신년)
- card-SAIGON_BDAY_SEASON (Sinh Nhật Sài Gòn, 사이공 생일)

### MYTHIC (5) — `mythic-sprite.svg`
- card-THE_LEGEND_M (전설의 라이더, #0001/500)
- card-SAIGON_GHOST_M (사이공의 유령, #0002/300)
- card-IRON_PHOENIX_M (불사조의 귀환, #0003/200)
- card-STORM_KING_M (폭풍의 왕, #0004/150)
- card-SAIGON_ANCESTOR_M (시조의 귀환, #0001/100 ★ ULTIMATE)

## viewBox

모든 카드 동일: `0 0 320 200` (16:10 가로형 카드)
```

---

## §2. Phase 1 — 미션 매핑 로직 (2-3시간)

### Task 2.1: quest-card-map.ts 작성

`frontend/src/components/quest/quest-card-map.ts`:

```typescript
/**
 * 미션 코드 → 카드 sprite 매핑
 * 240개 미션을 25개 카드로 자동 매핑.
 * 
 * 미션 코드 패턴: {window}-{category}-{seq}
 *   예: O-RD-01    (Onboarding-Riding)
 *       D-RD-01    (Daily-Riding)
 *       W-CM-01    (Weekly-Community)
 *       M-MT-01    (Monthly-Maint)
 *       A-MX-01    (Annual-Mixed)
 *       S-TET-01   (Season-Tết)
 *       S-XMAS-01  (Season-Christmas/NewYear)
 */

export type QuestCardCategory = 'rider' | 'season' | 'mythic';

export interface QuestCardMeta {
  /** 카드 ID (sprite 내) */
  cardCode: string;
  /** sprite 파일 */
  spriteName: 'rider-sprite' | 'season-sprite' | 'mythic-sprite';
  /** 카테고리 (display 용) */
  category: QuestCardCategory;
  /** href용 풀 경로 */
  href: string;
}


// ─────────────────────────────────────────────────
// 카테고리 매핑 (RIDER 12)
// ─────────────────────────────────────────────────

/** 미션 코드 두 번째 글자 → 카테고리 */
const CATEGORY_MAP: Record<string, string> = {
  RD: 'RIDING',
  CM: 'COMMUNITY',
  MT: 'MAINT',
  MK: 'MARKET',
  DL: 'DELIVERY',
  MX: 'MIXED',
};

/** 미션 코드 첫 글자 → window */
const WINDOW_MAP: Record<string, string> = {
  D: 'DAILY',
  W: 'WEEKLY',
  M: 'MONTHLY',
  // O (Onboarding) → 단일 카드 ONBOARDING
  // A (Annual) → MIXED_DAILY 폴백
  // S (Season) → 별도 처리
};


// ─────────────────────────────────────────────────
// 시즌 매핑 (SEASON 8)
// ─────────────────────────────────────────────────

/** 우리 미션 시즌 라벨 → Skywork 카드 ID */
const SEASON_CARD_MAP: Record<string, string> = {
  TET:    'TET_SEASON',           // 1-2월 음력 설 (그대로)
  SPRING: 'HUNG_KINGS_SEASON',    // 4월 베트남 시조 기념일 (봄 끝물)
  SUM:    'REUNIFICATION_SEASON', // 4-5월 남부 해방일 (여름 입구)
  RAIN:   'RAIN_SEASON',          // 5-10월 우기 (그대로)
  INDEP:  'GHOST_SEASON',         // 8-9월 음력 7월 + 9/2 독립일
  MID:    'MID_AUTUMN_SEASON',    // 9-10월 추석 (그대로)
  DRY:    'SAIGON_BDAY_SEASON',   // 11월 건기 + 사이공 출범
  XMAS:   'NEW_YEAR_SEASON',      // 12-1월 양력 신년 (Christmas 대체)
  ANNUAL: 'TET_SEASON',           // 연 단위 → TET 폴백
};


// ─────────────────────────────────────────────────
// 메인 매핑 함수
// ─────────────────────────────────────────────────

/**
 * 미션 코드 → 카드 메타 반환
 * 
 * @param missionCode 미션 코드 (예: "D-RD-01", "S-TET-03")
 * @param missionRarity (옵션) 미션 등급. Legendary/Mythic이면 Mythic 카드로
 * @returns 카드 메타 정보
 */
export function getQuestCard(
  missionCode: string,
  missionRarity?: 'C' | 'R' | 'E' | 'L' | 'M'
): QuestCardMeta {
  // 미션 등급이 Mythic이면 Mythic 카드 (수동 매핑)
  if (missionRarity === 'M') {
    return getMythicCard(missionCode);
  }
  
  const parts = missionCode.split('-');
  const windowChar = parts[0]; // O, D, W, M, A, S
  const categoryChar = parts[1]; // RD, CM, MT, MK, DL, MX 또는 시즌 라벨
  
  // ─── ONBOARDING (O-*) ───
  if (windowChar === 'O') {
    return makeRiderCard('ONBOARDING');
  }
  
  // ─── SEASON (S-*) ───
  if (windowChar === 'S') {
    const seasonCard = SEASON_CARD_MAP[categoryChar] || 'TET_SEASON';
    return makeSeasonCard(seasonCard);
  }
  
  // ─── ANNUAL (A-*) → MIXED_DAILY 폴백 ───
  if (windowChar === 'A') {
    return makeRiderCard('MIXED_DAILY');
  }
  
  // ─── 일반 (D/W/M) + 카테고리 ───
  const category = CATEGORY_MAP[categoryChar] || 'MIXED';
  const window = WINDOW_MAP[windowChar] || 'DAILY';
  
  // DELIVERY는 모든 window 단일 카드
  if (categoryChar === 'DL') {
    return makeRiderCard('DELIVERY_DAILY');
  }
  
  // RIDING은 DAILY/WEEKLY/MONTHLY 각각 별도
  if (categoryChar === 'RD') {
    return makeRiderCard(`RIDING_${window}`);
  }
  
  // 나머지 (CM/MT/MK/MX): DAILY/WEEKLY만, MONTHLY는 WEEKLY 폴백
  const window2 = window === 'MONTHLY' ? 'WEEKLY' : window;
  return makeRiderCard(`${category}_${window2}`);
}


// ─────────────────────────────────────────────────
// Mythic 매핑 (수동, 특별한 미션만)
// ─────────────────────────────────────────────────

/**
 * Mythic 등급 미션 → 5개 Mythic 카드 중 하나
 * 
 * 미션 코드에서 lore hint를 찾아서 매핑.
 * 없으면 THE_LEGEND_M (default Mythic).
 */
function getMythicCard(missionCode: string): QuestCardMeta {
  const code = missionCode.toUpperCase();
  
  // 미션 코드/라벨에 lore 키워드가 있으면 매핑
  if (code.includes('GHOST') || code.includes('NIGHT')) {
    return makeMythicCard('SAIGON_GHOST_M');
  }
  if (code.includes('PHOENIX') || code.includes('REBIRTH')) {
    return makeMythicCard('IRON_PHOENIX_M');
  }
  if (code.includes('STORM') || code.includes('RAIN') || code.includes('TYPHOON')) {
    return makeMythicCard('STORM_KING_M');
  }
  if (code.includes('ANCESTOR') || code.includes('ULTIMATE') || code.includes('1975')) {
    return makeMythicCard('SAIGON_ANCESTOR_M');
  }
  
  // 기본: THE_LEGEND_M (모든 District 정복 같은 일반 Mythic)
  return makeMythicCard('THE_LEGEND_M');
}


// ─────────────────────────────────────────────────
// Helper
// ─────────────────────────────────────────────────

function makeRiderCard(cardCode: string): QuestCardMeta {
  return {
    cardCode,
    spriteName: 'rider-sprite',
    category: 'rider',
    href: `/assets/quest-cards/rider-sprite.svg#card-${cardCode}`,
  };
}

function makeSeasonCard(cardCode: string): QuestCardMeta {
  return {
    cardCode,
    spriteName: 'season-sprite',
    category: 'season',
    href: `/assets/quest-cards/season-sprite.svg#card-${cardCode}`,
  };
}

function makeMythicCard(cardCode: string): QuestCardMeta {
  return {
    cardCode,
    spriteName: 'mythic-sprite',
    category: 'mythic',
    href: `/assets/quest-cards/mythic-sprite.svg#card-${cardCode}`,
  };
}


// ─────────────────────────────────────────────────
// 디버깅용 — 모든 카드 ID 목록
// ─────────────────────────────────────────────────

export const ALL_QUEST_CARDS = {
  rider: [
    'RIDING_DAILY', 'RIDING_WEEKLY', 'RIDING_MONTHLY',
    'COMMUNITY_DAILY', 'COMMUNITY_WEEKLY',
    'MAINT_DAILY', 'MAINT_WEEKLY',
    'MARKET_DAILY', 'MARKET_WEEKLY',
    'MIXED_DAILY',
    'DELIVERY_DAILY',
    'ONBOARDING',
  ],
  season: [
    'TET_SEASON',
    'HUNG_KINGS_SEASON',
    'REUNIFICATION_SEASON',
    'GHOST_SEASON',
    'MID_AUTUMN_SEASON',
    'RAIN_SEASON',
    'NEW_YEAR_SEASON',
    'SAIGON_BDAY_SEASON',
  ],
  mythic: [
    'THE_LEGEND_M',
    'SAIGON_GHOST_M',
    'IRON_PHOENIX_M',
    'STORM_KING_M',
    'SAIGON_ANCESTOR_M',
  ],
} as const;
```

### Task 2.2: 매핑 테스트 (선택)

`frontend/src/components/quest/quest-card-map.test.ts`:

```typescript
import { describe, it, expect } from 'vitest';
import { getQuestCard, ALL_QUEST_CARDS } from './quest-card-map';

describe('quest-card-map', () => {
  describe('RIDER 카테고리', () => {
    it('D-RD-01 → RIDING_DAILY', () => {
      expect(getQuestCard('D-RD-01').cardCode).toBe('RIDING_DAILY');
    });
    
    it('W-CM-05 → COMMUNITY_WEEKLY', () => {
      expect(getQuestCard('W-CM-05').cardCode).toBe('COMMUNITY_WEEKLY');
    });
    
    it('M-MT-01 → MAINT_WEEKLY (MONTHLY 폴백)', () => {
      expect(getQuestCard('M-MT-01').cardCode).toBe('MAINT_WEEKLY');
    });
    
    it('M-RD-01 → RIDING_MONTHLY (전용 카드 있음)', () => {
      expect(getQuestCard('M-RD-01').cardCode).toBe('RIDING_MONTHLY');
    });
    
    it('O-RD-01 → ONBOARDING (모든 O는 단일)', () => {
      expect(getQuestCard('O-RD-01').cardCode).toBe('ONBOARDING');
      expect(getQuestCard('O-MX-15').cardCode).toBe('ONBOARDING');
    });
    
    it('A-MX-01 → MIXED_DAILY (ANNUAL 폴백)', () => {
      expect(getQuestCard('A-MX-01').cardCode).toBe('MIXED_DAILY');
    });
  });
  
  describe('SEASON', () => {
    it('S-TET-01 → TET_SEASON', () => {
      expect(getQuestCard('S-TET-01').cardCode).toBe('TET_SEASON');
    });
    
    it('S-SPRING-01 → HUNG_KINGS_SEASON', () => {
      expect(getQuestCard('S-SPRING-01').cardCode).toBe('HUNG_KINGS_SEASON');
    });
    
    it('S-XMAS-01 → NEW_YEAR_SEASON', () => {
      expect(getQuestCard('S-XMAS-01').cardCode).toBe('NEW_YEAR_SEASON');
    });
    
    it('S-INDEP-01 → GHOST_SEASON', () => {
      expect(getQuestCard('S-INDEP-01').cardCode).toBe('GHOST_SEASON');
    });
  });
  
  describe('MYTHIC (수동 매핑)', () => {
    it('"M" rarity → MYTHIC 카드', () => {
      const card = getQuestCard('S-TET-08', 'M');
      expect(card.category).toBe('mythic');
    });
    
    it('GHOST 키워드 → SAIGON_GHOST_M', () => {
      expect(getQuestCard('M-GHOST-01', 'M').cardCode).toBe('SAIGON_GHOST_M');
    });
    
    it('일반 Mythic → THE_LEGEND_M', () => {
      expect(getQuestCard('A-MX-01', 'M').cardCode).toBe('THE_LEGEND_M');
    });
  });
  
  describe('카드 ID 일관성', () => {
    it('모든 카드 ID가 ALL_QUEST_CARDS 안에 있음', () => {
      const allCards = [
        ...ALL_QUEST_CARDS.rider,
        ...ALL_QUEST_CARDS.season,
        ...ALL_QUEST_CARDS.mythic,
      ];
      // 240개 미션 코드 패턴 다 돌려서 결과가 ALL_QUEST_CARDS 안에 있어야
      const testCodes = [
        'O-RD-01', 'D-RD-01', 'W-CM-05', 'M-MT-01', 'A-MX-01',
        'S-TET-01', 'S-SPRING-03', 'S-XMAS-02',
      ];
      for (const c of testCodes) {
        expect(allCards).toContain(getQuestCard(c).cardCode);
      }
    });
  });
});
```

---

## §3. Phase 2 — QuestCard 컴포넌트 (3-4시간)

### Task 3.1: QuestCard.tsx

`frontend/src/components/quest/QuestCard.tsx`:

```tsx
import React from 'react';
import { getQuestCard } from './quest-card-map';
import styles from './QuestCard.module.css';

export interface QuestCardProps {
  /** 미션 코드 (예: "D-RD-01") */
  missionCode: string;
  /** 미션 등급 (Mythic이면 mythic 카드 사용) */
  missionRarity?: 'C' | 'R' | 'E' | 'L' | 'M';
  /** 미션 제목 (카드 위에 오버레이) */
  title: string;
  /** 라이더 레벨 요구 */
  level?: number;
  /** 별점 (1-5) */
  rating?: number;
  /** 뱃지들 ['어디서나', '나이트 라이더', '안전 C+'] */
  badges?: string[];
  /** 거리 표시 (예: "1.0 km") */
  distance?: string;
  /** 보상 */
  rewards?: {
    xp?: number;
    gp?: number;  // Gold
    gc?: number;  // Gem
    items?: number;
  };
  /** 클릭 핸들러 */
  onClick?: () => void;
  /** 변형 (list 카드 = 가로, detail = 큰 hero) */
  variant?: 'list' | 'detail' | 'mini';
}

export default function QuestCard({
  missionCode,
  missionRarity,
  title,
  level,
  rating,
  badges,
  distance,
  rewards,
  onClick,
  variant = 'list',
}: QuestCardProps) {
  const card = getQuestCard(missionCode, missionRarity);
  
  return (
    <div
      className={`${styles.questCard} ${styles[variant]} ${styles[card.category]}`}
      onClick={onClick}
    >
      {/* SVG 일러스트 (sprite 참조) */}
      <div className={styles.illustration}>
        <svg viewBox="0 0 320 200" preserveAspectRatio="xMidYMid slice">
          <use href={card.href} />
        </svg>
      </div>
      
      {/* 텍스트 오버레이 (다크 그라데이션 + 콘텐츠) */}
      <div className={styles.overlay}>
        {/* 상단 뱃지 행 */}
        <div className={styles.badgeRow}>
          {level !== undefined && (
            <span className={styles.badge}>Lv.{level}+</span>
          )}
          {badges?.map((b, i) => (
            <span key={i} className={styles.badge}>{b}</span>
          ))}
        </div>
        
        {/* 제목 */}
        <h3 className={styles.title}>{title}</h3>
        
        {/* 거리 + 별점 */}
        {(distance || rating) && (
          <div className={styles.meta}>
            {distance && <span>{distance}</span>}
            {distance && rating && <span> · </span>}
            {rating && (
              <span className={styles.rating}>
                {'★'.repeat(rating)}{'☆'.repeat(5 - rating)}
              </span>
            )}
          </div>
        )}
        
        {/* 보상 */}
        {rewards && variant !== 'mini' && (
          <div className={styles.rewards}>
            {rewards.xp !== undefined && (
              <span className={styles.rewardChip}>
                💎 +{rewards.xp.toLocaleString()} XP
              </span>
            )}
            {rewards.gp !== undefined && (
              <span className={styles.rewardChip}>
                🪙 +{rewards.gp.toLocaleString()}
              </span>
            )}
            {rewards.gc !== undefined && rewards.gc > 0 && (
              <span className={styles.rewardChip}>
                💎 +{rewards.gc}
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
```

### Task 3.2: QuestCard.module.css

`frontend/src/components/quest/QuestCard.module.css`:

```css
/* ───────────────────────────────────────────
   QuestCard 컴포넌트 스타일
   ─────────────────────────────────────────── */

.questCard {
  position: relative;
  border-radius: 16px;
  overflow: hidden;
  cursor: pointer;
  transition: transform 0.15s ease, box-shadow 0.15s ease;
  background: #1A1925;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.08);
}

.questCard:active {
  transform: scale(0.98);
}

.questCard:hover {
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.16);
}


/* ─── 변형 ─── */

.list {
  display: flex;
  flex-direction: row;
  height: 96px;
}

.list .illustration {
  width: 96px;
  height: 96px;
  flex-shrink: 0;
}

.list .overlay {
  flex: 1;
  padding: 12px 14px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  background: linear-gradient(135deg, #1A1925 0%, #221F2F 100%);
}

.detail {
  display: flex;
  flex-direction: column;
  height: 280px;
}

.detail .illustration {
  width: 100%;
  height: 200px;
}

.detail .overlay {
  padding: 16px 20px;
  background: linear-gradient(180deg, transparent 0%, #1A1925 60%);
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
}

.mini {
  width: 80px;
  height: 80px;
}

.mini .illustration {
  width: 100%;
  height: 100%;
}

.mini .overlay {
  display: none;
}


/* ─── 일러스트 ─── */

.illustration {
  position: relative;
  overflow: hidden;
  background: #0E0D1A;
}

.illustration svg {
  width: 100%;
  height: 100%;
  display: block;
}


/* ─── 텍스트 ─── */

.badgeRow {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}

.badge {
  display: inline-block;
  padding: 2px 8px;
  background: rgba(255, 255, 255, 0.1);
  color: rgba(255, 255, 255, 0.85);
  border-radius: 10px;
  font-size: 10px;
  font-weight: 600;
  line-height: 1.4;
  white-space: nowrap;
}

.title {
  font-size: 15px;
  font-weight: 700;
  color: white;
  margin: 0;
  line-height: 1.3;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
}

.detail .title {
  font-size: 22px;
  font-weight: 800;
}

.meta {
  display: flex;
  gap: 4px;
  align-items: center;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.7);
  margin-top: 2px;
}

.rating {
  color: #FFB800;
  letter-spacing: 0.5px;
  font-size: 10px;
}

.rewards {
  display: flex;
  gap: 6px;
  margin-top: 8px;
  flex-wrap: wrap;
}

.rewardChip {
  display: inline-flex;
  align-items: center;
  gap: 3px;
  padding: 3px 8px;
  background: rgba(255, 90, 31, 0.12);
  color: #FFB800;
  border-radius: 8px;
  font-size: 11px;
  font-weight: 700;
  white-space: nowrap;
}


/* ─── 카테고리별 시그니처 ─── */

/* SEASON 카드는 해당 시즌 컬러로 살짝 글로우 */
.season .questCard {
  box-shadow: 0 2px 12px rgba(220, 38, 38, 0.15);
}

/* MYTHIC 카드는 골드 보더 + 강한 글로우 */
.mythic {
  border: 2px solid #FFB800;
  box-shadow: 
    0 0 16px rgba(255, 184, 0, 0.25),
    0 2px 8px rgba(0, 0, 0, 0.16);
}

.mythic .rewardChip {
  background: linear-gradient(135deg, #FFB800 0%, #FF8C42 100%);
  color: white;
  box-shadow: 0 1px 4px rgba(255, 184, 0, 0.4);
}


/* ─── 반응형 ─── */

@media (max-width: 480px) {
  .list {
    height: 88px;
  }
  
  .list .illustration {
    width: 88px;
    height: 88px;
  }
  
  .detail .title {
    font-size: 20px;
  }
}
```

---

## §4. Phase 3 — 기존 화면 교체 (3-4시간)

### Task 4.1: QuestList.tsx 교체

기존 `frontend/src/pages/quest/QuestList.tsx`에서 카드 렌더 부분을 QuestCard로 교체:

```tsx
// ─── BEFORE (실사 이미지) ───
// <div className="quest-card">
//   <img src={mission.thumbnail_url} alt={mission.title} />
//   <div className="info">...</div>
// </div>

// ─── AFTER (QuestCard 컴포넌트) ───
import QuestCard from '@/components/quest/QuestCard';

{missions.map(mission => (
  <QuestCard
    key={mission.mission_code}
    missionCode={mission.mission_code}
    missionRarity={mission.rarity}
    title={mission.title}
    level={mission.level_required}
    rating={mission.difficulty}
    badges={mission.tags}     // ['어디서나', '나이트 라이더']
    distance={mission.distance_km ? `${mission.distance_km} km` : undefined}
    rewards={{
      xp: mission.reward_xp,
      gp: mission.reward_gp,
      gc: mission.reward_gc,
    }}
    onClick={() => navigate(`/quest/${mission.mission_code}`)}
    variant="list"
  />
))}
```

### Task 4.2: QuestDetail.tsx 교체

```tsx
// ─── BEFORE (상단 실사 hero) ───
// <div className="hero-image">
//   <img src="https://images.unsplash.com/..." />
//   <h1>{mission.title}</h1>
// </div>

// ─── AFTER (QuestCard variant=detail) ───
<QuestCard
  missionCode={mission.mission_code}
  missionRarity={mission.rarity}
  title={mission.title}
  level={mission.level_required}
  rating={mission.difficulty}
  badges={mission.tags}
  distance={mission.distance_km ? `${mission.distance_km} km` : undefined}
  variant="detail"
/>

{/* 조건 + 보상 섹션은 기존 그대로 */}
<section className="conditions">...</section>
<section className="rewards">...</section>
```

### Task 4.3: 홈 화면 미니 카드 (선택)

`frontend/src/pages/Home.jsx` 의 "오늘의 미션" 카드도 QuestCard로 통일:

```tsx
{todayMission && (
  <div className="today-mission-card">
    <QuestCard
      missionCode={todayMission.mission_code}
      missionRarity={todayMission.rarity}
      title={todayMission.title}
      rewards={{
        xp: todayMission.reward_xp,
        gp: todayMission.reward_gp,
      }}
      variant="detail"
      onClick={() => navigate('/quest/' + todayMission.mission_code)}
    />
  </div>
)}
```

---

## §5. Phase 4 — 검수 + 통합 테스트 (2-3시간)

### Task 5.1: 자동 검증

```bash
# 1. SVG sprite 파일 존재 확인
ls -la frontend/public/assets/quest-cards/*.svg
# 기대: 3개 파일 (rider, season, mythic)

# 2. sprite 안의 카드 수
for f in frontend/public/assets/quest-cards/*.svg; do
  echo "$f: $(grep -c '<symbol' $f)"
done
# 기대: rider 12, season 8, mythic 5

# 3. 매핑 테스트 실행
cd frontend && npm test quest-card-map
# 기대: 모든 테스트 통과

# 4. 빌드 확인
npm run build
# 기대: 빌드 통과 + assets/quest-cards/*.svg 가 build output에 포함
```

### Task 5.2: 시각 검수 체크리스트

```
□ /quest 접속 (QuestList)
  □ 모든 카드가 SVG 일러스트 (실사 사진 0개)
  □ RIDING 미션은 라이더 아이콘, COMMUNITY는 그룹 아이콘, MAINT는 도구 아이콘 등
  □ Mythic 미션은 골드 보더 + 강한 글로우
  □ 시즌 미션 (Tết 시즌이면) TET_SEASON 카드 (빨강+골드)

□ /quest/{mission_code} 접속 (QuestDetail)
  □ 상단 hero가 QuestCard variant=detail
  □ 그라데이션 오버레이 위에 제목 + 뱃지 + 보상
  □ 실사 사진 0개

□ / (Home)
  □ "오늘의 미션" 카드가 QuestCard 컴포넌트
  □ 색감이 다른 RPG 화면과 일관

□ 카테고리 시각 구분
  □ RIDING / COMMUNITY / MAINT / MARKET / MIXED / DELIVERY 첫인상에 다름
  □ DAILY vs WEEKLY 컨셉 차이 (있다면)
```

### Task 5.3: 240 미션 매핑 일관성

```bash
# 미션 카탈로그에서 시즌 라벨 분포 확인
psql $DATABASE_URL -c "
  SELECT season_label, COUNT(*) 
  FROM mission_definition 
  WHERE season_label IS NOT NULL
  GROUP BY season_label;
"
# 기대값: 8개 시즌 라벨 (TET, SPRING, SUM, RAIN, INDEP, MID, DRY, XMAS, ANNUAL)
# 각각 SEASON_CARD_MAP에 매핑되어야 함
```

---

## §6. Phase 5 — 마이그레이션 (1-2시간)

### Task 6.1: DB에 mission_card 컬럼 추가 (선택)

매핑이 코드에 있어서 DB 변경은 필수 아님. 그래도 디버깅/유연성을 위해:

`backend/migrations/202605xx_quest_card_mapping.sql`:

```sql
-- 미션에 카드 코드를 명시적으로 저장 (옵션)
-- 코드의 quest-card-map.ts 와 동기화
ALTER TABLE mission_definition 
  ADD COLUMN IF NOT EXISTS quest_card_code VARCHAR(40),
  ADD COLUMN IF NOT EXISTS quest_card_sprite VARCHAR(20) 
    CHECK (quest_card_sprite IN ('rider-sprite', 'season-sprite', 'mythic-sprite'));

-- 기존 미션 자동 매핑 (SQL 버전)
UPDATE mission_definition SET
  quest_card_code = CASE
    WHEN mission_code LIKE 'O-%' THEN 'ONBOARDING'
    WHEN mission_code LIKE 'A-%' THEN 'MIXED_DAILY'
    WHEN mission_code LIKE 'S-TET-%' THEN 'TET_SEASON'
    WHEN mission_code LIKE 'S-SPRING-%' THEN 'HUNG_KINGS_SEASON'
    WHEN mission_code LIKE 'S-SUM-%' THEN 'REUNIFICATION_SEASON'
    WHEN mission_code LIKE 'S-RAIN-%' THEN 'RAIN_SEASON'
    WHEN mission_code LIKE 'S-INDEP-%' THEN 'GHOST_SEASON'
    WHEN mission_code LIKE 'S-MID-%' THEN 'MID_AUTUMN_SEASON'
    WHEN mission_code LIKE 'S-DRY-%' THEN 'SAIGON_BDAY_SEASON'
    WHEN mission_code LIKE 'S-XMAS-%' THEN 'NEW_YEAR_SEASON'
    WHEN mission_code LIKE 'D-RD-%' THEN 'RIDING_DAILY'
    WHEN mission_code LIKE 'W-RD-%' THEN 'RIDING_WEEKLY'
    WHEN mission_code LIKE 'M-RD-%' THEN 'RIDING_MONTHLY'
    WHEN mission_code LIKE 'D-CM-%' THEN 'COMMUNITY_DAILY'
    WHEN mission_code LIKE 'W-CM-%' THEN 'COMMUNITY_WEEKLY'
    WHEN mission_code LIKE 'M-CM-%' THEN 'COMMUNITY_WEEKLY'
    WHEN mission_code LIKE 'D-MT-%' THEN 'MAINT_DAILY'
    WHEN mission_code LIKE 'W-MT-%' THEN 'MAINT_WEEKLY'
    WHEN mission_code LIKE 'M-MT-%' THEN 'MAINT_WEEKLY'
    WHEN mission_code LIKE 'D-MK-%' THEN 'MARKET_DAILY'
    WHEN mission_code LIKE 'W-MK-%' THEN 'MARKET_WEEKLY'
    WHEN mission_code LIKE 'M-MK-%' THEN 'MARKET_WEEKLY'
    WHEN mission_code LIKE '%-DL-%' THEN 'DELIVERY_DAILY'
    WHEN mission_code LIKE '%-MX-%' THEN 'MIXED_DAILY'
    ELSE 'RIDING_DAILY'
  END,
  quest_card_sprite = CASE
    WHEN mission_code LIKE 'S-%' THEN 'season-sprite'
    WHEN rarity = 'M' THEN 'mythic-sprite'
    ELSE 'rider-sprite'
  END
WHERE quest_card_code IS NULL;

-- 검증
SELECT quest_card_sprite, quest_card_code, COUNT(*) 
FROM mission_definition 
GROUP BY 1, 2 
ORDER BY 1, 3 DESC;
```

---

## §7. 작업 순서 (요약)

```
Phase 0 (1-2h):   SVG 추출 스크립트 실행 + 3 sprite 파일 생성
Phase 1 (2-3h):   quest-card-map.ts + 테스트
Phase 2 (3-4h):   QuestCard.tsx + CSS
Phase 3 (3-4h):   QuestList / QuestDetail / Home 교체
Phase 4 (2-3h):   검수 + 시각 테스트
Phase 5 (1-2h):   DB 마이그레이션 (선택)

총 1-2일 (단일 개발자)
```

---

## §8. 코드에게 던질 첫 메시지

```
Saigon Rider 퀘스트 카드 통합 작업 시작.

【디자인 자산】
Skywork에서 받은 3개 HTML 파일 (사용자 검수 완료):
- docs/saigon-quest-cards-rider.html (12 카드)
- docs/saigon-quest-cards-season.html (8 카드)
- docs/saigon-quest-cards-mythic.html (5 카드)

총 25 카드. viewBox 0 0 320 200, 다크 surface 톤.

【작업 지시서】
docs/quest-card-integration-instructions.md (이 문서)

【작업 범위】
1. HTML에서 SVG 25개 추출 → 3개 sprite SVG로 분리
2. quest-card-map.ts 작성 (240 미션 → 25 카드 자동 매핑)
3. QuestCard 컴포넌트 (variant: list/detail/mini)
4. 기존 QuestList.tsx + QuestDetail.tsx + Home의 미션 카드 교체
5. (옵션) DB에 quest_card_code 컬럼 추가

【중요】
- 기존 실사 이미지 (Unsplash 등) 완전 제거 → SVG 일러스트만
- viewBox 320x200 보존 (모든 카드 동일)
- 카드 위에 텍스트(제목/뱃지/보상) 오버레이 = React 책임
- Mythic 미션은 mythic-sprite 사용 + 골드 보더 + 강한 글로우
- 시즌 미션: 우리 시즌 라벨(TET/SPRING/SUM/RAIN/INDEP/MID/DRY/XMAS) → 
  Skywork 카드(TET_SEASON/HUNG_KINGS_SEASON/...) 매핑 (지시서 §2 참고)

위임형 진행. Phase 0부터.
```

---

## §9. 문제 해결 가이드

| 문제 | 해결 |
|---|---|
| `<use>` 가 렌더 안 됨 | sprite SVG에 `<symbol id="card-XXX">` 형식이 맞는지 확인. `<svg>` 대신 `<symbol>` 사용 |
| 카드 viewBox 깨짐 | QuestCard에서 `<svg viewBox="0 0 320 200">` 부모에서 명시. sprite의 symbol은 viewBox 자동 inherit |
| 베트남어 라벨 깨짐 | sprite SVG 파일이 UTF-8로 저장됐는지 확인. `<meta charset="UTF-8">` 추가 권장 |
| Mythic 미션이 일반 카드 사용 | DB의 mission_definition.rarity 값 확인. 'M'이면 QuestCard에 missionRarity='M' 명시적 전달 |
| 시즌 미션 매핑 잘못됨 | SEASON_CARD_MAP에 누락된 라벨 있는지 확인. 기본값 'TET_SEASON' 폴백 |
| 카드가 너무 어두움 | 일러스트는 다크가 의도된 톤. 텍스트 오버레이의 contrast 강화 (font-weight 800, white shadow) |

---

## §10. 한 줄 정리

**"Skywork 25 카드 SVG sprite를 React에 통합. 240개 미션을 자동 매핑. 기존 실사 stock photo 완전 제거. RPG 다크 톤으로 통일. 1-2일 작업."**

이게 v1 출시 디자인 시스템 통합의 마지막 단계입니다.

---

(끝)
