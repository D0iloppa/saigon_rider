import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchGachaList, fetchGachaPity } from '@/api/gacha';
import type { GachaDefinition, GachaPity } from '@/api/gacha';
import { fetchWallet } from '@/api/wallet';
import type { WalletBalance } from '@/api/wallet';
import { emojiUrl } from '@/lib/emoji';
import { PityBar } from '@/components/game';
import { AlertDialog } from '@/components/ui/AlertDialog';
import styles from './GachaMain.module.css';

function GifIcon({ code, size = 44 }: { code: string; size?: number }) {
  return (
    <img
      src={emojiUrl(code)}
      width={size} height={size} alt=""
      className={styles.cardIcon}
      onError={(e) => { e.currentTarget.style.display = 'none'; }}
    />
  );
}

const GACHA_ICON: Record<string, string> = {
  GARAGE_NORMAL:  '1f4e6',
  GARAGE_PREMIUM: '1f48e',
  CRYSTAL:        '1f48e',
  TET_SEASON:     '1f3ee',
  LEGEND:         '1f3c6',
};

const SEGMENT_KEYS = ['전체', 'GOLD', 'XP', '시즌'] as const;
type Segment = typeof SEGMENT_KEYS[number];

function matchesSegment(g: GachaDefinition, seg: Segment): boolean {
  if (seg === '전체') return true;
  if (seg === 'GOLD') return g.gacha_type === 'GOLD';
  if (seg === 'XP') return g.gacha_type === 'XP';
  if (seg === '시즌') return g.gacha_type === 'SEASON';
  return true;
}

function cardClass(g: GachaDefinition, s: typeof styles): string {
  switch (g.code) {
    case 'GARAGE_NORMAL':  return `${s.gachaCard} ${s.cardGpNormal}`;
    case 'GARAGE_PREMIUM': return `${s.gachaCard} ${s.cardGpPremium}`;
    case 'CRYSTAL':        return `${s.gachaCard} ${s.cardGcCrystal}`;
    case 'TET_SEASON':     return `${s.gachaCard} ${s.cardSeason}`;
    case 'LEGEND':         return `${s.gachaCard} ${s.cardLegend}`;
    default:               return `${s.gachaCard} ${s.cardGpNormal}`;
  }
}

function GachaPityBar({ pity, dark }: { pity: GachaPity; dark?: boolean }) {
  return (
    <PityBar
      current={pity.pull_count}
      ceiling={pity.pity_hard_ceiling}
      dark={dark}
      className={styles.pitySection}
    />
  );
}

export default function GachaMain() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [gachaList, setGachaList] = useState<GachaDefinition[]>([]);
  const [pityMap, setPityMap] = useState<Record<string, GachaPity>>({});
  const [wallet, setWallet] = useState<WalletBalance | null>(null);
  const [segment, setSegment] = useState<Segment>('전체');
  const [loading, setLoading] = useState(true);
  const [insufficientDialog, setInsufficientDialog] = useState<{
    currency: string; have: number; need: number;
  } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [list, walletData] = await Promise.all([fetchGachaList(), fetchWallet()]);
      setWallet(walletData);
      setGachaList(list);
      const entries = await Promise.allSettled(
        list
          .filter((g) => g.pity_hard_ceiling > 0)
          .map(async (g) => {
            const pity = await fetchGachaPity(g.code);
            return pity ? ([g.code, pity] as const) : null;
          }),
      );
      const map: Record<string, GachaPity> = {};
      for (const r of entries) {
        if (r.status === 'fulfilled' && r.value) {
          const [code, pity] = r.value;
          map[code] = pity;
        }
      }
      setPityMap(map);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const filtered = gachaList.filter((g) => matchesSegment(g, segment));
  const isLegend = (g: GachaDefinition) => g.code === 'LEGEND';
  const isGcCrystal = (g: GachaDefinition) => g.code === 'CRYSTAL';
  const isSeasonLimited = (g: GachaDefinition) => g.gacha_type === 'SEASON';

  return (
    <div className={styles.page}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerBg} />
        <button className={styles.headerBack} onClick={() => navigate(-1)}>←</button>
        <div className={styles.headerTitle}>GACHA</div>
        <div className={styles.headerBalance}>
          <div className={`${styles.headerBalanceRow} ${styles.headerBalanceGp}`}>
            GOLD {wallet ? wallet.gold_balance.toLocaleString() : '—'}
          </div>
          <div className={`${styles.headerBalanceRow} ${styles.headerBalanceGc}`}>
            XP {wallet ? wallet.xp_balance.toLocaleString() : '—'}
          </div>
        </div>
      </div>

      {/* Segment */}
      <div className={styles.segment}>
        {SEGMENT_KEYS.map((seg) => (
          <button
            key={seg}
            className={`${styles.segBtn} ${segment === seg ? styles.active : ''}`}
            onClick={() => setSegment(seg)}
          >
            {seg}
          </button>
        ))}
      </div>

      {/* Gacha Cards */}
      <div className={styles.body}>
        {loading ? (
          <div style={{ color: 'rgba(255,255,255,.4)', textAlign: 'center', paddingTop: 48, fontSize: 14 }}>
            {t('common.loading')}
          </div>
        ) : (
          filtered.map((g) => {
            const pity = pityMap[g.code];
            const dark = isLegend(g);
            const gcStyle = isGcCrystal(g);
            const season = isSeasonLimited(g);

            return (
              <div key={g.code} className={cardClass(g, styles)} style={{ position: 'relative' }}>
                {g.limited_label && (
                  <span className={styles.limitedBadge}>{g.limited_label}</span>
                )}

                <div className={styles.cardRow}>
                  <GifIcon
                    code={GACHA_ICON[g.code] ?? '1f4e6'}
                    size={44}
                  />
                  <div className={styles.cardInfo}>
                    <div className={styles.cardBadge}>
                      {g.cost_currency} GACHA
                      {g.pity_hard_ceiling > 0 && ` · 천장 ${g.pity_hard_ceiling}`}
                    </div>
                    <div className={styles.cardTitle}>{g.name}</div>
                    <div className={styles.cardRates}>{g.description}</div>
                  </div>
                </div>

                {pity && (
                  <GachaPityBar pity={pity} dark={dark} />
                )}

                <div className={styles.price}>
                  1회 {g.cost_currency} {g.cost_single.toLocaleString()} · 10연 {g.cost_currency} {g.cost_10pull.toLocaleString()}
                </div>

                <div className={styles.btnRow}>
                  <button
                    className={`${styles.btnSingle} ${dark ? styles.btnSingleDark : ''}`}
                    onClick={() => {
                      const have = g.cost_currency === 'GOLD' ? (wallet?.gold_balance ?? 0) : (wallet?.xp_balance ?? 0);
                      if (have < g.cost_single) {
                        setInsufficientDialog({ currency: g.cost_currency, have, need: g.cost_single });
                        return;
                      }
                      navigate(`/gacha/pull/${g.code}?is10=false`);
                    }}
                  >
                    1회
                  </button>
                  <button
                    className={`${styles.btnTen} ${
                      gcStyle ? styles.btnTenEpic :
                      season ? styles.btnTenLegend :
                      dark    ? styles.btnTenDark  : ''
                    }`}
                    onClick={() => {
                      const have = g.cost_currency === 'GOLD' ? (wallet?.gold_balance ?? 0) : (wallet?.xp_balance ?? 0);
                      if (have < g.cost_10pull) {
                        setInsufficientDialog({ currency: g.cost_currency, have, need: g.cost_10pull });
                        return;
                      }
                      navigate(`/gacha/pull/${g.code}?is10=true`);
                    }}
                  >
                    10연차
                  </button>
                </div>
              </div>
            );
          })
        )}

        <div className={styles.rateNote}>
          확률 정보는{' '}
          <span className={styles.rateNoteLink}>전체 보기</span>에서 확인
        </div>
      </div>

      <AlertDialog
        open={!!insufficientDialog}
        title="잔액이 부족해요"
        message={{
          mode: 'html',
          value: insufficientDialog
            ? `보유 <b>${insufficientDialog.have.toLocaleString()} ${insufficientDialog.currency}</b><br/>필요 <b>${insufficientDialog.need.toLocaleString()} ${insufficientDialog.currency}</b>`
            : '',
        }}
        onClose={() => setInsufficientDialog(null)}
      />
    </div>
  );
}
