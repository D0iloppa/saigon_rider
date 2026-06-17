import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { StatusBar } from '@/components/layout/StatusBar';
import MapCanvas, { type MapCanvasHandle } from '@/components/ride/MapCanvas';
import MapControls from '@/components/ride/MapControls';
import { native } from '@/lib/native';
import styles from './NeighborhoodMap.module.css';

/**
 * 동네지도 (SGR-287) — RideNav의 MapCanvas/MapControls 재사용.
 * 내 위치 중심의 동네 지도. (매물·정비소 핀 등은 후속에 추가 가능)
 */
export default function NeighborhoodMap() {
  const { t } = useTranslation();
  const mapRef = useRef<MapCanvasHandle>(null);
  const [pos, setPos] = useState<{ lat: number; lng: number } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        await native.ensureLocationPermission();
        const p = await native.getLocation();
        if (!cancelled) setPos({ lat: p.lat, lng: p.lng });
      } catch {
        /* 권한 거부 등 — MapCanvas 기본 HCMC 중심 폴백 */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // GPS 확정 시 내 위치로 자동 이동(초기 진입 시 HCMC 폴백에 머무는 문제 방지)
  useEffect(() => {
    if (pos) mapRef.current?.recenter(pos);
  }, [pos]);

  const recenter = () => {
    if (pos) mapRef.current?.recenter(pos);
  };
  const resetNorth = () => mapRef.current?.resetNorth();

  return (
    <div className={styles.root}>
      <div className={styles.header}>
        <StatusBar variant="dark" />
        <h1 className={styles.title}>{t('tabbar.map', { defaultValue: '동네지도' })}</h1>
      </div>
      <div className={styles.mapWrap}>
        <MapCanvas ref={mapRef} origin={pos} current={pos} className={styles.map} />
        <MapControls onRecenter={recenter} onResetNorth={resetNorth} />
      </div>
    </div>
  );
}
