import { createElement, useEffect, useRef } from 'react';
import { toast as sonnerToast } from 'sonner';
import { useTranslation } from 'react-i18next';
import { useNavigate, type NavigateFunction } from 'react-router-dom';
import { native } from '@/lib/native';
import { haversineM } from '@/lib/polyline';
import { fetchProximityCandidates, postProximityEnter, type ProximityCandidate } from '@/api/proximity';
import { adHref, type MarketAd } from '@/api/market';
import AdCard from '@/pages/market/AdCard';

/** "진입 전" 알림 반경(m) — 260806_proximity_ad_design.md §5-3 D-3 확정값(서버 정책 기본값 미러). */
const NOTIFY_RADIUS_M = 300;
/** Launch safety switch: proximity monitoring remains disabled pending privacy review. */
export const PROXIMITY_ALERTS_ENABLED = false;
/** 같은 가맹점에 대한 로컬 재전송 최소 간격(ms) — 서버 쿨다운/일일상한과 별개로 GPS 틱마다
 * 스팸 호출하는 것만 막는다(배터리·데이터, §R-4). 방문 인정 체류시간(120s)보다 짧게 잡아
 * 체류 중 재확인 POST 가 몇 차례는 가능하게 한다. */
const LOCAL_REPOST_THROTTLE_MS = 20_000;

function showProximityAdToast(ad: MarketAd, label: string, navigate: NavigateFunction) {
  sonnerToast(
    createElement(AdCard, {
      ad,
      label,
      onClick: () => {
        navigate(adHref(ad));
      },
    }),
    { duration: 8000, position: 'top-center', unstyled: true },
  );
}

/**
 * 앱 전역 근접알림 워처 — App.tsx 에서 로그인 후 1회만 마운트한다
 * (260806_proximity_ad_design.md §9-7).
 *
 * 앱 시작 시 후보 좌표 1회 수신 → watchLocation 스트림에서 로컬 haversine 거리로 진입 감지 →
 * 진입 시 POST /proximity/enter 로 서버에 보고한다. 서버가 확정한 광고가 있으면(`ad` 필드)
 * 기존 AdCard 를 토스트로 띄운다. `proximity_policy.is_enabled=FALSE` 인 동안은 서버가
 * candidates 를 빈 배열로 내려줘 이 훅은 자동으로 무동작이다(프론트 킬스위치 없음).
 */
export function useProximityAlerts(enabled: boolean) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const candidatesRef = useRef<ProximityCandidate[]>([]);
  const candidatesLoadedRef = useRef(false);
  const lastPostAtRef = useRef<Map<string, number>>(new Map());
  const prevPosRef = useRef<{ lat: number; lng: number; at: string } | null>(null);

  useEffect(() => {
    if (!PROXIMITY_ALERTS_ENABLED || !enabled) return;
    let stopWatch: (() => void) | null = null;
    let cancelled = false;

    (async () => {
      try {
        const pos = await native.getLocation();
        if (cancelled) return;
        candidatesRef.current = await fetchProximityCandidates(pos.lat, pos.lng);
      } catch {
        candidatesRef.current = [];
      }
      candidatesLoadedRef.current = true;
      if (cancelled) return;

      stopWatch = native.watchLocation((gp) => {
        if (!candidatesLoadedRef.current || candidatesRef.current.length === 0) {
          prevPosRef.current = { lat: gp.lat, lng: gp.lng, at: new Date().toISOString() };
          return;
        }
        const now = new Date();
        const nowMs = now.getTime();

        for (const candidate of candidatesRef.current) {
          const distanceM = haversineM(gp.lat, gp.lng, candidate.lat, candidate.lng);
          if (distanceM > NOTIFY_RADIUS_M) continue;
          const lastAt = lastPostAtRef.current.get(candidate.businessProfileId) ?? 0;
          if (nowMs - lastAt < LOCAL_REPOST_THROTTLE_MS) continue;
          lastPostAtRef.current.set(candidate.businessProfileId, nowMs);

          const prev = prevPosRef.current;
          postProximityEnter({
            businessProfileId: candidate.businessProfileId,
            lat: gp.lat,
            lng: gp.lng,
            occurredAt: now.toISOString(),
            prevLat: prev?.lat ?? null,
            prevLng: prev?.lng ?? null,
            prevAt: prev?.at ?? null,
          })
            .then((result) => {
              if (result.notified && result.ad) {
                showProximityAdToast(result.ad, t('proximity.adLabel', { defaultValue: '근처 매장' }), navigate);
              }
            })
            .catch(() => {});
        }

        prevPosRef.current = { lat: gp.lat, lng: gp.lng, at: now.toISOString() };
      });
    })();

    return () => {
      cancelled = true;
      stopWatch?.();
    };
  }, [enabled]); // eslint-disable-line react-hooks/exhaustive-deps -- t 변경으로 워처(watchLocation)를 재시작하지 않는다
}
