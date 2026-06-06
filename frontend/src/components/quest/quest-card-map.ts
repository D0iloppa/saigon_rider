/**
 * mission_code → 25 카드 sprite 매핑.
 *
 * mission_code 패턴: {window}-{category}-{seq}
 *   window:   O(Onboarding) / D(Daily) / W(Weekly) / M(Monthly) / A(Annual) / S(Season)
 *   category: RD/CM/MT/MK/DL/MX 또는 시즌 라벨(TET/SPRING/SUM/RAIN/INDEP/MID/DRY/XMAS/ANNUAL)
 *   seq:      01-99
 *
 * 시즌 라벨 → Skywork 카드 매핑은 SEASON_CARD_MAP 참조.
 * Mythic 등급(rarity='M')은 mission_code와 무관하게 5개 mythic 카드 중 하나로 강제.
 */

export type QuestCardCategory = 'rider' | 'season' | 'mythic';

export interface QuestCardMeta {
  cardCode: string;
  spriteName: 'rider-sprite' | 'season-sprite' | 'mythic-sprite';
  category: QuestCardCategory;
  href: string;
}

const CATEGORY_MAP: Record<string, string> = {
  RD: 'RIDING',
  CM: 'COMMUNITY',
  MT: 'MAINT',
  MK: 'MARKET',
  DL: 'DELIVERY',
  MX: 'MIXED',
};

const WINDOW_MAP: Record<string, string> = {
  D: 'DAILY',
  W: 'WEEKLY',
  M: 'MONTHLY',
};

const SEASON_CARD_MAP: Record<string, string> = {
  TET: 'TET_SEASON',
  SPRING: 'HUNG_KINGS_SEASON',
  SUM: 'REUNIFICATION_SEASON',
  RAIN: 'RAIN_SEASON',
  INDEP: 'GHOST_SEASON',
  MID: 'MID_AUTUMN_SEASON',
  DRY: 'SAIGON_BDAY_SEASON',
  XMAS: 'NEW_YEAR_SEASON',
  ANNUAL: 'TET_SEASON',
};

export type Rarity = 'C' | 'R' | 'E' | 'L' | 'M';

export function getQuestCard(missionCode: string | null | undefined, rarity?: Rarity | null): QuestCardMeta {
  if (rarity === 'M') {
    return getMythicCard(missionCode ?? '');
  }
  if (!missionCode) {
    return makeRiderCard('RIDING_DAILY');
  }

  const parts = missionCode.split('-');
  const windowChar = parts[0];
  const categoryChar = parts[1] ?? '';

  if (windowChar === 'O') {
    return makeRiderCard('ONBOARDING');
  }
  if (windowChar === 'S') {
    const seasonCard = SEASON_CARD_MAP[categoryChar] ?? 'TET_SEASON';
    return makeSeasonCard(seasonCard);
  }
  if (windowChar === 'A') {
    return makeRiderCard('MIXED_DAILY');
  }

  const category = CATEGORY_MAP[categoryChar] ?? 'MIXED';
  const win = WINDOW_MAP[windowChar] ?? 'DAILY';

  if (categoryChar === 'DL') {
    return makeRiderCard('DELIVERY_DAILY');
  }
  if (categoryChar === 'RD') {
    return makeRiderCard(`RIDING_${win}`);
  }
  // CM/MT/MK/MX: DAILY/WEEKLY 전용, MONTHLY는 WEEKLY 폴백
  const win2 = win === 'MONTHLY' ? 'WEEKLY' : win;
  return makeRiderCard(`${category}_${win2}`);
}

function getMythicCard(missionCode: string): QuestCardMeta {
  const code = missionCode.toUpperCase();
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
  return makeMythicCard('THE_LEGEND_M');
}

function makeRiderCard(cardCode: string): QuestCardMeta {
  return {
    cardCode,
    spriteName: 'rider-sprite',
    category: 'rider',
    href: `#card-${cardCode}`,
  };
}

function makeSeasonCard(cardCode: string): QuestCardMeta {
  return {
    cardCode,
    spriteName: 'season-sprite',
    category: 'season',
    href: `#card-${cardCode}`,
  };
}

function makeMythicCard(cardCode: string): QuestCardMeta {
  return {
    cardCode,
    spriteName: 'mythic-sprite',
    category: 'mythic',
    href: `#card-${cardCode}`,
  };
}

// 카드코드(csv) → 메타. 코드 접미사로 sprite 카테고리 판정.
export function getCardByCode(cardCode: string): QuestCardMeta {
  if (cardCode.endsWith('_M')) return makeMythicCard(cardCode);
  if (cardCode.endsWith('_SEASON')) return makeSeasonCard(cardCode);
  return makeRiderCard(cardCode);
}

// cardCode → 분해된 라벨 키 (i18n용)
export interface CardLabels {
  category: 'RIDING' | 'COMMUNITY' | 'MAINT' | 'MARKET' | 'MIXED' | 'DELIVERY' | 'ONBOARDING' | 'SEASON' | 'MYTHIC';
  window?: 'DAILY' | 'WEEKLY' | 'MONTHLY';
  season?: 'TET' | 'HUNG_KINGS' | 'REUNIFICATION' | 'GHOST' | 'MID_AUTUMN' | 'RAIN' | 'NEW_YEAR' | 'SAIGON_BDAY';
}

export function getCardLabels(cardCode: string, category: QuestCardCategory): CardLabels {
  if (category === 'mythic') {
    return { category: 'MYTHIC' };
  }
  if (category === 'season') {
    const seasonMap: Record<string, CardLabels['season']> = {
      TET_SEASON: 'TET',
      HUNG_KINGS_SEASON: 'HUNG_KINGS',
      REUNIFICATION_SEASON: 'REUNIFICATION',
      GHOST_SEASON: 'GHOST',
      MID_AUTUMN_SEASON: 'MID_AUTUMN',
      RAIN_SEASON: 'RAIN',
      NEW_YEAR_SEASON: 'NEW_YEAR',
      SAIGON_BDAY_SEASON: 'SAIGON_BDAY',
    };
    return { category: 'SEASON', season: seasonMap[cardCode] ?? 'TET' };
  }
  if (cardCode === 'ONBOARDING') {
    return { category: 'ONBOARDING' };
  }
  if (cardCode === 'DELIVERY_DAILY') {
    return { category: 'DELIVERY' };
  }
  // RIDING_DAILY, COMMUNITY_WEEKLY 등
  const parts = cardCode.split('_');
  const cat = parts[0] as CardLabels['category'];
  const win = parts[1] as CardLabels['window'];
  return { category: cat, window: win };
}

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
    'TET_SEASON', 'HUNG_KINGS_SEASON', 'REUNIFICATION_SEASON',
    'GHOST_SEASON', 'MID_AUTUMN_SEASON', 'RAIN_SEASON',
    'NEW_YEAR_SEASON', 'SAIGON_BDAY_SEASON',
  ],
  mythic: [
    'THE_LEGEND_M', 'SAIGON_GHOST_M', 'IRON_PHOENIX_M',
    'STORM_KING_M', 'SAIGON_ANCESTOR_M',
  ],
} as const;
