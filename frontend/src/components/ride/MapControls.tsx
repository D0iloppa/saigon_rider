import { forwardRef, useCallback, useEffect, useImperativeHandle, useState } from 'react';
import { Locate, LocateFixed } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { CompassRoseIcon, HeadingConeIcon } from '@/components/maps/compassIcons';
import type { MapCanvasHandle } from './MapCanvas';
import styles from './MapControls.module.css';

/**
 * ◎ 상태기계 (W17, 2026-08-08) — 동네지도(SaigonMapV5)의 3상태 순환 "정의"를 길찾기에도 맞춘다.
 * 코드 공유가 아니라 정의 통일이다(감독 지시) — 동네지도는 heading 추종에 자력계를 쓰지만,
 * 길찾기는 그 자리에 course-up(경로 스냅 방위 1순위, GPS heading 2순위, RideNav.courseBearing())을
 * 넣는다. 회전 소스만 다르고 자유→카메라추종→course-up추종→자유 순환 자체는 동일하다.
 *   'free'     — 카메라가 위치를 따라가지 않는다(사용자가 지도를 직접 탐색 중).
 *   'camera'   — 위치를 따라가되 회전은 없다(북향 유지 또는 사용자가 손으로 돌려둔 각 그대로).
 *   'courseUp' — 위치를 따라가며 진행방향이 위로 오도록 회전한다.
 */
type FollowStage = 'free' | 'camera' | 'courseUp';

export interface MapControlsHandle {
  /** MapCanvas 의 회전 통지(onBearingChange) 중계 — 북향복귀 버튼 표시조건(bearing!==0)에 쓴다. */
  setBearing: (deg: number) => void;
  /** MapCanvas 의 제스처 통지(onGestureStart) 중계 — 카메라추종/course-up추종을 즉시 'free' 로 내린다. */
  notifyGesture: () => void;
  /** 경로 안내 시작(startGuidance) 직후 course-up추종으로 올린다 — 기존(리팩터 전) "안내 시작 =
   * course-up 자동 추종" 동작과 동일하게 유지하기 위한 배선용 진입점. */
  setStage: (stage: FollowStage) => void;
}

interface MapControlsProps {
  mapRef: React.RefObject<MapCanvasHandle>;
  /** 현재 위치 tick — 바뀔 때마다 'free' 가 아니면 카메라가 따라간다. */
  dotPos?: { lat: number; lng: number } | null;
  /**
   * course-up 단계에서 적용할 진행방향(도). RideNav.courseBearing() 이 경로 스냅 세그먼트 방위
   * 1순위·이탈 시 GPS heading 2순위로 계산해 넘긴다 — 이 컴포넌트는 그 값을 'courseUp' 단계에서만
   * 그대로 쓴다(값의 출처는 호출부 책임, 여기선 "언제 적용하느냐"만 판단한다).
   */
  courseBearingDeg?: number | null;
}

/** 지도 우측 플로팅 컨트롤 (나침반·내 위치). nav·quest 공용. */
const MapControls = forwardRef<MapControlsHandle, MapControlsProps>(function MapControls(
  { mapRef, dotPos, courseBearingDeg },
  ref,
) {
  const { t } = useTranslation();
  // 기본값 'camera' — 리팩터 전 동작(위치 tick 마다 항상 카메라가 따라감)과 동일한 초기 상태를
  // 유지하기 위한 의도적 선택이다. 동네지도는 기본값이 'free'(자유 탐색이 메인 용도)지만,
  // 길찾기/퀘스트 추적 화면은 진입 즉시 내 위치를 따라가는 것이 기존 기대치였다 — 3상태
  // "순환"의 정의는 동일하게 맞추되, 초기값은 화면 목적에 맞게 다르게 둔다(감독 지시: 코드
  // 공유가 아니라 정의 통일).
  const [stage, setStageState] = useState<FollowStage>('camera');
  const [bearing, setBearing] = useState(0);

  useImperativeHandle(ref, () => ({
    setBearing,
    notifyGesture: () => setStageState('free'),
    setStage: setStageState,
  }), []);

  // 위치 tick 을 따라 카메라 이동 — 'free' 에서는 아무것도 하지 않는다(제스처로 이탈했거나
  // 아직 추종을 시작하지 않은 상태). courseBearingDeg 는 'courseUp' 단계에서만 넘긴다 — MapCanvas.
  // follow() 는 받은 값이 있으면 그대로 회전에 반영하므로, "회전을 적용할지"의 판단은 여기서 끝낸다
  // (③ 대표 지시 확인 결과: follow() 는 이미 courseBearing!=null 일 때만 회전하므로, 'courseUp' 을
  // 벗어난 단계에서 null 을 넘기기만 하면 북향복귀가 다음 tick 에 되돌려지는 결함이 생기지 않는다).
  useEffect(() => {
    if (stage === 'free' || !dotPos) return;
    mapRef.current?.follow(dotPos, stage === 'courseUp' ? courseBearingDeg ?? null : null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [dotPos?.lat, dotPos?.lng, stage]);

  // ◎ 탭 — 자유→카메라추종→course-up추종→자유 순환(대표 확정 사항, 재논의 금지).
  const recenterCurrentContext = useCallback(() => {
    if (stage === 'free') {
      if (dotPos) mapRef.current?.recenter(dotPos);
      setStageState('camera');
    } else if (stage === 'camera') {
      setStageState('courseUp');
    } else {
      // course-up추종 → 자유: 추종과 회전을 함께 끈다(북향 복귀 포함) — 동네지도의
      // heading추종→자유(isFollowing=false + compassMode='north')와 동일한 정의.
      mapRef.current?.resetNorth();
      setStageState('free');
    }
  }, [stage, dotPos, mapRef]);

  // 북향복귀 탭 — bearing!==0 일 때만 노출되는 버튼(아래 JSX). course-up추종 중이면 회전축만
  // 내려 카메라추종으로 낮춘다 — 그대로 'courseUp' 에 두면 바로 다음 위치 tick 이 courseBearingDeg
  // 를 다시 넘겨 회전을 되돌린다(③ 에서 확인한, 옛 구조라면 재발했을 결함의 재발 방지 지점).
  // 손 회전(원 MapLibre 회전 제스처)으로 bearing!==0 이 된 경우는 stage 가 'camera'/'free' 그대로라
  // 이 분기를 타지 않고 resetNorth() 만 실행된다.
  const resetNorth = useCallback(() => {
    mapRef.current?.resetNorth();
    if (stage === 'courseUp') setStageState('camera');
  }, [stage, mapRef]);

  return (
    <div className={styles.wrap}>
      {bearing !== 0 && (
        <button className={styles.btn} onClick={resetNorth} aria-label={t('rideNav.resetNorth', '북쪽 맞춤')}>
          <span className={styles.compass}>
            <CompassRoseIcon size={22} style={{ transform: `rotate(${-bearing}deg)` }} />
          </span>
        </button>
      )}
      <button className={styles.btn} onClick={recenterCurrentContext} aria-label={t('rideNav.myLocation', '내 위치')}>
        <span className={styles.locate}>
          {stage === 'courseUp'
            ? <HeadingConeIcon size={22} />
            : stage === 'camera'
              ? <LocateFixed size={22} strokeWidth={2.2} aria-hidden="true" />
              : <Locate size={22} strokeWidth={2.2} aria-hidden="true" />}
        </span>
      </button>
    </div>
  );
});

export default MapControls;
