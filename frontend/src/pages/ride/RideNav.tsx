import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { AlertDialog } from '@/components/ui/AlertDialog';
import { native } from '@/lib/native';
import { resolveInfoCoordsSync } from '@/lib/infoCoords';
import MapCanvas, { type MapCanvasHandle } from '@/components/ride/MapCanvas';
import MapControls from '@/components/ride/MapControls';
import Speedometer from '@/components/ride/Speedometer';
import QuestProgressChip from '@/components/ride/QuestProgressChip';
import DraggableSheet, { type DraggableSheetHandle } from '@/components/ride/DraggableSheet';
import { routeApi, type RouteData } from '@/api/info';
import { fetchQuest, abandonRide as apiAbandonRide, fetchRideTrail, type TrailPoint } from '@/api/quests';
import { useRideStore } from '@/store/useRideStore';
import { useUserStore } from '@/store/useUserStore';
import { calculateRewards } from '@/lib/rewards';
import styles from './RideNav.module.css';

type Coords = { lat: number; lng: number };

/** 출발지: 권한 요청 후 현재 GPS 우선, 실패 시 캐시/기본 좌표(throw 안 함). */
async function resolveOrigin(): Promise<Coords> {
  try {
    if (native.isNative) {
      const st = await native.checkLocationPermission().catch(() => 'prompt');
      if (st !== 'granted') await native.requestLocationPermission().catch(() => undefined);
    }
    return await native.getLocation();
  } catch {
    return resolveInfoCoordsSync('');
  }
}

function maneuverIcon(maneuver?: string | null, isLast = false): string {
  if (isLast) return '🏁';
  const m = maneuver ?? '';
  if (m.includes('uturn')) return '↩️';
  if (m.includes('roundabout') || m.includes('rotary')) return '🔄';
  if (m.includes('left')) return '⬅️';
  if (m.includes('right')) return '➡️';
  return '⬆️';
}

/** Google 4색 G 로고 (공식 마크). 흰 배경 위에서 정확히 렌더. */
function GoogleGIcon() {
  return (
    <svg viewBox="0 0 48 48" width="18" height="18" aria-hidden="true">
      <path fill="#FFC107" d="M43.611 20.083H42V20H24v8h11.303c-1.649 4.657-6.08 8-11.303 8-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917z" />
      <path fill="#FF3D00" d="M6.306 14.691l6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.961 3.039l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691z" />
      <path fill="#4CAF50" d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.211 35.091 26.715 36 24 36c-5.202 0-9.619-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44z" />
      <path fill="#1976D2" d="M43.611 20.083H42V20H24v8h11.303c-.792 2.237-2.231 4.166-4.087 5.571l6.19 5.238C36.971 39.205 44 34 44 24c0-1.341-.138-2.65-.389-3.917z" />
    </svg>
  );
}

/**
 * 경로/퀘스트 지도 화면 (목업 28-A 기반, SGR-269 → SGR-271).
 *
 * 진입 type 으로 분기 — 공통 컴포넌트(MapCanvas·MapControls·Speedometer·DraggableSheet) 재사용:
 *   type=nav   : 경로 안내 미리보기 (Directions + 시작 spin/zoom + Google 핸드오프). URL 파라미터 기반.
 *   type=quest : 퀘스트 수행 인터페이스. 진행도·완료는 엔진이 검증 — 화면은 useRideStore 서버 폴링값을 표시한다.
 *                (클라 완료 판정 금지. 신뢰경계=서버. GPS 는 startRide 시 켜진 네이티브 핑이 엔진에 전송.)
 *
 * 실시간 턴바이턴은 Google ToS상 앱 내 불가 → Google 지도 핸드오프(nav 한정).
 */
export default function RideNav() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [params] = useSearchParams();

  const ride = useRideStore();
  const refreshUser = useUserStore((s) => s.refreshUser);

  const type = params.get('type') === 'quest' ? 'quest' : 'nav';
  const isQuest = type === 'quest';

  // quest: 스토어(서버 검증)에서 파생. nav: URL 파라미터에서 파생.
  const mode = isQuest ? (ride.cardType === 'CHECKPOINT' ? 'checkpoint' : 'distance') : params.get('mode');
  const questName = isQuest ? ride.questTitle ?? '' : '';
  const radiusM = isQuest ? ride.policyProximityM : Number(params.get('radius')) || 100;
  const name = params.get('name') ?? '';
  const lat = params.get('lat');
  const lng = params.get('lng');
  const hasDest = !!lat && !!lng;

  // nav: 목적지. quest-checkpoint: 서버 목표 좌표. quest-distance: 목적지 없음.
  const dest = useMemo<Coords | null>(() => {
    if (isQuest) {
      if (mode === 'distance') return null;
      return ride.targetLat != null && ride.targetLng != null
        ? { lat: ride.targetLat, lng: ride.targetLng }
        : null;
    }
    return hasDest ? { lat: Number(lat), lng: Number(lng) } : null;
  }, [isQuest, mode, ride.targetLat, ride.targetLng, hasDest, lat, lng]);

  const mapRef = useRef<MapCanvasHandle>(null);
  const sheetRef = useRef<DraggableSheetHandle>(null);

  const [route, setRoute] = useState<RouteData | null>(null);
  const [origin, setOrigin] = useState<Coords | null>(null);
  const [arrivalTime, setArrivalTime] = useState<string | null>(null);
  const [loading, setLoading] = useState(type === 'nav');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [guidanceStarted, setGuidanceStarted] = useState(isQuest); // quest 는 진입 즉시 추적

  // 실시간 위치/속도 (속도계·마커용 — foreground watch. 검증은 서버 폴링이 담당)
  const [current, setCurrent] = useState<Coords & { heading?: number | null }>();
  const [speedMs, setSpeedMs] = useState<number | null>(null);
  const completedRef = useRef(false);

  // quest 이동경로(서버 스트림 GPS) — 거리 퀘스트 궤적 표시.
  const [trail, setTrail] = useState<TrailPoint[]>([]);
  const [deviceUuid, setDeviceUuid] = useState<string | null>(null);

  // nav: 진입 시 현재 위치(origin)→목적지 Directions 조회.
  useEffect(() => {
    if (type !== 'nav' || !dest) return;
    let cancelled = false;
    (async () => {
      const from = await resolveOrigin();
      if (cancelled) return;
      setOrigin(from);
      const data = await routeApi.getRoute(from, dest).catch(() => null);
      if (cancelled) return;
      if (data?.configured) {
        setRoute(data);
        setDialogOpen(false);
        if (data.duration_s) {
          const d = new Date(Date.now() + data.duration_s * 1000);
          setArrivalTime(`${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`);
        }
      } else {
        setDialogOpen(true);
      }
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [type, dest]);

  // quest: 진입 시 출발지 확보.
  // DEBUG(SGR-271): HCMC D1 폴백(resolveInfoCoords 기본값) 임시 비활성화 — 실제 GPS 만 사용,
  // 실패 시 origin=null 로 두고 지도는 스트림 트레일에 센터. (복구: resolveOrigin() 으로 되돌릴 것)
  useEffect(() => {
    if (!isQuest) return;
    let cancelled = false;
    native.getLocation()
      .then((p) => { if (!cancelled) setOrigin({ lat: p.lat, lng: p.lng }); })
      .catch(() => { /* no HCMC fallback (debug) */ });
    native.getDeviceUUID().then((u) => { if (!cancelled) setDeviceUuid(u); }).catch(() => undefined);
    return () => { cancelled = true; };
  }, [isQuest]);

  // quest: 이동경로(trail) 폴링 — 서버 스트림에서 이 device 의 gps 핑을 좌표열로.
  useEffect(() => {
    if (!isQuest || !deviceUuid || !ride.isActive) return;
    const sinceTs = ride.startedAt ? ride.startedAt / 1000 : undefined;
    let cancelled = false;
    const tick = async () => {
      const pts = await fetchRideTrail(deviceUuid, sinceTs);
      if (!cancelled && pts.length) setTrail(pts);
    };
    tick();
    const id = window.setInterval(tick, 3000);
    return () => { cancelled = true; window.clearInterval(id); };
  }, [isQuest, deviceUuid, ride.isActive, ride.startedAt]);

  // quest: 활성 세션 없이 진입(딥링크/새로고침) → 홈. 완료 진행 중에는 제외.
  useEffect(() => {
    if (isQuest && !ride.isActive && !completedRef.current) {
      navigate('/home', { replace: true });
    }
  }, [isQuest, ride.isActive, navigate]);

  // quest: 서버가 카드를 COMPLETED 로 표시(ride.reachedTarget) → 결과 화면. 보상은 서버 워커가 멱등 지급.
  useEffect(() => {
    if (!isQuest || !ride.reachedTarget || completedRef.current) return;
    completedRef.current = true;
    const distance = ride.distanceM;
    const duration = ride.durationSec;
    const safety = ride.safetyGrade;
    const questId = ride.questId;
    (async () => {
      const quest = questId ? await fetchQuest(questId) : null;
      const user = useUserStore.getState().user;
      ride.completeRide(); // 폴링·GPS·타이머 정지
      await refreshUser().catch(() => undefined); // 서버 잔액 동기화(워커 지급분 반영)
      if (quest && user) {
        const rewards = calculateRewards({ quest, user, finalSafety: safety, isFirstClearToday: true });
        navigate('/ride/result/success', { state: { quest, distance, duration, safety, rewards } });
      } else {
        navigate('/home', { replace: true });
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isQuest, ride.reachedTarget]);

  // 실시간 GPS watch — 안내 시작(nav) 또는 퀘스트 추적 중일 때. 마커·속도계 표시 전용.
  useEffect(() => {
    if (!guidanceStarted) return;
    const stop = native.watchLocation((pos) => {
      setCurrent({ lat: pos.lat, lng: pos.lng, heading: pos.heading });
      setSpeedMs(pos.speed ?? null);
    });
    return stop;
  }, [guidanceStarted]);

  const startGuidance = () => {
    setGuidanceStarted(true);
    mapRef.current?.startGuidance();
    sheetRef.current?.collapse(); // 핀(중앙)이 시트에 가리지 않도록 시트 내림
  };

  const openGoogleMaps = () => {
    if (!hasDest) return;
    native.openUrl(`https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}&travelmode=two_wheeler`);
    setDialogOpen(false);
  };

  // 뒤로: quest 진행 중이면 포기(서버 abandon + GPS 정지). nav 는 단순 뒤로.
  const handleBack = () => {
    if (isQuest && ride.isActive) {
      const uqId = ride.userQuestId;
      ride.abandonRide();
      if (uqId) apiAbandonRide(uqId).catch(() => undefined);
      navigate('/home');
      return;
    }
    navigate(-1);
  };

  const keyMissing = type === 'nav' && !loading && !route?.configured;
  const showMap = isQuest || (!!dest && !keyMissing);

  // 퀘스트 진행 표시 — 모두 서버(useRideStore 폴링)값.
  const checkpointDistM = isQuest && mode === 'checkpoint' ? ride.distanceToTargetM : null;
  const targetM = isQuest ? ride.targetDistanceM : null;
  const distPct = targetM ? Math.min(100, Math.round((ride.distanceM / targetM) * 100)) : 0;

  const recenter = () => { if (current) mapRef.current?.recenter(current); };
  const resetNorth = () => mapRef.current?.resetNorth();

  return (
    <div className={styles.page}>
      <button className={styles.backBtn} onClick={handleBack} aria-label={t('common.back', '뒤로')}>‹</button>

      {showMap ? (
        <>
          <MapCanvas
            ref={mapRef}
            origin={origin}
            dest={dest}
            polyline={route?.polyline}
            current={current}
            trail={isQuest ? trail : null}
            className={styles.map}
          />

          {/* 우측 컨트롤 + 속도계 (공통) */}
          <div className={styles.rightStack}>
            {guidanceStarted && <Speedometer speedMs={speedMs} />}
            <MapControls onRecenter={recenter} onResetNorth={resetNorth} />
          </div>

          {/* quest: 좌측 진행 칩 */}
          {isQuest && (
            <div className={styles.leftChip}>
              <QuestProgressChip
                title={t('rideNav.questInProgress', '퀘스트 진행 중')}
                subtitle={questName || undefined}
              />
            </div>
          )}

          {/* 경로 안내 시작 — 플로팅 버튼 (nav, 시작 전). 누르면 spin + 강한 zoom. */}
          {type === 'nav' && !guidanceStarted && !loading && route?.configured && (
            <button className={styles.startFab} onClick={startGuidance}>
              ▶ {t('rideNav.startGuidance', '경로 안내 시작')}
            </button>
          )}

          {/* 하단 시트 */}
          <DraggableSheet
            ref={sheetRef}
            header={
              type === 'nav' ? (
                <div className={styles.etaRow}>
                  <div className={styles.etaMain}>
                    <div className={`${styles.etaTime} mono`}>{arrivalTime ?? '—'}</div>
                    <div className={styles.etaSub}>
                      {route?.duration_text
                        ? t('rideNav.etaArrive', { duration: route.duration_text, defaultValue: '도착 예정 · {{duration}}' })
                        : t('rideNav.etaPending', '도착 예정 —')}
                    </div>
                  </div>
                  <div className={styles.etaDist}>
                    <div className={`${styles.distVal} mono`}>{route?.distance_text ?? '—'}</div>
                    <div className={styles.distLabel}>{t('rideNav.routeLabel', '경로')}</div>
                  </div>
                </div>
              ) : (
                <div className={styles.etaRow}>
                  <div className={styles.etaMain}>
                    <div className={styles.questTitle}>{questName || t('rideNav.questInProgress', '퀘스트 진행 중')}</div>
                    <div className={styles.etaSub}>
                      {mode === 'checkpoint'
                        ? (checkpointDistM != null && checkpointDistM <= radiusM
                            ? t('rideNav.questArrived', '체크포인트 도착! 검증 중…')
                            : t('rideNav.questCheckpoint', '체크포인트까지'))
                        : t('rideNav.questDistance', { target: targetM ? targetM / 1000 : '—', defaultValue: '목표 {{target}}km' })}
                    </div>
                  </div>
                  <div className={styles.etaDist}>
                    <div className={`${styles.distVal} mono`}>
                      {mode === 'checkpoint'
                        ? (checkpointDistM != null ? `${checkpointDistM}m` : '—')
                        : `${distPct}%`}
                    </div>
                  </div>
                </div>
              )
            }
          >
            {type === 'nav' ? (
              <>
                <div className={styles.steps}>
                  {route && route.steps.length > 0 ? (
                    route.steps.map((s, i) => {
                      const last = i === route.steps.length - 1;
                      return (
                        <div className={styles.stepRow} key={i}>
                          <div className={`${styles.stepIcon} ${last ? styles.stepIconEnd : ''}`}>
                            {maneuverIcon(s.maneuver, last)}
                          </div>
                          <div className={styles.stepBody}>
                            <div className={styles.stepInstr}>{s.instruction}</div>
                            {s.distance_text && <div className={styles.stepDist}>{s.distance_text}</div>}
                          </div>
                        </div>
                      );
                    })
                  ) : (
                    <div className={styles.stepRow}>
                      <div className={styles.stepIcon}>⏳</div>
                      <div className={styles.stepBody}>
                        <div className={styles.stepInstr}>{t('rideNav.loading', '경로 계산 중…')}</div>
                      </div>
                    </div>
                  )}
                </div>
                <button className={styles.handoffBtn} onClick={openGoogleMaps}>
                  <span className={styles.gIcon}><GoogleGIcon /></span>
                  {t('rideNav.openGoogleMaps', 'Google 지도로 이동')}
                </button>
              </>
            ) : (
              <div className={styles.questBody}>
                {mode !== 'checkpoint' && targetM != null && (
                  <div className={styles.progressTrack}>
                    <div className={styles.progressFill} style={{ width: `${distPct}%` }} />
                  </div>
                )}
                <div className={styles.questHint}>
                  {t('rideNav.questServerNote', '완료는 서버에서 자동 검증됩니다.')}
                </div>
              </div>
            )}
          </DraggableSheet>
        </>
      ) : (
        <div className={styles.fallback}>
          <div className={styles.fallbackInner}>
            <div className={styles.fallbackIcon}>🧭</div>
            <div className={styles.fallbackTitle}>{name || t('rideNav.destination', '목적지')}</div>
            <div className={styles.fallbackDesc}>{t('rideNav.summaryPending', '실시간 안내 준비 중')}</div>
          </div>
        </div>
      )}

      <AlertDialog
        open={dialogOpen}
        title={t('rideNav.comingSoonTitle', '실시간 경로 안내 준비 중')}
        message={t('rideNav.comingSoonDesc', '앱 내 길안내는 준비 중입니다. 지금은 Google 지도로 안내받을 수 있어요.')}
        confirmLabel={t('rideNav.openGoogleMaps', 'Google 지도로 이동')}
        cancelLabel={t('common.cancel', '취소')}
        onConfirm={openGoogleMaps}
        onClose={() => navigate(-1)}
      />
    </div>
  );
}
