import { native, type GeoPosition } from '@/lib/native';
import { BEN_THANH_FALLBACK } from '@/lib/mapDefaults';
import { inServiceArea } from '@/lib/serviceArea';

export interface ResolvedLocation {
  coords: { lat: number; lng: number };
  source: 'device' | 'fallback';
  reason?: 'outside_service_area';
}

/**
 * GPS 신뢰 임계값(m). 이보다 부정확한 좌표는 실행형·기록형 화면에서 쓰지 않는다.
 *
 * 종전에는 `RideNav` 의 watch tick 에만 이 게이트가 있었고 최초 측위에는 없었다 —
 * 실내에서 오차 2km 좌표로 경로를 계산하면 밖에 나가는 순간 이탈이 확정됐다
 * (260813 정책안 D-5). 두 경로가 같은 값을 쓰도록 여기로 승격했다.
 */
export const GPS_ACCURACY_LIMIT_M = 35;

/**
 * **일회성 측위**(`requireServiceLocation`)의 정확도 허용치(m).
 *
 * 위 35m 는 원래 watch tick 지터 필터였다 — 여러 tick 중 하나를 버리는 건 공짜다. 그러나
 * 일회성 획득은 `enableHighAccuracy:true, timeout:10s` 로 **한 번만** 부르고 재시도가 없어,
 * 같은 값을 적용하면 Android WebView 가 첫 응답을 네트워크/last-known 공급자로 주는
 * 흔한 경우(수십~수백 m)에 실외 사용자까지 기능을 못 쓰게 막는다(코드리뷰 지적 2026-08-13).
 *
 * 서비스 권역 판정의 단위가 동(ward, 대각 1~3km)이라 이 정도 오차로는 판정이 뒤집히지
 * 않으므로, 일회성 경로는 ward 스케일 허용치를 쓴다.
 */
export const GATE_ACCURACY_LIMIT_M = 200;

/**
 * GPS 권한을 요청하고 위치를 읽는다. **화면 mount 시 자동 호출 금지** — 사용자가
 * "내 주변순"·"현재 위치로 이동" 등 위치 기능을 명시적으로 눌렀을 때만 호출한다
 * (P1-3, service-rules.md:11-12). 호출부에서 목적을 먼저 알리고, 거부/timeout/서비스
 * 꺼짐을 구분해 처리해야 한다.
 */
export function requestDeviceLocation(): Promise<GeoPosition> {
  return native.ensureLocationPermission().then(() => native.getLocation());
}

/**
 * **탐색형(browse) 화면 전용** — 위치가 "조회 기준점"인 화면(홈·마켓·동네지도·정보 목록).
 *
 * 권역 밖이면 중심가 좌표로 폴백한다. 폴백해도 결과가 거짓이 아니기 때문이다
 * ("호치민 중심가 매물 39건"은 사실). 실행형·기록형 화면은 이 함수를 쓰지 말고
 * `requireServiceLocation()` 을 쓴다 — 그쪽은 폴백이 거짓 결과/데이터 위조가 된다
 * (260813 정책안 §1 계층 분할).
 */
export function resolveServiceLocation(position: GeoPosition): Promise<ResolvedLocation> {
  if (inServiceArea(position.lat, position.lng)) {
    return Promise.resolve({
      coords: { lat: position.lat, lng: position.lng },
      source: 'device',
    });
  }
  return Promise.resolve({
    coords: BEN_THANH_FALLBACK,
    source: 'fallback',
    reason: 'outside_service_area',
  });
}

export function resolveUsableLocation(): Promise<ResolvedLocation> {
  return requestDeviceLocation().then(resolveServiceLocation);
}

/**
 * 게이트 실패 사유. 화면은 이 값으로 안내 문구·액션 버튼을 고른다(`LocationGateBlock`).
 * `permission`/`timeout`/`unavailable` 은 `RideNav` 의 종전 3분류와 동일한 의미이며,
 * `inaccurate` 만 정책안 D-5 로 추가됐다.
 */
export type LocationGateReason =
  /** 실측했지만 서비스 권역(37개 동) 밖. */
  | 'outside_area'
  /** 사용자가 표시 범위를 '전체 지역'으로 **직접 고름** — 기기 문제가 아니다. */
  | 'scope_all'
  | 'permission'
  | 'timeout'
  | 'unavailable'
  | 'inaccurate';

export type LocationGateResult =
  | { ok: true; coords: { lat: number; lng: number } }
  | { ok: false; reason: LocationGateReason };

/**
 * 측위 실패를 사유별로 분류한다.
 * - GeolocationPositionError.code: 1=PERMISSION_DENIED, 2=POSITION_UNAVAILABLE, 3=TIMEOUT
 * - 'location_permission_denied' 는 과거 커스텀 Gps 권한 게이트가 던지던 값의 호환 안전망
 *   (현재 `requestDeviceLocation()` 은 권한 확인 결과로 진행을 막지 않으므로 —
 *   service-rules 원칙 13 — 실제 거부는 code===1 로 드러난다).
 */
export function classifyLocationError(e: unknown): Exclude<LocationGateReason, 'outside_area' | 'inaccurate'> {
  if (e instanceof Error && e.message === 'location_permission_denied') return 'permission';
  const code = (e as { code?: number } | null)?.code;
  if (code === 1) return 'permission';
  if (code === 3) return 'timeout';
  return 'unavailable';
}

/**
 * **실행형(act)·기록형(record) 화면 전용 게이트 — 폴백하지 않는다.**
 *
 * - 실행형: 내 위치가 **입력값**인 화면(경로안내·퀘스트 수행). 폴백하면 내가 있지 않은
 *   곳에서 출발하는 경로가 나온다 — 안내가 아니라 거짓 결과다.
 * - 기록형: 내 위치가 **저장값**인 화면(제보·피드 위치태그). 폴백 좌표를 저장하면
 *   데이터 위조이고, 복구 수단은 어드민 수동 삭제뿐이다.
 *
 * 실패 시 사유만 반환하고, 차단 UI(`LocationGateBlock`)는 호출부가 띄운다.
 * `BEN_THANH_FALLBACK` 을 절대 반환하지 않는다(260813 정책안 §3-C 불변식 1).
 */
export async function requireServiceLocation(): Promise<LocationGateResult> {
  let pos: GeoPosition;
  try {
    pos = await requestDeviceLocation();
  } catch (e) {
    return { ok: false, reason: classifyLocationError(e) };
  }
  // 정확도 게이트가 권역 판정보다 먼저다 — 부정확한 좌표로는 "권역 밖"인지조차 알 수 없다.
  if (pos.accuracy != null && pos.accuracy > GATE_ACCURACY_LIMIT_M) {
    return { ok: false, reason: 'inaccurate' };
  }
  if (!inServiceArea(pos.lat, pos.lng)) {
    return { ok: false, reason: 'outside_area' };
  }
  return { ok: true, coords: { lat: pos.lat, lng: pos.lng } };
}
