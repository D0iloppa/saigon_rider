import { useTranslation } from 'react-i18next';
import MarkerLocationPicker from '@/components/maps/MarkerLocationPicker';
import type { PickedLocation } from '../market/LocationPickerSheet';

interface Props {
  open: boolean;
  onClose: () => void;
  value?: { lat: number; lng: number } | null;
  onConfirm: (loc: PickedLocation) => void;
}

/** 약속 장소 선택 — 공용 MarkerLocationPicker 에 약속용 문구만 주입. */
export default function AppointmentLocationPicker(props: Props) {
  const { t } = useTranslation();
  return (
    <MarkerLocationPicker
      {...props}
      title={t('market.pickLocation', { defaultValue: '거래 희망 장소' })}
      desc={t('dm.apptPlaceTap', { defaultValue: '지도를 탭해 약속 장소에 마커를 찍으세요' })}
    />
  );
}
