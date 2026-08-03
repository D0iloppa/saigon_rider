import { useEffect, useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import SaigonMapV5 from '@/components/maps/SaigonMapV5';
import { usePoiMarkers } from '@/components/maps/usePoiMarkers';
import type { MapMarkerV2 } from '@/components/maps/v2/region';
import { fetchDistricts, localizedName, type District } from '@/api/master';
import { resolveDistrict } from '@/api/market';
import { inServiceArea } from '@/lib/serviceArea';
import { HCMC_DISPLAY_CENTER } from '@/lib/mapDefaults';
import type { PickedLocation } from '@/pages/market/LocationPickerSheet';
import styles from '@/pages/market/LocationPickerSheet.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
  /** 진입 시 포커스·기본 핀 좌표(기존 선택 위치). 없으면 벤탄 기본좌표. */
  value?: { lat: number; lng: number } | null;
  onConfirm: (loc: PickedLocation) => void;
}

/**
 * 업체 위치 선택 — 동네지도(SaigonMapV5) 위에서 L3 상세지도 + POI 참조 레이어를 보며
 * 탭한 지점에 정확히 핀을 찍는다. 대표 지시(260803): 크로스헤어가 아니라 탭-투-픽 방식,
 * 서비스 지역(37개 동) 확장은 이번에 하지 않는다 — 지역 밖은 확인 버튼 비활성 + 안내 문구.
 */
export default function BizLocationPicker({ open, onClose, value, onConfirm }: Props) {
  const { t, i18n } = useTranslation();
  const [districts, setDistricts] = useState<District[]>([]);
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(value ?? null);
  const [district, setDistrict] = useState<District | null>(null);
  const [bbox, setBbox] = useState<{ N: number; S: number; E: number; W: number } | null>(null);
  const poiMarkers = usePoiMarkers(bbox, i18n.language);

  useEffect(() => {
    fetchDistricts().then(setDistricts).catch(() => setDistricts([]));
  }, []);

  // 진입 시 기본 좌표 → 구 스냅 (LocationPickerSheet와 동일 패턴)
  useEffect(() => {
    if (!open || !districts.length) return;
    const start = value ?? picked ?? HCMC_DISPLAY_CENTER;
    setPicked(start);
    setDistrict(resolveDistrict(start.lat, start.lng, districts));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, districts, value]);

  const apply = (lat: number, lng: number) => {
    setPicked({ lat, lng });
    setDistrict(resolveDistrict(lat, lng, districts));
  };

  // picked 가 없는 동안(위치 미확정)은 outOfArea 가 항상 false — 첫 화면에서 경고를 띄우지 않는다.
  const outOfArea = !!picked && !inServiceArea(picked.lat, picked.lng);

  const markers = useMemo<MapMarkerV2[]>(() => {
    if (!picked) return poiMarkers;
    return [...poiMarkers, { id: 'pick', lat: picked.lat, lng: picked.lng, kind: 'biz', selected: true }];
  }, [poiMarkers, picked]);

  const confirm = () => {
    if (!picked || !district) return;
    onConfirm({ districtCode: district.code, districtName: localizedName(district), lat: picked.lat, lng: picked.lng });
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} height="full">
      <div className={styles.sheet}>
        <h2 className={styles.title}>{t('biz.pickLocation', { defaultValue: '가게 위치 선택' })}</h2>
        <p className={styles.desc}>
          {outOfArea
            ? t('market.outOfServiceDetail', { defaultValue: '지금은 호치민 중심부(1군·3군 등 37개 동)에서만 이용할 수 있어요. 서비스 지역은 순차 확대될 예정이에요.' })
            : t('biz.pickLocationDesc', { defaultValue: '지도를 탭해 정확한 가게 위치에 핀을 찍으세요' })}
        </p>
        <div className={styles.mapWrap}>
          <SaigonMapV5
            height={380}
            initialGps={value ?? picked ?? HCMC_DISPLAY_CENTER}
            lightweight={false}
            // polyActive=false: pickMode 탭은 ward 판정(selWard 갱신)을 건너뛰므로, true로 두면
            // 초기 focus ward 밖으로 팬만 해도 그 지역 L3(건물/도로)가 렌더되지 않는다(대표 요구 위반).
            // 이 피커는 initialGps로 L3 임계값(~1.1km, 700유닛) 안쪽에서 시작하는데 ward 평균
            // 폭은 ~1520유닛(전체 37동 평균)이라 뷰포트엔 보통 1~2개 ward만 걸친다 — NeighborhoodMap이
            // 전 지역 조망(37동 동시 표시)에서 겪은 2.4배/7.5초 비용과는 스케일이 다르다. 게다가
            // depth3는 폴리곤 안이든 밖이든 뷰포트 안 모든 ward에 대해 이미 fetch됨(onViewportChange
            // 의 loadWardData가 polyActive와 무관) — false는 렌더 필터만 푸는 것이라 추가 네트워크
            // 비용도 없다.
            polyActive={false}
            pickMode
            onPointPick={({ lat, lng }) => apply(lat, lng)}
            onBboxChange={setBbox}
            markers={markers}
            forceMarkers
          />
        </div>
        <div className={styles.footer}>
          <span className={styles.selected}>
            <MapPin size={16} className={styles.pin} />
            {outOfArea
              ? t('market.outOfService', { defaultValue: '서비스 미제공 지역입니다' })
              : district ? localizedName(district) : t('market.pickLocationNone', { defaultValue: '동네를 선택하세요' })}
          </span>
          <Button onClick={confirm} disabled={!picked || !district || outOfArea} fullWidth={false} style={{ minWidth: 72 }}>
            {t('common.confirm', { defaultValue: '확인' })}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
