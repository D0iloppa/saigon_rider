# 지도·광고 계약/결제 회귀 수정 — 릴리스 증적 (2026-09-09)

## 범위와 승인

- 대표의 반복 명시 승인에 따라 commit, `origin/main` push, DEV 앱/BFF/알림 워커 재배포를 수행했다.
- 운영 DB, 실결제, `business.saigon-rider.com` 프로덕션 랜딩 배포는 수행하지 않았다.
- 구현 단계 문서의 "commit·push·배포 금지"는 당시 worker 안전 경계이며 이번 명시 승인으로 DEV 릴리스에 한해 대체됐다.

## 커밋과 원격

- `1cad76ba` `fix(payments): harden ad contract checkout flow`
- `7038baa5` `fix(frontend): stabilize maps and partner contract actions`
- `45da6b24` `fix(landing): align ad contract checkout`
- `82b9e87d` `docs(release): record map and payment regression fixes`
- push 전 `origin/main...main`은 behind 0 / ahead 4였고, force 없이 `cf76bcd9..82b9e87d` fast-forward push했다.
- 최종 확인 시 로컬 `HEAD`와 `origin/main`은 모두 `82b9e87d4d9871abc24bc608ebbd3bb164496706`이었다.

## 검증과 빌드

- 백엔드 결제/관리자 집중 테스트: 41 PASS. 테스트 import에만 합성 `ADMIN_JWT_SECRET`을 사용했고 DB 연결·실결제는 없었다.
- 프론트엔드: TypeScript, 집중 계약 테스트, CSS parse, ESLint PASS. 미검증 fixture `bizManageUi.e2e.mjs`는 커밋에서 제외했다.
- Docker: `frontend`, `bff`, `noti_worker` 빌드 PASS. 프론트는 `tsc -b && vite build`, 2,296 modules transform 완료.
- 랜딩: Node `v22.23.2`로 canonical `pnpm run build` PASS, 2,003 modules 및 prerender 완료.
- codebase-memory fast reindex: nodes 35,719 / edges 100,462. 기존 ADR은 `no_adr` 상태 유지.

## DEV 배포 증적

- `docker compose --env-file .env --profile backend up --no-deps --force-recreate -d frontend bff noti_worker`
- 실행 이미지:
  - frontend `sha256:8026f20add168085c3f865f9d7f1a736cdc6a15629d875af36c360b0053eb3fe`
  - bff `sha256:06c35a2912f1e6382b25220e029cea668c1bfe8226f9d6218b1bc5ff7d0b9fdd`
  - noti_worker `sha256:b6b891c07b543d5fe62aff0d4b678d766026484d615ae78736d01fe82a8dd376`
- 상태: frontend running, bff healthy, noti_worker healthy.
- BFF 이미지 내부 핵심 소스 SHA-256은 호스트 커밋 소스와 일치:
  - `ad_contract.py` `60c7332efbef720abe754fa15d18ede448cee245b6f56ee72c3ea85e69f79a14`
  - `toss_card.py` `0f2e19b755a5b23697847d1cee67c577f62c013cdfdb4f3129e2c97bade7804e`

## 스모크와 자산 일치

- `http://127.0.0.1:18090/` 200
- `http://127.0.0.1:5174/` 200
- `http://127.0.0.1:8082/api/ready` 200
- `http://127.0.0.1:18090/api/bff/ready` 200
- 공개 `https://saigon.doil.me/assets/index-CZmB4yI4.js`와 로컬 DEV 자산의 크기는 모두 715,353 bytes, SHA-256은 모두 `5aac85aa189272c1049bd544449e1fbd7d17026d02ef0490fa78c109ca1d57d5`.
- nginx `-t` PASS 후 reload 완료. `Host: business.localhost` + :18092에서 `/apply`, `/apply/pay/return`, `/apply/pay/fail` 모두 200이며 새 `index-Cyxb7yIq.js` 자산을 참조한다.

## 남은 경계

- 앱의 `BIZ_PORTAL_BASE_URL`은 `https://business.saigon-rider.com` 프로덕션을 가리킨다. 임의 변경하거나 프로덕션 `/var/www`에 배포하지 않았다.
- 따라서 이번 랜딩 결과는 로컬 :18092 검증 하네스까지만 반영됐다. DEV 앱에서 계약 링크를 end-to-end 검증하려면 별도 DEV 랜딩 URL 결정·배선이 필요하다.
- 네이티브 실기기와 제외한 `bizManageUi.e2e.mjs`는 이번 릴리스에서 검증하지 않았다.
