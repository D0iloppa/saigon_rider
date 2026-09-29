import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import OsmMap from '@/components/maps/OsmMap';
import styles from './ApptPlaceThumb.module.css';

interface Props {
  lat: number;
  lng: number;
  /** 있으면 탭 가능한 버튼으로 렌더(약속 시트 열기 등). */
  onClick?: () => void;
}

/**
 * 약속 장소 정지 지도 썸네일 — 타일이 벡터(OpenFreeMap)뿐이라 정적 이미지가 없어, 화면에 보일 때만
 * 비인터랙티브 지도를 마운트하고 벗어나면 내려 WebGL 컨텍스트를 카드 수만큼 쌓지 않는다.
 */
export default function ApptPlaceThumb({ lat, lng, onClick }: Props) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const io = new IntersectionObserver(([entry]) => setVisible(entry.isIntersecting), { rootMargin: '80px' });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={styles.wrap}>
      {visible && (
        <OsmMap center={{ lat, lng }} markers={[]} pickedPoint={{ lat, lng }} interactive={false} />
      )}
      {onClick && <button type="button" className={styles.hit} onClick={onClick} aria-label={t('dm.apptMapOpen', { defaultValue: '약속 장소 지도 보기' })} />}
    </div>
  );
}
