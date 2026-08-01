# Landing 핸드오프

`landing/`은 `saigon-rider.com`(소비자) + `business.saigon-rider.com`(비즈니스 파트너) 두 도메인을 **하나의 빌드**로 서빙하는 pnpm 워크스페이스(Vite + React + react-router)다. 컨테이너로 도는 실제 앱(app.saigon-rider.com)과는 완전히 별개 프로젝트.

## 구조

- `apps/client` — 실제 랜딩 코드. `apps/server`는 스캐폴드 템플릿 잔재(Better Auth/DB 등)로, 이 랜딩에서는 안 씀.
- 페이지 두 개, 같은 dist를 공유:
  - `apps/client/src/pages/home/` — 소비자 랜딩 (`Index.tsx` + `content.ts`)
  - `apps/client/src/pages/business/` — 비즈니스 랜딩 (`Index.tsx` + `content.ts`)
  - 어느 페이지를 그릴지는 **런타임에 `window.location.hostname`으로 분기** (`App.tsx`의 `isBusinessHost`). 호스트별 빌드가 따로 있는 게 아니다.
- i18n: `src/lib/locale.ts`가 공용 로케일 유틸(vi 기본, `/ko`, `/en`). 페이지별 텍스트는 각 페이지의 `content.ts`에 vi/ko/en 통째로 들어있음 — 텍스트 수정 시 `Index.tsx`가 아니라 `content.ts`를 고친다.
- 스타일: `pages/home/home-launch.css`가 공용 브랜드 토큰(다크 테마, 오렌지/마젠타, `.sr-*` 클래스)까지 포함한 베이스. 비즈니스 페이지는 이 CSS를 그대로 import하고 `pages/business/business-launch.css`로 페이지 전용 섹션만 추가.
- 스크린샷 자산: `apps/client/public/screens/*.png` (실제 앱 캡처, `.orca/drops/`에서 가져온 것). 배경 사진: `apps/client/public/images/*`.
- 루트의 `public/` 폴더(a01_settings_admin_nav.png 등)는 이 프로젝트가 원래 파생된 템플릿(스캐폴드)의 무관한 데모 자산 — 랜딩 콘텐츠와 상관없음, 건드릴 필요 없음.

## 빌드 & 배포

```bash
cd landing
pnpm run build                                          # apps/client/dist 생성 (홈+비즈니스 둘 다 포함)
sudo cp -r apps/client/dist/* /var/www/saigon-rider/     # 정적 배포, nginx reload 불필요
```

- `pnpm`은 corepack shim(`~/.local/bin/pnpm`)으로 설치돼 있어 PATH 추가 설정 불필요.
- `node_modules`가 빌드 머신의 pnpm 가상 store 경로(`/opt/pnpm-vstore/...`)를 참조해 깨져 있으면(`Cannot find module .../vite/bin/vite.js`) `pnpm install` 먼저.
- esbuild 빌드 스크립트는 `pnpm-workspace.yaml`의 `onlyBuiltDependencies`로 이미 승인됨 — 재승인(`pnpm approve-builds`) 불필요.
- `dist/`는 `.gitignore`에 있음 — 커밋 대상 아님, 매 배포 때 새로 빌드.

## nginx / 인증서 (저장소 밖, 호스트 설정)

- 라우팅 설정은 이 저장소가 아니라 **루트 repo**의 `deploy/saigon-rider.conf`에 있음 (`/etc/nginx/conf.d/saigon-rider.conf`로 설치).
- `saigon-rider.com` / `www` / `business.saigon-rider.com` → 전부 `/var/www/saigon-rider` 정적 서빙 (React가 도메인별 분기).
- `app.saigon-rider.com` → 컨테이너 앱(:18090)으로 프록시.
- 인증서는 `saigon-rider.com` 하나에 SAN으로 root/www/app/business 전부 포함 (`certbot certonly --nginx --cert-name saigon-rider.com --expand`).

## 알아두면 좋은 것

- CTA 링크: `SPLASH_HREF`(홈, → `app.saigon-rider.com/splash`), `BUSINESS_HREF`(→ `business.saigon-rider.com`), `CONTACT_MAIL`(비즈니스 페이지, → `mailto:partner@saigon-rider.com`, 아직 웹 가입 폼 없음).
- 소비자 랜딩 콘텐츠 원본은 `.orca/drops/사이공라이더_랜딩페이지_콘텐츠.md`(vi 정본 정책 포함) — 새 섹션/카피 추가 시 참고.
- vi/en 카피는 AI 번역 — 원어민 검토 전 단계임, 배포 전 확인 권장.
