import type { ItemSlot } from './metadata';

export interface SlotAttachment {
  x: number;
  y: number;
  w: number;
  h: number;
  viewBox: string;
  mirror?: boolean;
}

export interface SlotLayoutEntry {
  slot: ItemSlot;
  zOrder: number;
  points: SlotAttachment[];
}

export const RIDER_VIEWBOX = '0 0 300 400';
export const BIKE_VIEWBOX = '0 0 400 200';

export const RIDER_BASE_SYMBOL = 'item-RIDER_BASE_EMPTY_C_00';
export const BIKE_BASE_SYMBOL = 'item-BIKE_BASE_EMPTY_C_00';

export const RIDER_LAYOUT: SlotLayoutEntry[] = [
  { slot: 'JACKET',  zOrder: 1, points: [{ x: 80,  y: 82,  w: 140, h: 140, viewBox: '0 0 120 120' }] },
  { slot: 'NAME',    zOrder: 2, points: [{ x: 110, y: 125, w: 80,  h: 30,  viewBox: '0 0 100 100' }] },
  { slot: 'EYEWEAR', zOrder: 3, points: [{ x: 115, y: 38,  w: 70,  h: 28,  viewBox: '0 0 100 100' }] },
  { slot: 'GLOVES',  zOrder: 4, points: [
    { x: 49,  y: 243, w: 40, h: 50, viewBox: '0 0 50 100' },
    { x: 211, y: 243, w: 40, h: 50, viewBox: '0 0 50 100', mirror: true },
  ]},
  { slot: 'BOOTS',   zOrder: 5, points: [
    { x: 89,  y: 340, w: 40, h: 60, viewBox: '0 0 50 100' },
    { x: 171, y: 340, w: 40, h: 60, viewBox: '0 0 50 100', mirror: true },
  ]},
  { slot: 'HELMET',  zOrder: 6, points: [{ x: 110, y: 6,   w: 80,  h: 84,  viewBox: '0 0 100 100' }] },
];

export const BIKE_LAYOUT: SlotLayoutEntry[] = [
  { slot: 'BODY',    zOrder: 1, points: [{ x: 80,  y: 60,  w: 240, h: 80,  viewBox: '0 0 240 80' }] },
  { slot: 'ENGINE',  zOrder: 2, points: [{ x: 165, y: 118, w: 60,  h: 40,  viewBox: '0 0 60 40' }] },
  { slot: 'SEAT',    zOrder: 3, points: [{ x: 200, y: 44,  w: 80,  h: 30,  viewBox: '0 0 80 30' }] },
  { slot: 'STICKER', zOrder: 4, points: [{ x: 222, y: 74,  w: 80,  h: 36,  viewBox: '0 0 80 40' }] },
  { slot: 'HANDLE',  zOrder: 5, points: [{ x: 100, y: 60,  w: 60,  h: 20,  viewBox: '0 0 60 20' }] },
  { slot: 'MIRROR',  zOrder: 6, points: [
    { x: 95,  y: 42, w: 25, h: 25, viewBox: '0 0 25 25' },
    { x: 127, y: 42, w: 25, h: 25, viewBox: '0 0 25 25', mirror: true },
  ]},
  { slot: 'LIGHT',   zOrder: 7, points: [{ x: 48,  y: 80,  w: 40,  h: 40,  viewBox: '0 0 40 40' }] },
  { slot: 'TAIL',    zOrder: 8, points: [{ x: 216, y: 136, w: 64,  h: 34,  viewBox: '0 0 30 30' }] },
  { slot: 'NUMBER',  zOrder: 9, points: [{ x: 332, y: 102, w: 46,  h: 22,  viewBox: '0 0 50 30' }] },
];

export const RIDER_SLOTS = RIDER_LAYOUT.map(e => e.slot);
export const BIKE_SLOTS = BIKE_LAYOUT.map(e => e.slot);

/** 좌우 한쌍 심볼 (반절 에셋 + mirror). 카드/상점에서 pair 표시용 */
export const PAIR_SLOTS: ReadonlySet<string> = new Set(['GLOVES', 'BOOTS', 'MIRROR']);
