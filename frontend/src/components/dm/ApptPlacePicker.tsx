import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, LocateFixed } from 'lucide-react';
import OsmMap from '@/components/maps/OsmMap';
import { native } from '@/lib/native';
import { inServiceArea } from '@/lib/serviceArea';
import { BEN_THANH_FALLBACK } from '@/lib/mapDefaults';
import { fetchDistricts, localizedName, type District } from '@/api/master';
import { resolveDistrict } from '@/api/market';
import type { PickedLocation } from '@/pages/market/LocationPickerSheet';
import styles from './ApptPlacePicker.module.css';

interface Props {
  /** 마운트 시 지도 중심(매물 거래 장소 / 직전 선택). 없으면 벤탄. 이후 prop 변화는 무시한다. */
  initial?: { lat: number; lng: number } | null;
  /** 핀 좌표가 확정될 때마다(서비스 지역 안일 때만) 호출, 지역 밖이면 null. */
  onChange: (loc: PickedLocation | null) => void;
  detail: string;
  onDetailChange: (v: string) => void;
}

/**
 * 약속 시트 인라인 장소 선택 — 지도를 끌면 가운데 고정 핀 아래 좌표가 선택된다(손가락이 핀을 가리지 않음).
 * 장소 이름은 핀 좌표의 동(resolveDistrict) — 매물 등록 동이 아니라 항상 핀 기준.
 */
export default function ApptPlacePicker({ initial, onChange, detail, onDetailChange }: Props) {
  const { t } = useTranslation();
  const [districts, setDistricts] = useState<District[]>([]);
  // mapCenter = 지도가 향할 목표(내 위치 버튼으로만 바뀜), pin = 지금 핀 아래 좌표(이동 종료마다 갱신)
  const [mapCenter, setMapCenter] = useState<{ lat: number; lng: number }>(initial ?? BEN_THANH_FALLBACK);
  const [pin, setPin] = useState<{ lat: number; lng: number }>(initial ?? BEN_THANH_FALLBACK);

  useEffect(() => {
    fetchDistricts().then(setDistricts).catch(() => setDistricts([]));
  }, []);

  const outOfArea = !inServiceArea(pin.lat, pin.lng);
  const district = districts.length && !outOfArea ? resolveDistrict(pin.lat, pin.lng, districts) : null;

  useEffect(() => {
    onChange(district ? { districtCode: district.code, districtName: localizedName(district), lat: pin.lat, lng: pin.lng } : null);
  }, [district, pin, onChange]);

  const handleLocate = async () => {
    try {
      await native.ensureLocationPermission();
      const pos = await native.getLocation();
      setMapCenter({ lat: pos.lat, lng: pos.lng });
    } catch {
      /* 위치 불가 — 지도를 끌어 선택 */
    }
  };

  return (
    <div>
      <div className={styles.mapWrap}>
        <OsmMap center={mapCenter} markers={[]} onCenterChange={(lat, lng) => setPin({ lat, lng })} />
        <MapPin size={32} className={styles.centerPin} aria-hidden />
        <button type="button" className={styles.locateBtn} onClick={handleLocate}
          aria-label={t('map.locate', { defaultValue: '내 위치로' })}>
          <LocateFixed size={20} />
        </button>
      </div>
      <div className={outOfArea ? `${styles.area} ${styles.areaOut}` : styles.area}>
        <MapPin size={14} />
        {outOfArea
          ? t('market.outOfService', { defaultValue: '서비스 미제공 지역입니다' })
          : district
            ? localizedName(district)
            : t('dm.apptPlaceDrag', { defaultValue: '지도를 움직여 장소를 정하세요' })}
      </div>
      <input
        className={styles.detail}
        value={detail}
        maxLength={60}
        onChange={(e) => onDetailChange(e.target.value)}
        placeholder={t('dm.apptPlaceDetailPh', { defaultValue: '예: 벤탄시장 정문 앞' })}
      />
    </div>
  );
}
