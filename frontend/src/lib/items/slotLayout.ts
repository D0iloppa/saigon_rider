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
  // SGR-201: PANTS = 허리~발목. 다리 중심선 x120/180 정렬, 세로 확대로 발목까지 연장. 최하층(배열 맨 앞)이라 KNEE·BOOTS 가 위에 렌더됨
  { slot: 'PANTS',   zOrder: 0, points: [{ x: 68, y: 224, w: 164, h: 159, viewBox: '0 0 120 130' }] },
  // 소매 포함: viewBox 좌우(-30..150)·하단(0..150) 확장. 본체는 동일 위치, 여백에 소매 렌더
  { slot: 'JACKET',  zOrder: 1, points: [{ x: 45,  y: 82,  w: 210, h: 175, viewBox: '0 0 180 150' }] },
  { slot: 'NAME',    zOrder: 2, points: [{ x: 110, y: 125, w: 80,  h: 30,  viewBox: '0 0 100 100' }] },
  { slot: 'EYEWEAR', zOrder: 3, points: [{ x: 115, y: 38,  w: 70,  h: 28,  viewBox: '0 0 100 100' }] },
  { slot: 'GLOVES',  zOrder: 4, points: [
    { x: 49,  y: 243, w: 40, h: 50, viewBox: '0 0 50 100' },
    { x: 211, y: 243, w: 40, h: 50, viewBox: '0 0 50 100', mirror: true },
  ]},
  { slot: 'BOOTS',   zOrder: 5, points: [
    { x: 103, y: 346, w: 48, h: 64, viewBox: '0 0 50 100' },
    { x: 149, y: 346, w: 48, h: 64, viewBox: '0 0 50 100', mirror: true },
  ]},
  // SGR-201: KNEE = 좌우 무릎(중심 x120/180, y~340) pair. PANTS·BOOTS 위에 올라오도록 BOOTS 뒤(상층) 배치
  { slot: 'KNEE',    zOrder: 7, points: [
    { x: 103, y: 322, w: 34, h: 34, viewBox: '0 0 50 50' },
    { x: 163, y: 322, w: 34, h: 34, viewBox: '0 0 50 50', mirror: true },
  ]},
  { slot: 'HELMET',  zOrder: 8, points: [{ x: 110, y: 6,   w: 80,  h: 84,  viewBox: '0 0 100 100' }] },
];

export const BIKE_LAYOUT: SlotLayoutEntry[] = [
  { slot: 'BODY',    zOrder: 1, points: [{ x: 80,  y: 60,  w: 240, h: 80,  viewBox: '0 0 240 80' }] },
  { slot: 'ENGINE',  zOrder: 2, points: [{ x: 165, y: 118, w: 60,  h: 40,  viewBox: '0 0 60 40' }] },
  { slot: 'SEAT',    zOrder: 3, points: [{ x: 192, y: 41,  w: 96,  h: 36,  viewBox: '0 0 80 30' }] },
  { slot: 'STICKER', zOrder: 4, points: [{ x: 222, y: 74,  w: 80,  h: 36,  viewBox: '0 0 80 40' }] },
  { slot: 'HANDLE',  zOrder: 5, points: [{ x: 80,  y: 16,  w: 60,  h: 20,  viewBox: '0 0 60 20' }] },
  { slot: 'MIRROR',  zOrder: 6, points: [
    { x: 76,  y: 6,  w: 25, h: 25, viewBox: '0 0 25 25' },
    { x: 118, y: 6,  w: 25, h: 25, viewBox: '0 0 25 25', mirror: true },
  ]},
  { slot: 'LIGHT',   zOrder: 7, points: [{ x: 48,  y: 80,  w: 40,  h: 40,  viewBox: '0 0 40 40' }] },
  { slot: 'TAIL',    zOrder: 8, points: [{ x: 216, y: 136, w: 64,  h: 34,  viewBox: '0 0 30 30' }] },
  { slot: 'NUMBER',  zOrder: 9, points: [{ x: 330, y: 100, w: 46,  h: 22,  viewBox: '0 0 50 30' }] },
  // SGR-201: WHEEL = 전륜(cx82)+후륜(cx315) 동시 렌더, base 휠 r34 (cx-34, cy-34 기준 68×68). 장착 시 회전 효과(BikeComposite)
  { slot: 'WHEEL',   zOrder: 0, points: [
    { x: 48,  y: 128, w: 68, h: 68, viewBox: '0 0 68 68' },
    { x: 281, y: 128, w: 68, h: 68, viewBox: '0 0 68 68' },
  ]},
];

export const RIDER_SLOTS = RIDER_LAYOUT.map(e => e.slot);
export const BIKE_SLOTS = BIKE_LAYOUT.map(e => e.slot);

/** 좌우 한쌍 심볼 (반절 에셋 + mirror). 카드/상점에서 pair 표시용 */
export const PAIR_SLOTS: ReadonlySet<string> = new Set(['GLOVES', 'BOOTS', 'MIRROR', 'KNEE', 'WHEEL']);
