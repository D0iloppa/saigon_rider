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
import styles from './WorldMap.module.css';

export default function WorldMap() {
  const user = useUserStore((s) => s.user);
  const refreshUser = useUserStore((s) => s.refreshUser);
  const navigate = useNavigate();
  const { t } = useTranslation();
  const [recommendedList, setRecommendedList] = useState<Quest[]>([]);
  const [loading, setLoading] = useState(true);
  const [gold, setGold] = useState(0);
  const [totalRides, setTotalRides] = useState(0);
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
    }).catch(() => {});
    if (uid) {
      fetchUserStats(uid).then((s) => setTotalRides(s.quest_count)).catch(() => {});
    }
  }, [refreshUser]);

  useEffect(() => {
    const lat = 10.776, lng = 106.700;
    navigator.geolocation?.getCurrentPosition(
      (p) => {
        const la = p.coords.latitude, lo = p.coords.longitude;
        Promise.allSettled([
          weatherApi.get(la, lo).then(setInfoWeather),
          floodApi.getActive(la, lo, 5).then((r) => setInfoFloods(r.floods)),
          gasApi.getNearby(la, lo, 5).then((r) => setInfoGas(r.stations[0] ?? null)),
          repairApi.getNearby(la, lo, 5).then((r) => setInfoRepair(r.shops[0] ?? null)),
        ]);
      },
      () => {
        Promise.allSettled([
          weatherApi.get(lat, lng).then(setInfoWeather),
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
      {/* ── Simple Header ── */}
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.greetText}>{t('home.greet')}</div>
          <div className={styles.userName}>{user.nickname}</div>
        </div>
        <div className={styles.headerRight}>
          <div className={styles.goldBadge}>
            <span className={styles.goldEmoji}>🪙</span>
            <span className={`mono ${styles.goldValue}`}>{formatNumber(gold)}</span>
          </div>
          <div className={styles.avatarCircle}>
            {user.avatarUrl ? (
              <AppImage src={user.avatarUrl} alt="" className={styles.avatar} variant="circle" />
            ) : (
              <span className={styles.avatarLetter}>{user.nickname.charAt(0).toUpperCase()}</span>
            )}
          </div>
        </div>
      </div>

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
                  <span className={styles.rewardChip}>🪙 +{formatNumber(todayQuest.rewardGold)} Gold</span>
                )}
                {todayQuest.rewardXpPoints > 0 && (
                  <span className={styles.rewardChip}>XP +{formatNumber(todayQuest.rewardXpPoints)}</span>
                )}
              </div>
            </button>
          ) : (
            <div className={styles.missionEmpty}>{t('home.noMission')}</div>
          )}
        </div>

        {/* ── Quick Stats ── */}
        <div className={styles.statsGrid}>
          <div className={styles.statCard}>
            <div className={`mono ${styles.statValue}`}>{formatNumber(totalRides)}</div>
            <div className={styles.statLabel}>{t('home.totalRides')}</div>
          </div>
          <div className={styles.statCard}>
            <div className={`mono ${styles.statValue}`}>{formatNumber(gold)}</div>
            <div className={styles.statLabel}>{t('home.goldHeld')}</div>
          </div>
          <div className={styles.statCard}>
            <div className={styles.statValueAccent}>Lv.{user.level}</div>
            <div className={styles.statLabel}>{t('home.riderLevel')}</div>
          </div>
        </div>
      </div>
    </div>
  );
}
