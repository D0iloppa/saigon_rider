export type ExplorationFallbackReason = 'outside_area' | 'permission' | 'timeout' | 'unavailable';

export interface ExplorationCoords {
  lat: number;
  lng: number;
}

export interface ExplorationLocation {
  coords: ExplorationCoords;
  coordsSource: 'device' | 'fallback';
  gateReason: ExplorationFallbackReason | null;
}

export interface ExplorationMapMount {
  initialGps: ExplorationCoords | undefined;
  locateOnMount: boolean;
  meDotOnMount: boolean;
}

export function resolveExplorationMapMount(
  location: Pick<ExplorationLocation, 'coords'> | null,
  pinnedAll: boolean,
  fallback: ExplorationCoords,
): ExplorationMapMount {
  if (pinnedAll) {
    return { initialGps: undefined, locateOnMount: false, meDotOnMount: false };
  }
  return {
    initialGps: location?.coords ?? fallback,
    locateOnMount: true,
    meDotOnMount: true,
  };
}

/** 탐색 화면의 조회·카메라 기준만 결정한다. 실행형/기록형 위치 게이트에는 쓰지 않는다. */
export function resolveExplorationLocation(
  position: ExplorationCoords,
  isHcmcPosition: boolean,
  fallback: ExplorationCoords,
): ExplorationLocation {
  if (isHcmcPosition) {
    return { coords: position, coordsSource: 'device', gateReason: null };
  }
  return { coords: fallback, coordsSource: 'fallback', gateReason: 'outside_area' };
}

export function fallbackExplorationLocation(
  reason: Exclude<ExplorationFallbackReason, 'outside_area'>,
  fallback: ExplorationCoords,
): ExplorationLocation {
  return { coords: fallback, coordsSource: 'fallback', gateReason: reason };
}

export function isLocationExecutionAvailable(
  coordsSource: 'device' | 'fallback' | null,
  gateReason: string | null,
  accuracyM: number | null,
  accuracyLimitM: number,
): boolean {
  return coordsSource !== null && gateReason === null
    && (accuracyM === null || accuracyM <= accuracyLimitM);
}
