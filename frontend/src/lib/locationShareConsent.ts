/** 거래중 위치공유(실시간 GPS) 고지문 버전 상수 (P5).
 *
 * M-7(설계서 §10) 확정: 동의는 워키토키처럼 "최초 1회"가 아니라 **약속(appointment)마다** 서버가
 * `consented_at`/`consent_version`으로 관리한다(`marketplace_location_shares` 테이블, §5).
 * 따라서 이 파일은 localStorage 동의 플래그를 두지 않는다 — 프론트는 `GET .../location-share`
 * 응답의 `my_status`가 `"not_started"`일 때만 동의 모달을 띄우면 된다.
 *
 * 고지문이 바뀌면 이 값을 올려 재동의를 트리거하는 근거로 삼는다(재동의 로직 자체는 이번 범위 아님).
 */
// v2 (2026-08-29): 실시간 위치공유 **채널** 참가 동의 — 공유 대상=채널 참가자만·정밀좌표·자동종료
// (3시간/전원도착 15분/1명 이하)·언제든 나가기=즉시 삭제 (ai-docs/task/active/260829_live_location_channel_task.md §7-1).
export const LOCATION_SHARE_CONSENT_VERSION = '2026-08-29-v2';
