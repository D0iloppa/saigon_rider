import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin, LocateFixed } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import OsmMap from '@/components/maps/OsmMap';
import { native } from '@/lib/native';
import { inServiceArea } from '@/lib/serviceArea';
import { fetchDistricts, localizedName, type District } from '@/api/master';
import { resolveDistrict } from '@/api/market';
import type { PickedLocation } from '../market/LocationPickerSheet';
import styles from '../market/LocationPickerSheet.module.css';

const DEFAULT_CENTER = { lat: 10.7769, lng: 106.7009 };

interface Props {
  open: boolean;
  onClose: () => void;
  value?: { lat: number; lng: number } | null;
  onConfirm: (loc: PickedLocation) => void;
}

/**
 * 약속 장소 선택 — OSM 지도 탭으로 마커를 떨어뜨려 정밀 좌표 지정.
 * 저장은 정밀 좌표, 표시는 동(resolveDistrict) 단위.
 */
export default function AppointmentLocationPicker({ open, onClose, value, onConfirm }: Props) {
  const { t } = useTranslation();
  const [districts, setDistricts] = useState<District[]>([]);
  const [picked, setPicked] = useState<{ lat: number; lng: number } | null>(value ?? null);
  const [district, setDistrict] = useState<District | null>(null);

  useEffect(() => {
    fetchDistricts().then(setDistricts).catch(() => setDistricts([]));
  }, []);

  useEffect(() => {
    if (!open) return;
    setPicked(value ?? null);
    if (value && districts.length) setDistrict(resolveDistrict(value.lat, value.lng, districts));
  }, [open, value, districts]);

  const handlePick = (lat: number, lng: number) => {
    setPicked({ lat, lng });
    setDistrict(resolveDistrict(lat, lng, districts));
  };

  const handleLocate = async () => {
    try {
      await native.ensureLocationPermission();
      const pos = await native.getLocation();
      handlePick(pos.lat, pos.lng);
    } catch {
      /* 위치 불가 — 무시 (지도 탭으로 선택) */
    }
  };

  const outOfArea = !!picked && !inServiceArea(picked.lat, picked.lng);

  const confirm = () => {
    if (!picked || !district || outOfArea) return;
    onConfirm({ districtCode: district.code, districtName: localizedName(district), lat: picked.lat, lng: picked.lng });
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose} height="full">
      <div className={styles.sheet}>
        <h2 className={styles.title}>{t('market.pickLocation', { defaultValue: '거래 희망 장소' })}</h2>
        <p className={styles.desc}>{t('dm.apptPlaceTap', { defaultValue: '지도를 탭해 약속 장소에 마커를 찍으세요' })}</p>
        <div className={styles.mapWrap} style={{ height: 380, position: 'relative' }}>
          <OsmMap
            center={picked ?? value ?? DEFAULT_CENTER}
            markers={[]}
            pickedPoint={picked}
            onMapClick={handlePick}
          />
          <button
            type="button"
            onClick={handleLocate}
            aria-label={t('map.locate', { defaultValue: '내 위치로' })}
            style={{
              position: 'absolute', right: 12, bottom: 12, zIndex: 2,
              width: 40, height: 40, borderRadius: '50%',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: 'var(--surface)', color: 'var(--text)',
              border: '1px solid var(--line)', boxShadow: '0 2px 10px rgba(11,13,20,.18)',
            }}
          >
            <LocateFixed size={20} />
          </button>
        </div>
        <div className={styles.footer}>
          <span className={styles.selected} style={outOfArea ? { color: 'var(--danger, #e5484d)' } : undefined}>
            <MapPin size={16} className={styles.pin} />
            {outOfArea
              ? t('market.outOfService', { defaultValue: '서비스 미제공 지역입니다' })
              : district
                ? localizedName(district)
                : t('market.pickLocationNone', { defaultValue: '지도를 탭하세요' })}
          </span>
          <Button onClick={confirm} disabled={!picked || !district || outOfArea} fullWidth={false} style={{ minWidth: 72 }}>
            {t('common.confirm', { defaultValue: '확인' })}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
