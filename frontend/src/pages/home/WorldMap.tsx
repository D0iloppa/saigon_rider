import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { useUserStore } from '@/store/useUserStore';
import { fetchRecommendedQuests } from '@/api/quests';
import { fetchWallet } from '@/api/wallet';
import { fetchUserStats } from '@/api/profile';
import { fetchDistricts, localizedName } from '@/api/master';
import type { District } from '@/api/master';
import { weatherApi, floodApi, gasApi, repairApi } from '@/api/info';
import type { WeatherData, FloodReport, GasStation, RepairShop } from '@/api/info';
import { formatNumber } from '@/lib/format';
import { native } from '@/lib/native';
import { apiRegisterDeviceMap } from '@/api/device';
import type { Quest } from '@/api/types';
import { AppImage } from '@/components/ui/AppImage';
import { LevelBadge } from '@/components/ui/LevelBadge';
import { emojiUrl } from '@/lib/emoji';
import { expToNextLevel } from '@/lib/rewards';
import SaigonDistrictMap from '@/components/maps/SaigonDistrictMap';
import { findNearestDistrict } from '@/components/maps/district-data';
import type { District as MapDistrict } from '@/components/maps/district-data';
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
  const [districts, setDistricts] = useState<District[]>([]);
  const [selectedDistrict, setSelectedDistrict] = useState<string | null>(null);
  const [userCoords, setUserCoords] = useState<{ lat: number; lng: number } | null>(null);

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
      native.getDeviceUUID()
        .then((deviceUuid) => {
          if (!deviceUuid) {
            console.warn('[device-map] home: getDeviceUUID empty — skip', {
              isNative: native.isNative,
              platform: native.platform,
            });
            return;
          }
          apiRegisterDeviceMap(deviceUuid, uid).catch((e) =>
            console.warn('[device-map] home re-register failed', e),
          );
        })
        .catch((e) => console.error('[device-map] home getDeviceUUID threw', e));
    } else {
      setLoading(false);
    }
    fetchWallet().then((w) => {
      setGold(w.gold_balance);
      setXp(w.xp_balance);
    }).catch(() => {});
    if (uid) {
      fetchUserStats(uid).then((s) => {
        setMonthlyKm(Number(s.total_km));
      }).catch(() => {});
    }
  }, [refreshUser]);

  useEffect(() => {
    fetchDistricts().then(setDistricts).catch(() => {});
    const FALLBACK = { lat: 10.776, lng: 106.700 };
    navigator.geolocation?.getCurrentPosition(
      (p) => setUserCoords({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => setUserCoords(FALLBACK),
    );
  }, []);

  // 선택된 구역의 centroid 또는 유저 GPS 좌표로 info API 4종 호출
  const activeCoords: { lat: number; lng: number } | null = (() => {
    if (selectedDistrict) {
      const d = districts.find((x) => x.code === selectedDistrict);
      if (d?.center_lat != null && d?.center_lng != null) {
        return { lat: d.center_lat, lng: d.center_lng };
      }
    }
    return userCoords;
  })();

  const infoNavQuery = activeCoords
    ? `?lat=${activeCoords.lat}&lng=${activeCoords.lng}${selectedDistrict ? `&district=${selectedDistrict}` : ''}`
    : '';

  useEffect(() => {
    if (!activeCoords) return;
    const { lat, lng } = activeCoords;
    Promise.allSettled([
      weatherApi.get(lat, lng).then((w) => {
        setInfoWeather(w);
        if (!selectedDistrict) setUserDistrictCode(w.location?.district ?? null);
      }),
      floodApi.getActive(lat, lng, 5).then((r) => setInfoFloods(r.floods)),
      gasApi.getNearby(lat, lng, 5).then((r) => setInfoGas(r.stations[0] ?? null)),
      repairApi.getNearby(lat, lng, 5).then((r) => setInfoRepair(r.shops[0] ?? null)),
    ]);
  }, [selectedDistrict, districts, userCoords]);

  const selectedDistrictName = selectedDistrict
    ? (() => {
        const d = districts.find((x) => x.code === selectedDistrict);
        return d ? localizedName(d) : selectedDistrict;
      })()
    : null;

  if (!user) return null;

  const activeFloods = infoFloods.filter((f) => f.status === 'ACTIVE');

  // ── District map state derivation ──
  const highlightDistrictCode: string | undefined = (() => {
    const d = districts.find((x) => x.code === (selectedDistrict ?? userDistrictCode ?? ''));
    if (d?.center_lat != null && d?.center_lng != null) {
      return findNearestDistrict(d.center_lat, d.center_lng)?.code;
    }
    if (userCoords) return findNearestDistrict(userCoords.lat, userCoords.lng)?.code;
    return undefined;
  })();

  const dangerDistrictCodes: string[] = (() => {
    const set = new Set<string>();
    for (const f of activeFloods) {
      const w = findNearestDistrict(f.lat, f.lng);
      if (w) set.add(w.code);
    }
    return Array.from(set);
  })();

  const handleDistrictClick = (mapDistrict: MapDistrict) => {
    // mapDistrict.gps 에 가장 가까운 district 를 선택
    let nearest: District | null = null;
    let minDist = Infinity;
    for (const d of districts) {
      if (d.center_lat == null || d.center_lng == null) continue;
      const dLat = d.center_lat - mapDistrict.gps.lat;
      const dLng = d.center_lng - mapDistrict.gps.lng;
      const dist = dLat * dLat + dLng * dLng;
      if (dist < minDist) {
        minDist = dist;
        nearest = d;
      }
    }
    if (nearest) setSelectedDistrict(nearest.code);
  };
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
            <span className={`mono ${styles.mileageValue}`}>{monthlyKm.toFixed(2)}</span>
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
            <span className={styles.infoSectionLabel}>
              📍 {selectedDistrictName ?? district} — {t('info.hub.currentSituation')}
            </span>
            {selectedDistrict && (
              <button className={styles.resetChip} onClick={() => setSelectedDistrict(null)}>
                {t('home.resetToMyLocation')}
              </button>
            )}
            {!selectedDistrict && activeFloods.length > 0 && (
              <span className={styles.infoBadgeDanger}>{t('info.hub.floodDangerBadge', { count: activeFloods.length })}</span>
            )}
          </div>
        </div>

        {/* ── District Map ── */}
        <div className={styles.mapSection}>
          <SaigonDistrictMap
            height={300}
            highlightedDistricts={highlightDistrictCode ? [highlightDistrictCode] : []}
            dangerDistricts={dangerDistrictCodes}
            onDistrictClick={handleDistrictClick}
            showLabels
            showLegend
            zoomable
          />
        </div>

        {/* ── INFO Strip (지도 아래) ── */}
        <div className={styles.infoSection}>
          <div className={styles.infoStrip}>
            <button className={styles.miniCard} onClick={() => navigate(`/info/weather${infoNavQuery}`)}>
              <div className={styles.miniIcon}>{cur?.emoji ?? '🌡'}</div>
              <div className={styles.miniTitle}>{t('info.hub.miniWeather')}</div>
              <div className={styles.miniValue}>{cur ? `${cur.temp_c}°C` : '--'}</div>
              <div className={styles.miniSub}>
                {cur && cur.rain_prob_1h > 0 ? t('info.hub.miniRainIn1h', { prob: cur.rain_prob_1h }) : cur ? t('info.hub.miniClear') : t('info.hub.miniLoading')}
              </div>
            </button>
            <button
              className={`${styles.miniCard} ${activeFloods.length > 0 ? styles.miniCardDanger : ''}`}
              onClick={() => navigate(`/info/flood${infoNavQuery}`)}
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
            <button className={styles.miniCard} onClick={() => navigate(`/info/gas${infoNavQuery}`)}>
              <div className={styles.miniIcon}>⛽</div>
              <div className={styles.miniTitle}>{t('info.hub.miniGas')}</div>
              <div className={`${styles.miniValue} mono`}>
                {infoGas?.price_vnd != null ? `${infoGas.price_vnd.toLocaleString()}₫` : '--'}
              </div>
              <div className={styles.miniSub}>
                {infoGas ? `${infoGas.distance_km.toFixed(1)}km · ${infoGas.wait_minutes === 0 ? t('info.hub.miniGasNoWait') : infoGas.wait_minutes ? t('info.hub.miniGasWait', { min: infoGas.wait_minutes }) : ''}` : t('info.hub.miniLoading')}
              </div>
            </button>
            <button className={styles.miniCard} onClick={() => navigate(`/info/repair${infoNavQuery}`)}>
              <div className={styles.miniIcon}>🔧</div>
              <div className={styles.miniTitle}>{t('info.hub.miniRepair')}</div>
              <div className={styles.miniValue}>
                {infoRepair?.avg_rating != null ? `⭐ ${infoRepair.avg_rating.toFixed(1)}` : '⭐ --'}
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
          ) : recommendedList.length > 0 ? (
            <div className={styles.missionCarousel}>
              {recommendedList.map((q) => (
                <button key={q.id} className={styles.missionCard} onClick={() => navigate(`/quests/${q.id}`)}>
                  <div className={styles.missionTag}>
                    {q.questType.toUpperCase()} QUEST
                  </div>
                  <div className={styles.missionTitle}>{q.title}</div>
                  <div className={styles.missionDesc}>
                    {q.districtName}
                    {q.minDistanceM > 0 ? ` · ${(q.minDistanceM / 1000).toFixed(1)}km` : ''}
                    {q.timeRestriction ? ` · ${q.timeRestriction.from}–${q.timeRestriction.to}` : ''}
                  </div>
                  <div className={styles.missionRewards}>
                    {q.rewardGold > 0 && (
                      <span className={styles.rewardChip}>
                        <img src={emojiUrl('1fa99')} width={14} height={14} alt="" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 3 }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        +{formatNumber(q.rewardGold)} Gold
                      </span>
                    )}
                    {q.rewardXpPoints > 0 && (
                      <span className={styles.rewardChip}>
                        <img src={emojiUrl('1f48e')} width={14} height={14} alt="" style={{ display: 'inline-block', verticalAlign: 'middle', marginRight: 3 }} onError={(e) => { e.currentTarget.style.display = 'none'; }} />
                        XP +{formatNumber(q.rewardXpPoints)}
                      </span>
                    )}
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <div className={styles.missionEmpty}>{t('home.noMission')}</div>
          )}
        </div>

      </div>
    </div>
  );
}
