# 260909 지도 위치 회귀 수정 보고

## 결과

- guest/member 공통 탐색 기준을 단일화했다.
  - HCMC 37개 동 안의 실측 GPS: 실측 좌표 반경 + 로컬 줌 + 실제 me-dot
  - 권역 밖, 권한 거부, timeout, 위치 사용 불가: Bến Thành 반경 + 로컬 줌 + 사유별 toast + me-dot 없음
  - 사용자가 명시적으로 선택한 `pinnedAll`: 전체 지역/전역 뷰 유지
- 저장된 과거 광역 viewport가 warm 재진입의 현재 GPS/Bến Thành 로컬 줌을 덮지 못하게 했다. 업체 상세는 지도 위 overlay라 기존 viewport 보존 동작을 유지한다.
- dev 경기도 우회는 실행형/기록형 검증에는 계속 허용하지만 탐색 목록·카메라·me-dot 좌표로는 사용하지 않는다.
- 경로안내와 위치공유의 `requireServiceLocation()`/원시 GPS 경로는 수정하지 않았고 Bến Thành 폴백을 전달하지 않는다.
- ◎ 수동 재측위 실패도 권한/timeout/사용불가 문구를 구분해 Bến Thành로 이동한다.
- 권한 폴백 좌표가 생겼다는 이유만으로 전역 watcher를 시작해 시스템 권한창을 다시 띄우지 않는다.

## 변경 파일

- `frontend/src/lib/explorationLocation.ts`
- `frontend/src/lib/explorationLocation.test.mjs`
- `frontend/src/store/useLocationStore.ts`
- `frontend/src/store/useLocationStore.contract.test.mjs`
- `frontend/src/hooks/useServiceAvailability.ts`
- `frontend/src/hooks/serviceAvailabilityGate.contract.test.mjs`
- `frontend/src/pages/map/NeighborhoodMapCanvas.tsx`
- `frontend/src/pages/map/guestMapDeviceRegression.contract.test.mjs`
- `frontend/src/components/maps/SaigonMapV5.tsx`
- `frontend/src/components/maps/saigonMapV5RotationOutsideArea.contract.test.mjs`
- `frontend/src/locales/ko/translation.json`
- `frontend/src/locales/en/translation.json`
- `frontend/src/locales/vi/translation.json`
- `ai-docs/context/service-rules.md`
- `ai-docs/task/active/260909_map_fix_report.md`

## 검증

- PASS: `node --test` 7파일
  - 순수 정책 단위 테스트 `explorationLocation.test.mjs`: HCMC GPS, outside, permission, timeout, unavailable/off, pinnedAll, dev 경기도 우회/정확도
  - 기존 계약: location store, guest map, service availability, outside-area rotation, RideNav origin parity/error reason
- PASS: 변경 TS/TSX 5파일 scoped ESLint — error 0, 기존 warning 60
- PASS: scoped `git diff --check`
- 전체 TypeScript 검사는 동시 작업 중인 비소유 파일 `BizAdDetail.tsx`, `BizManage.tsx`의 `bizContractCta.mjs` declaration/implicit-any 3건 때문에 종료 코드 1. 지도 변경 관련 진단은 출력되지 않았다.
- `devDongtanPin.contract.test.mjs`의 기능 어서션 4개는 PASS했으나, 마지막 테스트가 sandbox의 `spawnSync git EPERM`으로 실패했다.
- repo 규칙에 따라 `npm run build`는 실행하지 않았다. 실기기/브라우저 시각 테스트는 미실행이다.
- 실제 Zustand store의 native mock 통합과 `SaigonMapV5`의 DOM/rAF 카메라 순서 통합 테스트는 환경에 준비된 DOM 하네스가 없어 미실행이다. 따라서 guest/member cold/warm 및 저장 광역 viewport 시나리오는 코드 경로 수정과 계약 테스트까지만 확인했으며 실제 카메라 통합 PASS로 주장하지 않는다.
- codebase-memory `search_graph`는 실행했고 `trace_path`는 approval 정책 때문에 거부됐다. 최종 재인덱싱은 감독 에이전트가 수행한다.
