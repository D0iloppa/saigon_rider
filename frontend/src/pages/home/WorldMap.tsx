import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUserStore } from '@/store/useUserStore';
import { fetchRecommendedQuests } from '@/api/quests';
import { fetchWallet } from '@/api/wallet';
import { fetchUserStats } from '@/api/profile';
import { weatherApi, floodApi, gasApi, repairApi } from '@/api/info';
import type { WeatherData, FloodReport, GasStation, RepairShop } from '@/api/info';
import { formatNumber } from '@/lib/format';
import type { Quest } from '@/api/types';
import { AppImage } from '@/components/ui/AppImage';
import { LevelBadge } from '@/components/ui/LevelBadge';
import { emojiUrl } from '@/lib/emoji';
import { expToNextLevel } from '@/lib/rewards';
import DistrictMap from './DistrictMap';
import styles from './WorldMap.module.css';

export default function WorldMap() {
  const user = useUserStore((s) => s.user);
  const refreshUser = useUserStore((s) => s.refreshUser);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [recommendedList, setRecommendedList] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [gold, setGold] = useState(0);
  const [xp, setXp] = useState(0);
  const [monthlyKm, setMonthlyKm] = useState(0);
  const [userDistrictCode, setUserDistrictCode] = useState<string | null>(null);
  const didInit = useRef(false);

  const [infoWeather, setInfoWeather] = useState<WeatherData | null>(null);
  const [infoFloods, setInfoFloods] = useState<FloodReport[]>([]);
  const [infoGas, setInfoGas] = useState<GasStation | null>(null);
  const [infoRepair, setInfoRepair] = useState<RepairShop | null>(null);

  useEffect(() => {
    if (didInit.current) return;
    didInit.current = true;
    refreshUser();
    const uid = useUserStore.getState().user?.id;
    if (uid) {
      fetchRecommendedQuests(uid).then((list) => {
        setRecommendedList(list);
        setLoading(false);
      });
    } else {
      setLoading(false);
    }
    fetchWallet().then((w) => {
      setGold(w.gold_balance);
      setXp(w.xp_balance);
    }).catch(() => {});
    if (uid) {
      fetchUserStats(uid).then((s) => {
        setMonthlyKm(Math.round(Number(s.total_km)));
      }).catch(() => {});
    }
  }, [refreshUser]);

  useEffect(() => {
    const lat = 10.776, lng = 106.700;
    navigator.geolocation?.getCurrentPosition(
      (p) => {
        const la = p.coords.latitude, lo = p.coords.longitude;
        Promise.allSettled([
          weatherApi.get(la, lo).then((w) => { setInfoWeather(w); setUserDistrictCode(w.location?.district ?? null); }),
          floodApi.getActive(la, lo, 5).then((r) => setInfoFloods(r.floods)),
          gasApi.getNearby(la, lo, 5).then((r) => setInfoGas(r.stations[0] ?? null)),
          repairApi.getNearby(la, lo, 5).then((r) => setInfoRepair(r.shops[0] ?? null)),
        ]);
      },
      () => {
        Promise.allSettled([
          weatherApi.get(lat, lng).then((w) => { setInfoWeather(w); setUserDistrictCode(w.location?.district ?? null); }),
          floodApi.getActive(lat, lng, 5).then((r) => setInfoFloods(r.floods)),
          gasApi.getNearby(lat, lng, 5).then((r) => setInfoGas(r.stations[0] ?? null)),
          repairApi.getNearby(lat, lng, 5).then((r) => setInfoRepair(r.shops[0] ?? null)),
        ]);
      },
    );
  }, []);

  if (!user) return null;

  const todayQuest = recommendedList[0] ?? null;
  const activeFloods = infoFloods.filter((f) => f.status === 'ACTIVE');
  const cur = infoWeather?.current;
  const district = infoWeather?.location?.district ?? 'District 1';

  return (
    <div className={styles.root}>
      {/* ── Profile Header ── */}
      {(() => {
        const MONTHLY_KM_GOAL = 500;
        const ringPct = Math.min(monthlyKm / MONTHLY_KM_GOAL, 1);
        const RING_R = 28;
        const RING_C = 2 * Math.PI * RING_R;
        return (
      <div className={styles.header}>
        <div className={styles.avatarWrap} onClick={() => navigate('/profile')}>
          <svg className={styles.ring} viewBox="0 0 64 64" aria-hidden>
            <circle cx="32" cy="32" r={RING_R} className={styles.ringTrack} />
            <circle
              cx="32" cy="32" r={RING_R}
              className={styles.ringFill}
              strokeDasharray={`${ringPct * RING_C} ${RING_C}`}
              transform="rotate(-90 32 32)"
            />
          </svg>
          <div className={styles.avatarCircle}>
            {user.avatarUrl ? (
              <AppImage src={user.avatarUrl} alt="" className={styles.avatar} variant="circle" />
            ) : (
              <span className={styles.avatarLetter}>{user.nickname.charAt(0).toUpperCase()}</span>
            )}
          </div>
          <LevelBadge level={user.level} className={styles.levelOverlay} />
          <div className={styles.mileageLabel}>
            <span className={`mono ${styles.mileageValue}`}>{formatNumber(monthlyKm)}</span>
            <span className={styles.mileageUnit}>km</span>
          </div>
        </div>
        <div className={styles.headerInfo}>
          <div className={styles.headerTop}>
            <div className={styles.userName}>{user.nickname}</div>
            <div className={styles.walletRow}>
              <div className={styles.walletChip}>
                <img src={emojiUrl('1fa99')} width={14} height={14} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                <span className={`mono ${styles.goldValue}`}>{formatNumber(gold)}</span>
              </div>
              <div className={styles.walletChip}>
                <img src={emojiUrl('1f48e')} width={14} height={14} alt="" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                <span className={`mono ${styles.xpValue}`}>{formatNumber(xp)}</span>
              </div>
            </div>
          </div>
          <div className={styles.xpBarWrap}>
            <div className={styles.xpBar}>
              <div className={styles.xpBarFill} style={{ width: `${expToNextLevel(user.levelExp, user.level).progress * 100}%` }} />
            </div>
            <span className={`mono ${styles.xpBarLabel}`}>
              {formatNumber(user.levelExp)} / {formatNumber(user.levelExp + expToNextLevel(user.levelExp, user.level).needed)}
            </span>
          </div>
        </div>
      </div>
        );
      })()}

      {/* Scrollable content */}
      <div className={styles.scroll}>
        {/* ── INFO Strip ── */}
        <div className={styles.infoSection}>
          <div className={styles.infoSectionHeader}>
            <span className={styles.infoSectionLabel}>📍 {district} — {t('info.hub.currentSituation')}</span>
            {activeFloods.length > 0 && (
              <span className={styles.infoBadgeDanger}>{t('info.hub.floodDangerBadge', { count: activeFloods.length })}</span>
            )}
          </div>
          <div className={styles.infoStrip}>
            <button className={styles.miniCard} onClick={() => navigate('/info/weather')}>
              <div className={styles.miniIcon}>{cur?.emoji ?? '🌡'}</div>
              <div className={styles.miniTitle}>{t('info.hub.miniWeather')}</div>
              <div className={styles.miniValue}>{cur ? `${cur.temp_c}°C` : '--'}</div>
              <div className={styles.miniSub}>
                {cur && cur.rain_prob_1h > 0 ? t('info.hub.miniRainIn1h', { prob: cur.rain_prob_1h }) : cur ? t('info.hub.miniClear') : t('info.hub.miniLoading')}
              </div>
            </button>
            <button
              className={`${styles.miniCard} ${activeFloods.length > 0 ? styles.miniCardDanger : ''}`}
              onClick={() => navigate('/info/flood')}
            >
              <div className={styles.miniIcon}>🌊</div>
              <div className={styles.miniTitle}>{t('info.hub.miniFlood')}</div>
              <div className={`${styles.miniValue} ${activeFloods.length > 0 ? styles.miniValueDanger : ''}`}>
                {activeFloods.length > 0 ? t('info.hub.miniFloodActive', { count: activeFloods.length }) : t('info.hub.floodNoIssue')}
              </div>
              <div className={`${styles.miniSub} ${activeFloods.length > 0 ? styles.miniSubDanger : ''}`}>
                {activeFloods.length > 0 ? (activeFloods[0].district_code ?? '') : t('info.hub.miniFloodNone')}
              </div>
            </button>
            <button className={styles.miniCard} onClick={() => navigate('/info/gas')}>
              <div className={styles.miniIcon}>⛽</div>
              <div className={styles.miniTitle}>{t('info.hub.miniGas')}</div>
              <div className={`${styles.miniValue} mono`}>
                {infoGas ? `${infoGas.price_vnd?.toLocaleString()}₫` : '--'}
              </div>
              <div className={styles.miniSub}>
                {infoGas ? `${infoGas.distance_km.toFixed(1)}km · ${infoGas.wait_minutes === 0 ? t('info.hub.miniGasNoWait') : infoGas.wait_minutes ? t('info.hub.miniGasWait', { min: infoGas.wait_minutes }) : ''}` : t('info.hub.miniLoading')}
              </div>
            </button>
            <button className={styles.miniCard} onClick={() => navigate('/info/repair')}>
              <div className={styles.miniIcon}>🔧</div>
              <div className={styles.miniTitle}>{t('info.hub.miniRepair')}</div>
              <div className={styles.miniValue}>
                {infoRepair ? `⭐ ${infoRepair.avg_rating?.toFixed(1)}` : '--'}
              </div>
              <div className={styles.miniSub}>
                {infoRepair?.name ?? t('info.hub.miniLoading')}
              </div>
            </button>
          </div>
        </div>

        {/* ── District Map ── */}
        <div className={styles.mapSection}>
          <DistrictMap activeCode={userDistrictCode} />
        </div>

        {/* ── Today's Mission ── */}
        <div className={styles.missionSection}>
          <div className={styles.sectionLabel}>📍 {t('home.todayMission')}</div>
          {loading ? (
            <div className={`shimmer ${styles.missionSkeleton}`} />
          ) : todayQuest ? (
            <button className={styles.missionCard} onClick={() => navigate(`/quests/${todayQuest.id}`)}>
              <div className={styles.missionTag}>
                {todayQuest.questType.toUpperCase()} QUEST
              </div>
              <div className={styles.missionTitle}>{todayQuest.title}</div>
              <div className={styles.missionDesc}>
                {todayQuest.districtName}
                {todayQuest.minDistanceM > 0 ? ` · ${(todayQuest.minDistanceM / 1000).toFixed(1)}km` : ''}
                {todayQuest.timeRestriction ? ` · ${todayQuest.timeRestriction.from}–${todayQuest.timeRestriction.to}` : ''}
              </div>
              <div className={styles.missionRewards}>
                {todayQuest.rewardGold > 0 && (
                  <span className={styles.rewardChip}>
                    <img src={emojiUrl('1fa99')} width={14} height={14} alt="" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 3 }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    +{formatNumber(todayQuest.rewardGold)} Gold
                  </span>
                )}
                {todayQuest.rewardXpPoints > 0 && (
                  <span className={styles.rewardChip}>
                    <img src={emojiUrl('1f48e')} width={14} height={14} alt="" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 3 }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                    XP +{formatNumber(todayQuest.rewardXpPoints)}
                  </span>
                )}
              </div>
            </button>
          ) : (
            <div className={styles.missionEmpty}>{t('home.noMission')}</div>
          )}
        </div>

      </div>
    </div>
  );
}
