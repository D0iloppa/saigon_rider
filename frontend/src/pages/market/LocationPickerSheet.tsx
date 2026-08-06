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
import styles from './LocationPickerSheet.module.css';

export interface PickedLocation {
  districtCode: string;
  districtName: string;
  lat: number;
  lng: number;
}

interface Props {
  open: boolean;
  onClose: () => void;
  /** 진입 시 포커스·기본 선택 좌표(보통 내 위치 또는 기존 선택). */
  value?: { lat: number; lng: number } | null;
  onConfirm: (loc: PickedLocation) => void;
}

/**
 * 위치 선택 시트 (SGR-304) — 등록·약속잡기 공용.
 * SaigonMapV5 pickMode: L3 상세지도 + POI 참조 레이어를 보며 탭 → 정밀 좌표 핀.
 * 저장은 정밀 좌표, 표시는 구 단위(resolveDistrict). §7: 정확위치 비노출.
 * (2026-08-05 대표 지적으로 SaigonMapV2 → V5 교체 — V2 엔진엔 POI 레이어가 없어 랜드마크
 *  없이 회색 블록만 보고 좌표를 찍어야 했다. 업체등록 피커 `pages/biz/BizLocationPicker.tsx`
 *  가 같은 이유로 먼저 V5 로 갔던 것을 이 공용 시트에도 적용.)
 */
export default function LocationPickerSheet({ open, onClose, value, onConfirm }: Props) {
  const { t, i18n } = useTranslation();
  const [districts, setDistricts] = useState<District[]>([]);
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(value ?? null);
  const [district, setDistrict] = useState<District | null>(null);
  const [bbox, setBbox] = useState<{ N: number; S: number; E: number; W: number } | null>(null);
  const poiMarkers = usePoiMarkers(bbox, i18n.language);

  useEffect(() => {
    fetchDistricts().then(setDistricts).catch(() => setDistricts([]));
  }, []);

  // 진입 시 기본 좌표 → 구 스냅
  useEffect(() => {
    if (!open || !districts.length || !value) return;
    setPicked(value);
    setDistrict(resolveDistrict(value.lat, value.lng, districts));
  }, [open, districts, value]);

  const apply = (lat: number, lng: number) => {
    setPicked({ lat, lng });
    setDistrict(resolveDistrict(lat, lng, districts));
  };

  // picked 가 없는 동안(위치 미확정)은 outOfArea 가 항상 false — 첫 화면에서 경고를 띄우지 않는다.
  const outOfArea = !!picked && !inServiceArea(picked.lat, picked.lng);

  // POI 먼저 = 찍은 핀이 그 위에 그려진다 (BizLocationPicker 와 동일 순서)
  const markers = useMemo<MapMarkerV2[]>(() => (
    picked ? [...poiMarkers, { id: 'pick', lat: picked.lat, lng: picked.lng, kind: 'biz', selected: true }] : poiMarkers
  ), [poiMarkers, picked]);

  const confirm = () => {
    if (!picked || !district) return;
    onConfirm({ districtCode: district.code, districtName: localizedName(district), lat: picked.lat, lng: picked.lng });
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} height="full">
      <div className={styles.sheet}>
        <h2 className={styles.title}>{t('market.pickLocation', { defaultValue: '거래 희망 장소' })}</h2>
        <p className={styles.desc}>
          {outOfArea
            ? t('market.outOfServiceDetail', { defaultValue: '지금은 호치민 중심부(1군·3군 등 37개 동)에서만 이용할 수 있어요. 서비스 지역은 순차 확대될 예정이에요.' })
            : t('market.pickLocationDesc', { defaultValue: '지도를 확대해 정확한 위치를 탭하세요' })}
        </p>
        <div className={styles.mapWrap}>
          <SaigonMapV5
            height={380}
            initialGps={value ?? picked ?? HCMC_DISPLAY_CENTER}
            lightweight={false}
            // polyActive=false 근거는 BizLocationPicker 주석 참조 — pickMode 탭은 selWard 를
            // 갱신하지 않으므로 true 면 초기 ward 밖으로 팬했을 때 L3(건물/도로)가 렌더되지 않는다.
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
