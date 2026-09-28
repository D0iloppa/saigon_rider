import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const read = (path) => readFileSync(join(here, path), 'utf8');

// F-DM-02(260928) 방 상단 매물바 다:다 아코디언 계약 —
// (1) 'card' 와 'walkie_invite' 메시지는 같은 CardBubble 렌더 셸을 공유한다.
// (2) "외 N건" 토글은 in-flow 아코디언(바텀시트 아님)이고, 거래중이 먼저 온다(서버 정렬을 그대로 씀).
// (3) 대표 매물(선택) 은 로컬 상태이고, 예약중(타인) 행은 약속잡기가 막힌다.
// (4) 카드전송 helper 는 title/price 를 클라이언트가 보내지 않는다(서버 스냅샷 신뢰).

test('card and walkie_invite messages both render through CardBubble', () => {
  const detail = read('DmDetail.tsx');
  assert.match(detail, /import \{ CardBubble \} from '@\/components\/dm\/CardBubble';/);
  assert.match(detail, /m\.messageType === 'card' && m\.meta\?\.subtype === 'item'/);
  assert.match(detail, /<CardBubble[\s\S]*?subtype="item"/);
  assert.match(detail, /m\.messageType === 'walkie_invite'/);
  assert.match(detail, /<CardBubble[\s\S]*?subtype="walkie"/);
});

test('the listing bar accordion is in-flow (not a BottomSheet) and toggled by a chevron', () => {
  const detail = read('DmDetail.tsx');
  assert.match(detail, /listingBarExpanded && convListings\.length > 1/);
  assert.match(detail, /setListingBarExpanded/);
  assert.match(detail, /otherListingsCount/);
  // 아코디언은 BottomSheet 컴포넌트를 쓰지 않는다 — 이 블록 근방에 BottomSheet 참조가 없어야 한다
  const accordionBlockStart = detail.indexOf('listingAccordion');
  const accordionBlockEnd = detail.indexOf('listingAccordion', accordionBlockStart + 1);
  const block = detail.slice(accordionBlockStart, accordionBlockEnd > -1 ? accordionBlockEnd + 400 : accordionBlockStart + 2000);
  assert.doesNotMatch(block, /<BottomSheet/);
});

test('selected listing (representative) is local state, and reserved-by-other blocks the appointment chip', () => {
  const detail = read('DmDetail.tsx');
  assert.match(detail, /const \[selectedListingId, setSelectedListingId\] = useState<string \| null>/);
  assert.match(detail, /setSelectedListingId\(it\.id\)/);
  assert.match(detail, /!selectedListing\?\.reservedByOther/);
});

test('sendListingCard does not send title/price — server re-fetches the listing snapshot', () => {
  const apiDm = read('../../api/dm.ts');
  const fn = apiDm.slice(apiDm.indexOf('export async function sendListingCard'));
  const body = fn.slice(0, fn.indexOf('\n}'));
  assert.doesNotMatch(body, /title/);
  assert.doesNotMatch(body, /priceVnd/);
  assert.match(body, /subtype: 'item', listingId/);
});

test('multi-listing strings exist in all three locales', () => {
  for (const loc of ['ko', 'en', 'vi']) {
    const json = JSON.parse(read(`../../locales/${loc}/translation.json`));
    for (const key of [
      'otherListingsCount',
      'stageInProgress',
      'stageInquiry',
      'stageReservedByOther',
      'sendListingCard',
      'cardItemLabel',
      'cardItemButton',
      'cardWalkieLabel',
    ]) {
      assert.ok(json.dm[key], `${loc} is missing dm.${key}`);
    }
  }
});
