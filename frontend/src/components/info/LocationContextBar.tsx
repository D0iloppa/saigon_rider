import { useEffect, useState, type ReactNode } from 'react';
import { ChevronDown, MapPin } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { DisplayScopeSheet } from '@/components/location/DisplayScopeSheet';
import { useLocationStore } from '@/store/useLocationStore';
import sys from '@/styles/system.module.css';
import styles from './LocationContextBar.module.css';

interface Props {
  trailing?: ReactNode;
  /**
   * 표시 범위를 고를 수 없는 화면 — 위치를 라벨로만 보여준다.
   *
   * 날씨가 이 경우다: "전체 지역의 날씨"라는 건 없고 결국 도시 중심 한 점을 보여줄 뿐이라
   * 선택지를 주는 게 오히려 오해를 만든다(대표 지적 2026-08-06). 목록형(주유소·정비소)은
   * '전체'가 실제로 의미가 있어 선택지를 유지한다.
   */
  readOnly?: boolean;
}

/**
 * 정보 화면(주유/정비/침수/날씨) 공통 컨텍스트바 — 표시 범위 단일 소스(useLocationStore).
 *
 * 종전에는 동(ward) 목록 드롭다운으로 지역을 골랐다. 그 지역 선택은 폐기됐다 —
 * 대표 지시 2026-08-06 "주유소. 강수. 등. 지역이 뭔기준이냐 / 그거 gps로 잡아라 / 2개로만해".
 * 이제 마켓·동네지도와 같은 2옵션 시트(DisplayScopeSheet)를 연다.
 * 설계도: ai-docs/260806_gps_scope_unification_design.md §6.4
 *
 * `trailing` 으로 지도 토글 등 우측 컨트롤을 붙인다.
 */
export default function LocationContextBar({ trailing, readOnly = false }: Props) {
  const { t } = useTranslation();
  const mode = useLocationStore((s) => s.mode);
  const wardName = useLocationStore((s) => s.wardName);
  const coordsSource = useLocationStore((s) => s.coordsSource);
  const ensureLocation = useLocationStore((s) => s.ensureLocation);
  const [sheetOpen, setSheetOpen] = useState(false);

  // 진입 시 측위 — 스토어가 세션당 1회로 묶는다(정보 4화면이 각자 불러도 실측은 한 번).
  useEffect(() => { void ensureLocation(); }, [ensureLocation]);

  // 권역 밖이라 중심가로 대체된 상태에서는 동네명을 쓰지 않는다(설계도 §4.3 coordsSource).
  const label = mode === 'all'
    ? t('location.allTitle')
    : coordsSource === 'fallback'
      ? t('location.fallbackTitle')
      : wardName ?? t('location.gpsTitle');

  return (
    <div className={sys.contextBar}>
      <MapPin size={15} className={sys.contextIcon} />
      {readOnly ? (
        // 고를 게 없으므로 버튼이 아니다 — 탭해도 아무 일이 없는 컨트롤을 두지 않는다.
        <span className={`${sys.chipBtn} ${styles.selectWrap}`}>
          <span className={styles.selectFace}>{label}</span>
        </span>
      ) : (
        <button
          type="button"
          className={`${sys.chipBtn} ${mode === 'gps' ? sys.chipBtnActive : ''} ${styles.selectWrap}`}
          onClick={() => setSheetOpen(true)}
        >
          <span className={styles.selectFace}>
            {label}
            <ChevronDown size={14} className={styles.selectChevron} />
          </span>
        </button>
      )}
      <span className={sys.contextSpacer} />
      {trailing}
      {!readOnly && <DisplayScopeSheet open={sheetOpen} onClose={() => setSheetOpen(false)} />}
    </div>
  );
}
