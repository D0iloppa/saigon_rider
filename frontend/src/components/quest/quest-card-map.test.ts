import { describe, it, expect } from 'vitest';
import { getQuestCard, ALL_QUEST_CARDS } from './quest-card-map';

describe('quest-card-map', () => {
  describe('RIDER', () => {
    it('D-RD-01 → RIDING_DAILY', () => {
      expect(getQuestCard('D-RD-01').cardCode).toBe('RIDING_DAILY');
    });
    it('W-CM-05 → COMMUNITY_WEEKLY', () => {
      expect(getQuestCard('W-CM-05').cardCode).toBe('COMMUNITY_WEEKLY');
    });
    it('M-MT-01 → MAINT_WEEKLY (MONTHLY 폴백)', () => {
      expect(getQuestCard('M-MT-01').cardCode).toBe('MAINT_WEEKLY');
    });
    it('M-RD-01 → RIDING_MONTHLY (전용 카드)', () => {
      expect(getQuestCard('M-RD-01').cardCode).toBe('RIDING_MONTHLY');
    });
    it('O-* → ONBOARDING', () => {
      expect(getQuestCard('O-RD-01').cardCode).toBe('ONBOARDING');
      expect(getQuestCard('O-MX-15').cardCode).toBe('ONBOARDING');
    });
    it('A-* → MIXED_DAILY', () => {
      expect(getQuestCard('A-MX-01').cardCode).toBe('MIXED_DAILY');
    });
    it('DL → DELIVERY_DAILY (window 무관)', () => {
      expect(getQuestCard('W-DL-03').cardCode).toBe('DELIVERY_DAILY');
      expect(getQuestCard('M-DL-01').cardCode).toBe('DELIVERY_DAILY');
    });
  });

  describe('SEASON', () => {
    it.each([
      ['S-TET-01', 'TET_SEASON'],
      ['S-SPRING-01', 'HUNG_KINGS_SEASON'],
      ['S-SUM-01', 'REUNIFICATION_SEASON'],
      ['S-RAIN-01', 'RAIN_SEASON'],
      ['S-INDEP-01', 'GHOST_SEASON'],
      ['S-MID-01', 'MID_AUTUMN_SEASON'],
      ['S-DRY-01', 'SAIGON_BDAY_SEASON'],
      ['S-XMAS-01', 'NEW_YEAR_SEASON'],
    ])('%s → %s', (code, expected) => {
      const r = getQuestCard(code);
      expect(r.cardCode).toBe(expected);
      expect(r.category).toBe('season');
    });
  });

  describe('MYTHIC', () => {
    it('rarity=M → mythic 카테고리', () => {
      expect(getQuestCard('S-TET-08', 'M').category).toBe('mythic');
    });
    it('GHOST 키워드 → SAIGON_GHOST_M', () => {
      expect(getQuestCard('M-GHOST-01', 'M').cardCode).toBe('SAIGON_GHOST_M');
    });
    it('STORM/RAIN 키워드 → STORM_KING_M', () => {
      expect(getQuestCard('M-STORM-01', 'M').cardCode).toBe('STORM_KING_M');
    });
    it('일반 Mythic → THE_LEGEND_M', () => {
      expect(getQuestCard('A-MX-01', 'M').cardCode).toBe('THE_LEGEND_M');
    });
  });

  describe('폴백', () => {
    it('null/undefined → RIDING_DAILY', () => {
      expect(getQuestCard(null).cardCode).toBe('RIDING_DAILY');
      expect(getQuestCard(undefined).cardCode).toBe('RIDING_DAILY');
    });
    it('알 수 없는 시즌 라벨 → TET_SEASON 폴백', () => {
      expect(getQuestCard('S-UNKNOWN-01').cardCode).toBe('TET_SEASON');
    });
  });

  describe('카드 ID 일관성', () => {
    it('모든 반환 cardCode 가 ALL_QUEST_CARDS 안에 있음', () => {
      const all = [
        ...ALL_QUEST_CARDS.rider,
        ...ALL_QUEST_CARDS.season,
        ...ALL_QUEST_CARDS.mythic,
      ];
      const probes = [
        'O-RD-01', 'D-RD-01', 'W-CM-05', 'M-MT-01', 'A-MX-01',
        'S-TET-01', 'S-SPRING-03', 'S-XMAS-02',
        'W-DL-01', 'D-MK-02', 'M-RD-04',
      ];
      for (const c of probes) {
        expect(all).toContain(getQuestCard(c).cardCode);
      }
    });
  });
});
