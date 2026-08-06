import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Globe, LocateFixed } from 'lucide-react';
import { BottomSheet } from '@/components/ui/BottomSheet';
import { Button } from '@/components/ui/Button';
import { RadioCircle } from '@/components/ui/RadioCircle';
import { useLocationStore, type LocationMode } from '@/store/useLocationStore';
import styles from './DisplayScopeSheet.module.css';

interface Props {
  open: boolean;
  onClose: () => void;
}

/**
 * 표시범위 시트 — 앱 공용 (마켓·동네지도·정보 화면).
 *
 * 옵션은 **2개뿐이다**: '내 현재 위치'(gps) ↔ '전체 지역'(all).
 * 대표 지시 2026-08-06 "2개로만해 / 모든화면에서 / gps기본" — 종전의 '지역 선택'(지도에서 동을
 * 골라 필터) 옵션은 폐기됐다. 화면마다 기준이 갈리던 원인이었다.
 * 설계도: ai-docs/260806_gps_scope_unification_design.md
 *
 * 적용(Áp dụng)을 눌러야 반영된다 — 종전 마켓 시트의 draft→apply 동선을 그대로 유지한다.
 */
export function DisplayScopeSheet({ open, onClose }: Props) {
  const { t } = useTranslation();
  const mode = useLocationStore((s) => s.mode);
  const wardName = useLocationStore((s) => s.wardName);
  const coordsSource = useLocationStore((s) => s.coordsSource);
  const setMode = useLocationStore((s) => s.setMode);
  const [draft, setDraft] = useState<LocationMode>(mode);
  const [wasOpen, setWasOpen] = useState(open);

  // 열리는 순간 현재 모드로 draft 를 되돌린다 — 취소하고 다시 열었을 때 이전 초안이 남으면
  // 안 된다. 이펙트가 아니라 렌더 중 조정이다(React 공식 "props 변경 시 state 조정" 패턴) —
  // 이펙트로 하면 초안이 한 프레임 늦게 반영돼 깜빡인다.
  if (open !== wasOpen) {
    setWasOpen(open);
    if (open) setDraft(mode);
  }

  // 헤더의 현재 상태 표기. 권역 밖이라 중심가로 대체된 상태에서는 동네명을 쓰지 않는다 —
  // "내 현재 위치"로 보이면 사용자가 결과를 오해한다(coordsSource 'fallback').
  const currentTitle = mode === 'all'
    ? t('market.allAreas')
    : coordsSource === 'fallback'
      ? t('market.outOfService', { defaultValue: '서비스 미제공 지역입니다' })
      : wardName ?? t('market.currentLocation');
  const currentMeta = mode === 'all' ? t('market.locationMetaAll') : t('market.locationMetaGps');

  const apply = () => {
    void setMode(draft);
    onClose();
  };

  return (
    <BottomSheet open={open} onClose={onClose}>
      <div className={styles.sheet}>
        <div className={styles.header}>
          <span className={styles.eyebrow}>{t('market.locationScope')}</span>
          <strong className={styles.current}>{currentTitle}</strong>
          <p className={styles.desc}>{currentMeta}</p>
        </div>

        <button
          className={`${styles.card} ${draft === 'gps' ? styles.cardActive : ''}`}
          onClick={() => setDraft('gps')}
        >
          <span className={styles.cardIcon}><LocateFixed size={20} strokeWidth={2} /></span>
          <span className={styles.cardBody}>
            <strong className={styles.cardTitle}>{t('market.currentLocation')}</strong>
            <span className={styles.cardText}>{t('market.locationMetaGps')}</span>
          </span>
          <span className={styles.cardCheck}><RadioCircle checked={draft === 'gps'} /></span>
        </button>

        <button
          className={`${styles.card} ${draft === 'all' ? styles.cardActive : ''}`}
          onClick={() => setDraft('all')}
        >
          <span className={styles.cardIcon}><Globe size={20} strokeWidth={2} /></span>
          <span className={styles.cardBody}>
            <strong className={styles.cardTitle}>{t('market.allAreas')}</strong>
            <span className={styles.cardText}>{t('market.locationMetaAll')}</span>
          </span>
          <span className={styles.cardCheck}><RadioCircle checked={draft === 'all'} /></span>
        </button>

        <div className={styles.actions}>
          <Button variant="ghost" size="md" fullWidth={false} onClick={onClose}>
            {t('common.cancel')}
          </Button>
          <Button size="md" fullWidth={false} onClick={apply}>
            {t('market.applyLocation')}
          </Button>
        </div>
      </div>
    </BottomSheet>
  );
}
