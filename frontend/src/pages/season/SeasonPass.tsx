import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { fetchSeasonPass } from '@/api/season';
import type { SeasonPass as SeasonPassData, SeasonRewardNode } from '@/api/season';
import { emojiUrl } from '@/lib/emoji';
import s from './SeasonPass.module.css';

const REWARD_ICON_CODES: Record<string, string> = {
  GOLD: '1fa99', XP: '1f48e', ITEM: '1f381', BOX: '1f4e6',
};

function useCountdown(targetIso: string | undefined, t: (key: string, opts?: Record<string, unknown>) => string) {
  const [label, setLabel] = useState('');
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!targetIso) return;
    function tick() {
      const diff = new Date(targetIso!).getTime() - Date.now();
      if (diff <= 0) { setLabel(t('seasonPass.ended')); return; }
      const d = Math.floor(diff / 86400000);
      const h = Math.floor((diff % 86400000) / 3600000);
      const m = Math.floor((diff % 3600000) / 60000);
      setLabel(d > 0 ? t('seasonPass.days_hours', { days: d, hours: h }) : `${h}h ${m}m`);
    }
    tick();
    timerRef.current = setInterval(tick, 60000);
    return () => { if (timerRef.current) clearInterval(timerRef.current); };
  }, [targetIso, t]);

  return label;
}

function RewardNodeCard({ node, isCurrent }: { node: SeasonRewardNode; isCurrent: boolean }) {
  const freeCode = REWARD_ICON_CODES[node.free_reward.type] ?? '1f381';
  const premCode = node.premium_reward ? (REWARD_ICON_CODES[node.premium_reward.type] ?? '1f381') : null;

  return (
    <div className={s.node}>
      <div className={`${s.nodeLevel} ${isCurrent ? s.nodeLevelCurrent : ''}`}>
        Lv.{node.level}
      </div>

      {/* free row */}
      <div className={`${s.rewardCard} ${node.is_claimed_free ? s.rewardCardClaimed : ''}`}>
        {node.is_claimed_free && <span className={s.rewardCardClaimedBadge}>✓</span>}
        <img className={s.rewardIcon} src={emojiUrl(freeCode)} width={20} height={20} alt="" />
        <div
          className={`${s.rewardCardLabel} rarity-chip`}
          data-r={node.free_reward.rarity ?? 'C'}
          style={{ fontSize: 8 }}
        >
          {node.free_reward.label}
        </div>
      </div>

      {/* premium row (or placeholder) */}
      {premCode ? (
        <div className={`${s.rewardCard} ${s.rewardCardPremium} ${node.is_claimed_premium ? s.rewardCardClaimed : ''}`}>
          {node.is_claimed_premium && <span className={s.rewardCardClaimedBadge}>✓</span>}
          <img className={s.rewardIcon} src={emojiUrl(premCode)} width={20} height={20} alt="" />
          <div
            className={`${s.rewardCardLabel} rarity-chip`}
            data-r={node.premium_reward!.rarity ?? 'C'}
            style={{ fontSize: 8 }}
          >
            {node.premium_reward!.label}
          </div>
        </div>
      ) : (
        <div className={`${s.rewardCard}`} style={{ opacity: .2 }}>
          <span className={s.rewardIcon}>🔒</span>
        </div>
      )}
    </div>
  );
}

export default function SeasonPass() {
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [data, setData] = useState<SeasonPassData | null>(null);

  useEffect(() => { fetchSeasonPass().then(setData); }, []);

  const countdown = useCountdown(data?.season.ends_at, t);

  if (!data) {
    return (
      <div className={s.page} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'rgba(255,255,255,.4)', fontSize: 13 }}>{t('common.loading')}</span>
      </div>
    );
  }

  const { season, current_level, current_sxp, sxp_to_next, is_premium, tier_label, rewards } = data;
  const xpPct = sxp_to_next > 0 ? Math.min((current_sxp / sxp_to_next) * 100, 100) : 100;

  return (
    <div className={s.page}>
      {/* Header */}
      <div className={s.header}>
        <div className={s.headerTop}>
          <button className={s.backBtn} onClick={() => navigate(-1)}>‹</button>
          <span className={s.seasonName}>{season.name}</span>
          {countdown && <span className={s.countdown}>{countdown} {t('seasonPass.ends_in')}</span>}
        </div>

        {/* Level card */}
        <div className={s.levelCard}>
          <div className={s.levelRow}>
            <span className={s.levelLabel}>Lv. {current_level}</span>
            <span className={s.levelSub}>/ {season.total_levels}</span>
          </div>
          <div className={s.xpBar}>
            <div className={s.xpFill} style={{ width: `${xpPct}%` }} />
          </div>
          <div className={s.xpMeta}>
            {current_sxp.toLocaleString()} / {sxp_to_next.toLocaleString()} XP
          </div>
          <div className={s.tierBadge}>★ {tier_label}</div>
        </div>
      </div>

      {/* Upsell (only for free tier) */}
      {!is_premium && (
        <div className={s.upsell}>
          <div className={s.upsellText}>
            <div className={s.upsellTitle}>{t('seasonPass.upsell_title')}</div>
            <div className={s.upsellSub}>{t('seasonPass.upsell_sub')}</div>
          </div>
          <button className={s.upsellBtn}>{t('seasonPass.upsell_btn')}</button>
        </div>
      )}

      {/* Track */}
      <div className={s.trackLabel}>REWARD TRACK</div>

      <div className={s.trackWrap}>
        <div className={s.track}>
          <div className={s.node} style={{ width: 40, flexShrink: 0 }}>
            <div style={{ height: 16 }} />
            <div className={s.trackRowLabel} style={{ width: 40 }}>FREE</div>
            <div className={s.trackRowLabel} style={{ width: 40 }} />
            <div className={`${s.trackRowLabel} ${s.trackRowLabelPremium}`} style={{ width: 40 }}>PREM</div>
          </div>
          {rewards.map((node) => (
            <RewardNodeCard
              key={node.level}
              node={node}
              isCurrent={node.level === current_level}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
