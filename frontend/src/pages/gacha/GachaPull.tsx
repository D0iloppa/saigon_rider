import { useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { pullGacha, fetchGachaPity } from '@/api/gacha';
import type { PulledItem, GachaPullResult, ItemRarity } from '@/api/gacha';
import { ItemSvgRenderer } from '@/components/ui/items/ItemSvgRenderer';
import { ItemName } from '@/components/ui/items/ItemName';
import { MythicCardOverlay } from '@/components/ui/items/MythicCardOverlay';
import { ItemSparkle } from '@/components/ui/items/ItemSparkle';
import { ConfettiLayer, RarityChip, GachaCardBack } from '@/components/game';
import s from './GachaPull.module.css';

const PULL_QUOTE_KEYS: Record<ItemRarity, string> = {
  M: 'gachaPull.quote_M',
  L: 'gachaPull.quote_L',
  E: 'gachaPull.quote_E',
  R: 'gachaPull.quote_R',
  C: 'gachaPull.quote_C',
};

function bestRarity(items: PulledItem[]): ItemRarity {
  const order: ItemRarity[] = ['M', 'L', 'E', 'R', 'C'];
  for (const r of order) {
    if (items.some((i) => i.rarity === r)) return r;
  }
  return 'C';
}


interface PullCardProps {
  item: PulledItem;
  single?: boolean;
  spotlight?: boolean;
  highlight?: boolean;
}

function PullCard({ item, single, spotlight, highlight }: PullCardProps) {
  const cardCls = [
    s.pullCard,
    single ? s.pullCard1 : '',
    spotlight ? s.pullCardSpotlight : '',
    highlight ? s.pullCardHighlight : '',
  ].filter(Boolean).join(' ');

  return (
    <div
      className={`${cardCls} rarity-card`}
      data-r={item.rarity}
      style={{ position: 'relative', overflow: 'visible' }}
    >
      {item.rarity === 'M' && <MythicCardOverlay />}
      {item.rarity === 'L' && (
        <>
          <ItemSparkle style={{ top: '8%', left: '15%' }} delay={0} color="#FFB800" size={5} />
          <ItemSparkle style={{ top: '12%', right: '10%' }} delay={0.3} color="#00F0FF" size={4} />
          <ItemSparkle style={{ bottom: '18%', left: '8%' }} delay={0.6} color="#FFB800" size={6} />
          <ItemSparkle style={{ bottom: '14%', right: '12%' }} delay={0.9} color="#B65EFF" size={5} />
        </>
      )}
      <ItemSvgRenderer itemCode={item.item_code} size={single ? 96 : 52} rarity={item.rarity} />
      <div className={s.pullCardName}><ItemName code={item.item_code} fallback={item.item_name} /></div>
      <RarityChip rarity={item.rarity} style={{ fontSize: 7, marginTop: 2 }} />
    </div>
  );
}

export default function GachaPull() {
  const { gachaCode } = useParams<{ gachaCode: string }>();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const { t } = useTranslation();
  const is10 = searchParams.get('is10') === 'true';

  const [result, setResult] = useState<GachaPullResult | null>(null);
  const [pityAfter, setPityAfter] = useState<number | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const didPull = useRef(false);

  useEffect(() => {
    if (!gachaCode || didPull.current) return;
    didPull.current = true;

    pullGacha(gachaCode, is10)
      .then((r) => {
        setResult(r);
        return fetchGachaPity(gachaCode);
      })
      .then((p) => {
        if (p) setPityAfter(p.pull_count);
      })
      .catch((e: Error) => {
        const msg = e?.message ?? '';
        const balanceMatch = msg.match(/insufficient (?:GP|GC|GOLD|XP) balance: have (\d+), need (\d+)/i);
        if (balanceMatch) {
          setErrorMsg(t('gacha.error_insufficient_balance', { have: balanceMatch[1], need: balanceMatch[2] }));
        } else {
          setErrorMsg(t('common.errorUnexpected'));
        }
      });
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  if (errorMsg) {
    return (
      <div className={s.page}>
        <div className={s.loadingWrap}>
          <p style={{ color: 'rgba(255,255,255,.6)', fontSize: 14 }}>
            {errorMsg}
          </p>
          <button
            onClick={() => navigate(-1)}
            style={{ marginTop: 12, color: 'rgba(255,255,255,.5)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}
          >
            {t('common.back')}
          </button>
        </div>
      </div>
    );
  }

  if (!result) {
    return (
      <div className={s.page}>
        <div className={s.bgGlow} />
        <div className={s.loadingWrap}>
          <GachaCardBack />
          <div className={s.loadingText}>SUMMONING…</div>
        </div>
      </div>
    );
  }

  const { items, new_pity_count, pity_hard_ceiling } = result as GachaPullResult & { pity_hard_ceiling?: number };
  const best = bestRarity(items);
  const hasMythic = items.some((i) => i.rarity === 'M');
  const hasLegend = items.some((i) => i.rarity === 'L');
  const showConfetti = hasMythic || hasLegend;

  const breakdown: Partial<Record<ItemRarity, number>> = {};
  for (const item of items) {
    breakdown[item.rarity] = (breakdown[item.rarity] ?? 0) + 1;
  }

  const ceiling = pity_hard_ceiling ?? 100;
  const pityCount = pityAfter ?? new_pity_count;
  const pityPct = ceiling > 0 ? Math.min((pityCount / ceiling) * 100, 100) : 0;

  const spotlightIdx = items.findIndex((i) => i.rarity === best);

  return (
    <div className={s.page}>
      <div className={s.bgGlow} />

      {showConfetti && <ConfettiLayer className={s.confettiLayer} />}

      {/* Top label */}
      <div className={s.topLabel}>
        <div className={s.pullType}>{is10 ? '10-PULL' : '1-PULL'}</div>
        <div className={s.pullMeta}>{gachaCode?.replace('_', ' ')}</div>
      </div>

      {/* Cards */}
      <div className={s.cardsArea}>
        {is10 ? (
          <div className={s.grid10}>
            {items.map((item, i) => (
              <PullCard
                key={i}
                item={item}
                spotlight={i === spotlightIdx && (best === 'M' || best === 'L')}
                highlight={item.rarity === 'L' || item.rarity === 'M'}
              />
            ))}
          </div>
        ) : (
          <div className={s.grid1}>
            <PullCard item={items[0]} single spotlight={best === 'M' || best === 'L'} />
          </div>
        )}
      </div>

      {/* Result sheet */}
      <div className={s.sheet}>
        <div className={s.sheetLabel}>PULL RESULT</div>

        {/* Rarity breakdown chips */}
        <div className={s.breakdown}>
          {(['M', 'L', 'E', 'R', 'C'] as ItemRarity[]).map((r) =>
            breakdown[r] ? (
              <RarityChip key={r} rarity={r} count={breakdown[r]} style={{ fontSize: 11 }} />
            ) : null,
          )}
        </div>

        {/* Quote */}
        <div className={s.quote}>"{t(PULL_QUOTE_KEYS[best])}"</div>

        {/* Pity reset bar */}
        {ceiling > 0 && (
          <div className={s.pityResetRow}>
            <span className={s.pityResetLabel}>{t('gachaPull.ceiling')}</span>
            <div className={s.pityResetBar}>
              <div className={s.pityResetFill} style={{ width: `${pityPct}%` }} />
            </div>
            <span className={s.pityResetCount}>{pityCount} / {ceiling}</span>
          </div>
        )}

        {/* Actions */}
        <div className={s.actionRow}>
          <button
            className={s.btnAgain}
            onClick={() => {
              didPull.current = false;
              setResult(null);
              setPityAfter(null);
              setErrorMsg(null);
            }}
          >
            {is10 ? t('gachaPull.again_ten') : t('gachaPull.again_single')}
          </button>
          <button
            className={s.btnInventory}
            onClick={() => navigate('/inventory')}
          >
            {t('gachaPull.to_inventory')}
          </button>
          <button
            className={s.btnInventory}
            onClick={() => navigate('/gacha')}
            style={{ flex: 0.6 }}
          >
            {t('gachaPull.to_list')}
          </button>
        </div>
      </div>
    </div>
  );
}
