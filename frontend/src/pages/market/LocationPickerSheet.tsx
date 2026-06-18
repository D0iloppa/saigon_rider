import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import SaigonMapV2 from '@/components/maps/SaigonMapV2';
import type { SelectedRegion } from '@/components/maps/v2/region';
import { fetchDistricts, localizedName, type District } from '@/api/master';
import { resolveDistrict } from '@/api/market';
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
 * SaigonMapV2 pickMode: depth3(블록)까지 확대 후 탭 → 정밀 좌표 핀.
 * 저장은 정밀 좌표, 표시는 구 단위(resolveDistrict). §7: 정확위치 비노출.
 */
export default function LocationPickerSheet({ open, onClose, value, onConfirm }: Props) {
  const { t } = useTranslation();
  const [districts, setDistricts] = useState<District[]>([]);
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(value ?? null);
  const [district, setDistrict] = useState<District | null>(null);

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

  const handleRegion = (r: SelectedRegion) => apply(r.lat, r.lng);

  const confirm = () => {
    if (!picked || !district) return;
    onConfirm({ districtCode: district.code, districtName: localizedName(district), lat: picked.lat, lng: picked.lng });
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} height="full">
      <div className={styles.sheet}>
        <h2 className={styles.title}>{t('market.pickLocation', { defaultValue: '거래 희망 장소' })}</h2>
        <p className={styles.desc}>{t('market.pickLocationDesc', { defaultValue: '지도를 확대해 정확한 위치를 탭하세요' })}</p>
        <div className={styles.mapWrap}>
          <SaigonMapV2
            height={380}
            initialGps={value ?? undefined}
            locateOnMount={!value}
            pickMode
            onPointPick={apply}
            onRegionSelect={handleRegion}
          />
        </div>
        <div className={styles.footer}>
          <span className={styles.selected}>
            <MapPin size={16} className={styles.pin} />
            {district ? localizedName(district) : t('market.pickLocationNone', { defaultValue: '동네를 선택하세요' })}
          </span>
          <Button onClick={confirm} disabled={!picked || !district} fullWidth={false} style={{ minWidth: 72 }}>
            {t('common.confirm', { defaultValue: '확인' })}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
