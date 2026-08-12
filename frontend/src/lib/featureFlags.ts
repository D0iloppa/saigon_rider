/** 누적 주행거리(lifetime_km) UI 노출 — 데이터 신뢰도 확정 전까지 숨김(대표 결정 2026-08-07).
 *  위치핀 아이콘 옆 배치로 "현재 위치로부터의 거리"로 오인되는 문제 + 백엔드 오염 데이터
 *  (비정상 주행거리 누적) 결함으로 지급 데이터 신뢰도가 확정되지 않아 UI 노출만 중단한다.
 *  API 호출·계산 로직은 그대로 두고, 렌더링만 이 플래그로 감싼다.
 *  되살리려면 이 값만 true 로. 관련: ai-docs/task/active/260806_mileage_gate_fix_task.md */
export const SHOW_LIFETIME_DISTANCE = false;

/** 마켓 파일럿의 상용 핵심 화면에서 피벗 전 게임 재화·레벨을 숨긴다.
 * 데이터와 내부 기능은 보존하고, 거래 신뢰 지표가 자리 잡기 전까지 노출만 중단한다. */
export const SHOW_LEGACY_GAME_ECONOMY = false;
