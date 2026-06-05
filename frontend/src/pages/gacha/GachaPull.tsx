import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { pullGacha, fetchGachaPity } from '@/api/gacha';
import type { PulledItem, GachaPullResult, ItemRarity } from '@/api/gacha';
import { ItemSvgRenderer } from '@/components/ui/items/ItemSvgRenderer';
import { ItemName } from '@/components/ui/items/ItemName';
import { MythicCardOverlay } from '@/components/ui/items/MythicCardOverlay';
import { ItemSparkle } from '@/components/ui/items/ItemSparkle';
import { ConfettiLayer, RarityChip } from '@/components/game';
import { native } from '@/lib/native';
import s from './GachaPull.module.css';

// ── 시네마틱 연출 타이밍(ms) ──
const MIN_CHARGE_MS = 1900;          // 오브 차징 최소 시간
const TEASE_AFTER_RESULT_MS = 750;   // 결과 도착 후 레어도색 떡밥 노출(빠른 응답 시)
const FLASH_MS = 340;                // 화이트 플래시
const CARD_STAGGER_MS = 140;         // 카드 순차 등장 간격
const REVEAL_BUFFER_MS = 650;        // 마지막 카드 등장 후 결과 시트까지 여유

type GachaPhase = 'charging' | 'flash' | 'reveal' | 'result';

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
  const [phase, setPhase] = useState<GachaPhase>('charging');
  const pulledKey = useRef<string | null>(null);
  const timersRef = useRef<ReturnType<typeof setTimeout>[]>([]);
  const skipRef = useRef(false);

  const clearTimers = () => {
    timersRef.current.forEach(clearTimeout);
    timersRef.current = [];
  };
  const addTimer = (fn: () => void, ms: number) => {
    const id = setTimeout(fn, ms);
    timersRef.current.push(id);
  };
  const haptic = (style: 'light' | 'medium' | 'heavy') => {
    try { native.haptic(style); } catch { /* 브라우저/미설치 환경 noop */ }
  };

  const runPull = useCallback(() => {
    if (!gachaCode) return;
    clearTimers();
    skipRef.current = false;
    setResult(null);
    setPityAfter(null);
    setErrorMsg(null);
    setPhase('charging');
    haptic('light'); // 차징 시작

    const startedAt = Date.now();
    addTimer(() => setErrorMsg(t('common.errorUnexpected')), 15000);

    pullGacha(gachaCode, is10)
      .then((r) => {
        clearTimers();
        setResult(r);
        fetchGachaPity(gachaCode)
          .then((p) => { if (p) setPityAfter(p.pull_count); })
          .catch(() => {});

        // 사용자가 차징 중 SKIP 했으면 즉시 결과로
        if (skipRef.current) { setPhase('result'); return; }

        const best = bestRarity(r.items);
        const isHigh = best === 'M' || best === 'L';
        // 응답이 빨라도 차징 연출 유지(순식간 통과 방지) + 결과 도착 후 레어도 떡밥 노출
        const chargeRemain = Math.max(MIN_CHARGE_MS - (Date.now() - startedAt), TEASE_AFTER_RESULT_MS);

        // charging → flash → reveal → result
        addTimer(() => {
          if (skipRef.current) return;
          haptic(isHigh ? 'heavy' : 'medium'); // 터지는 순간
          setPhase('flash');
          addTimer(() => {
            if (skipRef.current) return;
            setPhase('reveal');
            const revealDur = r.items.length * CARD_STAGGER_MS + REVEAL_BUFFER_MS;
            addTimer(() => { if (!skipRef.current) setPhase('result'); }, revealDur);
          }, FLASH_MS);
        }, chargeRemain);
      })
      .catch((e: any) => {
        clearTimers();
        const msg = e?.message ?? String(e);
        const balanceMatch = msg.match(/insufficient (?:GP|GC|GOLD|XP) balance: have (\d+), need (\d+)/i);
        if (balanceMatch) {
          setErrorMsg(t('gacha.error_insufficient_balance', { have: balanceMatch[1], need: balanceMatch[2] }));
        } else {
          setErrorMsg(msg || t('common.errorUnexpected'));
        }
      });
  }, [gachaCode, is10, t]);

  useEffect(() => {
    const key = `${gachaCode}-${is10}`;
    if (pulledKey.current === key) return;
    pulledKey.current = key;
    runPull();
    return () => { clearTimers(); };
  }, [runPull, gachaCode, is10]);

  // 연출 생략 — 진행 중인 모든 타이머를 끄고 바로 결과로
  const handleSkip = () => {
    skipRef.current = true;
    clearTimers();
    haptic('light');
    if (result) setPhase('result'); // 결과 미도착이면 도착 즉시 result (위 then의 skipRef 분기)
  };

  if (errorMsg) {
    return (
      <div className={s.page}>
        <div className={s.loadingWrap}>
          <p style={{ color: 'var(--text-2)', fontSize: 14 }}>
            {errorMsg}
          </p>
          <button
            onClick={() => navigate(-1)}
            style={{ marginTop: 12, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', fontSize: 13 }}
          >
            {t('common.back')}
          </button>
        </div>
      </div>
    );
  }

  const items = result?.items ?? [];
  const best = items.length ? bestRarity(items) : 'C';
  const hasMythic = items.some((i) => i.rarity === 'M');
  const hasLegend = items.some((i) => i.rarity === 'L');
  const isHigh = best === 'M' || best === 'L';
  const showConfetti = hasMythic || hasLegend;
  const tease = result ? best : null; // 차징 글로우 색(레어도 떡밥)

  const breakdown: Partial<Record<ItemRarity, number>> = {};
  for (const item of items) {
    breakdown[item.rarity] = (breakdown[item.rarity] ?? 0) + 1;
  }

  const ceiling = (result as (GachaPullResult & { pity_hard_ceiling?: number }) | null)?.pity_hard_ceiling ?? 100;
  const pityCount = pityAfter ?? result?.new_pity_count ?? 0;
  const pityPct = ceiling > 0 ? Math.min((pityCount / ceiling) * 100, 100) : 0;
  const spotlightIdx = items.findIndex((i) => i.rarity === best);

  const inCharge = phase === 'charging' || phase === 'flash';
  const inReveal = phase === 'reveal' || phase === 'result';

  return (
    <div className={s.page} data-phase={phase} data-tease={tease ?? undefined}>
      <div className={s.bgGlow} />
      {inReveal && isHigh && <div className={s.bgRays} />}
      {showConfetti && inReveal && <ConfettiLayer className={s.confettiLayer} />}

      {/* SKIP — 결과 화면 외 모든 단계에서 노출 */}
      {phase !== 'result' && (
        <button className={s.skipBtn} onClick={handleSkip}>{t('common.skip')} ›</button>
      )}

      {/* 차징 오브 */}
      {inCharge && (
        <div className={s.chargeWrap} data-tease={tease ?? undefined}>
          <div className={s.beam} />
          <div className={s.orbStage}>
            <div className={s.orbGlow} />
            <div className={s.orb} />
            <div className={s.orbRing} />
            <div className={s.orbRing2} />
          </div>
          <div className={s.chargeText}>{tease ? (isHigh ? '!!!' : '!') : t('gachaPull.summoning')}</div>
        </div>
      )}

      {/* 화이트 플래시 */}
      {phase === 'flash' && <div className={s.flash} />}

      {/* M등급 풀스크린 신화 연출 */}
      {hasMythic && inReveal && <div className={s.mythicFull} />}

      {/* 카드 + 결과 시트 */}
      {inReveal && result && (
        <>
          <div className={s.topLabel}>
            <div className={s.pullType}>{is10 ? t('gachaPull.pull_ten') : t('gachaPull.pull_single')}</div>
            <div className={s.pullMeta}>{gachaCode?.replace('_', ' ')}</div>
          </div>

          <div className={s.cardsArea}>
            {is10 ? (
              <div className={s.grid10}>
                {items.map((item, i) => (
                  <div
                    key={i}
                    className={phase === 'reveal' ? s.cardEnter : ''}
                    style={phase === 'reveal' ? { animationDelay: `${i * CARD_STAGGER_MS}ms` } : undefined}
                  >
                    <PullCard
                      item={item}
                      spotlight={i === spotlightIdx && isHigh}
                      highlight={item.rarity === 'L' || item.rarity === 'M'}
                    />
                  </div>
                ))}
              </div>
            ) : (
              <div className={s.grid1}>
                <div className={phase === 'reveal' ? s.cardEnter : ''}>
                  <PullCard item={items[0]} single spotlight={isHigh} />
                </div>
              </div>
            )}
          </div>

          {/* 결과 시트 — result 단계에서만 슬라이드업 */}
          {phase === 'result' && (
            <div className={s.sheet}>
              <div className={s.sheetLabel}>{t('gachaPull.pull_result')}</div>

              <div className={s.breakdown}>
                {(['M', 'L', 'E', 'R', 'C'] as ItemRarity[]).map((r) =>
                  breakdown[r] ? (
                    <RarityChip key={r} rarity={r} count={breakdown[r]} style={{ fontSize: 11 }} />
                  ) : null,
                )}
              </div>

              <div className={s.quote}>"{t(PULL_QUOTE_KEYS[best])}"</div>

              {ceiling > 0 && (
                <div className={s.pityResetRow}>
                  <span className={s.pityResetLabel}>{t('gachaPull.ceiling')}</span>
                  <div className={s.pityResetBar}>
                    <div className={s.pityResetFill} style={{ width: `${pityPct}%` }} />
                  </div>
                  <span className={s.pityResetCount}>{pityCount} / {ceiling}</span>
                </div>
              )}

              <div className={s.actionRow}>
                <button className={s.btnAgain} onClick={() => runPull()}>
                  {is10 ? t('gachaPull.again_ten') : t('gachaPull.again_single')}
                </button>
                <button className={s.btnInventory} onClick={() => navigate('/inventory')}>
                  {t('gachaPull.to_inventory')}
                </button>
                <button className={s.btnInventory} onClick={() => navigate('/gacha')} style={{ flex: 0.6 }}>
                  {t('gachaPull.to_list')}
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
