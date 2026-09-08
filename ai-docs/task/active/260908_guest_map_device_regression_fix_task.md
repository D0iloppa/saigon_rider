# 비회원 지도 실기기 회귀 수정

## 목적

비회원이 지도에서 위치를 얻지 못할 때 서비스 권역 밖으로 시작하는 문제와 개인 기능 진입 시 splash로 이탈하는 문제를 수정한다. 로그아웃 뒤 로그인 화면에 워키토키 버블이 남는 문제도 함께 막는다.

## 범위

- 좌표가 없을 때 지도 초기 중심을 Bến Thành 폴백으로 고정한다.
- 비회원의 지도 검색·찜·프로필·글쓰기 진입은 OAuth 로그인으로 보낸다.
- 공개 `/map`은 세션 만료 뒤에도 게스트 열람을 유지한다.
- 워키토키 버블 표시는 인증 상태를 필수 조건으로 한다.

## 검증

- `guestSurface.contract.test.mjs`, `marketFirstValue.contract.test.mjs`, `publicBrowsing.contract.test.mjs`, `guestMapDeviceRegression.contract.test.mjs` 통과.
- 대상 ESLint 및 `tsc -b` 통과.
- iOS 실기기: 위치 거부/OFF 시 Bến Thành 시작, CTA 로그인 후 지도 복귀, 로그아웃·재실행 뒤 버블 미노출, 위치 허용 뒤 실제 위치 재중심화를 확인한다.

## 제약

- 위치 불가 폴백은 로그인 사용자의 Bến Thành 폴백과 동일해야 한다.
- 개인 기능은 splash가 아니라 로그인 흐름으로 보낸다.
