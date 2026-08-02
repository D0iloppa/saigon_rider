# 출시 게이트 증적 체크리스트

> 작성: 2026-08-02 · 목적: **대표님이 무엇을 찍어 오시면 제가 게이트를 닫을 수 있는지**를 항목별로 확정한다.
>
> 배경: 코드로 닫을 수 있는 것은 전부 닫혔다([`260731_remediation_final_report.md`](./260731_remediation_final_report.md)). 남은 게이트는 **실기기·운영서버·법무·외부 콘솔** 에서만 생기는 증거를 요구한다. 감사 문서가 못 박은 원칙: *"실행 절차 문서만으로는 통과가 아니며 실제 복원 로그·경보 발화·롤백 결과가 필요하다."*
>
> 관련: [`260801_owner_action_items.md`](./260801_owner_action_items.md) (무엇을 해야 하는지) · 이 문서 (그걸 하고 나서 **무엇을 남겨야 하는지**)

## 사용법

1. 항목을 수행하고 **증적**을 캡처한다(명령 출력 텍스트 / 스크린샷 / 화면녹화)
2. 이 문서의 해당 항목 `증적:` 줄에 붙이거나, 파일로 저장하고 경로를 적는다
3. 저에게 "N번 채웠다"고만 알려주시면 제가 검증하고 게이트를 닫습니다
4. 전부 닫히면 제가 **재감사 판정 문서**를 씁니다

### 🔴 증적 캡처 시 보안 규칙
- **시크릿 값을 그대로 붙이지 마십시오.** API 키·secret·비밀번호·세션 토큰은 마스킹하거나 **길이만** 적어주십시오
- `.env` 파일 전체를 붙이지 마십시오 — 필요한 건 "키가 설정돼 있는가" 여부뿐입니다
- 명령 출력에 시크릿이 섞이면 그 줄만 지우고 주십시오

---

## 게이트 2 — Secret 대응

### 2-1. Zalo app secret 재발급
Zalo 콘솔에 셀프 재발급이 없어 **지원 요청**이 필요합니다([`260801_owner_action_items.md`](./260801_owner_action_items.md) A-2).

- [ ] Zalo 커뮤니티·지원 요청 접수 → **접수 스크린샷 또는 티켓 번호**
- [ ] 재발급 완료 후 dev DB 반영
  ```bash
  docker exec -it saigon_db psql -U wellconn -d saigon_rider
  ```
  ```sql
  UPDATE app_config SET value='<새 secret>', updated_at=now()
   WHERE group_name='oauth' AND key='zalo_app_secret';
  ```
- [ ] **증적(값 노출 없음)**:
  ```bash
  docker exec saigon_db psql -U wellconn -d saigon_rider -t \
    -c "select key, length(value), updated_at from app_config where group_name='oauth' and key like 'zalo%'"
  ```
  → `updated_at` 이 재발급 시각으로 갱신됐으면 합격
- [ ] **Zalo 로그인 실제 성공** — 앱/웹에서 1회. `-501` 미발생 확인. 스크린샷

**합격 기준**: 위 3개. 구 secret 이 무효화됐다는 것이 핵심입니다.

### 2-2. 레포 비공개 전환
- [ ] `gh repo edit D0iloppa/saigon_rider --visibility private --accept-visibility-change-consequences`
- [ ] **증적**: `gh repo view --json visibility,forkCount` 출력
- [ ] `main_deprecated` 삭제 시 — `git push origin --delete main_deprecated` 후 `git ls-remote --heads origin` 출력

---

## 게이트 4 — 개인정보·검증문서 계약

### 4-1. 법무 문안 승인
현재 `legal.privacyHtml`(ko/en/vi) 은 **"[법무 검토 전 초안]"** 표시가 붙어 있고, 근거 조문·보존기간이 비어 있습니다.

- [ ] 법무가 검토한 **최종 문안**(ko/en/vi) — 텍스트로 주시면 제가 반영합니다
- [ ] §4(보유·파기)와 **§5(권리)** 를 함께 검토했는지 확인 — §5 에 아직 *"계정 및 모든 관련 데이터 삭제"* 가 남아 있어 §4 와 어긋납니다
- [ ] 근거 조문·보존기간이 채워졌는지
- [ ] **증적**: 승인 회신(메일·문서) 또는 법무 담당자 확인 기록

**합격 기준**: "[법무 검토 전 초안]" 표시를 제거할 수 있는 상태.

---

## 게이트 5 — DB upgrade (운영 검증분)

dev 는 검증 완료(`schema_migrations` 139~168, fresh-init 165 SQL ERROR 0건). 남은 건 **운영 데이터 기준** 검증입니다.

- [ ] 운영 DB 의 현재 적용 상태
  ```bash
  # 운영 서버에서
  psql -U <user> -d <db> -c "\dt" | grep -i schema_migrations
  psql -U <user> -d <db> -c "select count(*), min(version), max(version) from schema_migrations"
  ```
  → **`schema_migrations` 테이블이 없으면** 그것 자체가 증적입니다(운영은 이 원장 도입 전 상태)
- [ ] **운영 백업 복제본에 migration 전건 적용** — 운영 DB 가 아니라 **복제본**에서
  ```bash
  # 백업 복원본을 별도 DB 로 올린 뒤
  docker compose --env-file .env --profile backend run --rm bff_migrate
  ```
  → **전체 출력**(에러 0건 확인용). `already exists, skipping` 은 정상입니다
- [ ] 적용 후 `select count(*), max(version) from schema_migrations`
- [ ] **2차 재실행**으로 멱등 확인 → `INSERT 0 0` 이면 합격

**합격 기준**: 복제본에서 ERROR 0건 + 재실행 멱등. **운영 DB 에 직접 실험하지 마십시오.**

---

## 게이트 6 — 정확한 배포

배포 후 **외부에서** 확인해야 합니다(서버 안에서 curl 하면 nginx 앞단 설정을 검증하지 못합니다).

- [ ] **배포한 commit / image digest 기록**
  ```bash
  # 운영 서버에서
  git -C <repo> rev-parse HEAD
  docker images --digests | grep saigon
  docker ps --format '{{.Names}}\t{{.Image}}\t{{.CreatedAt}}'
  ```
- [ ] **readiness 200** (외부에서)
  ```bash
  curl -s -o /dev/null -w '%{http_code}\n' https://app.saigon-rider.com/api/bff/ready
  curl -s -o /dev/null -w '%{http_code}\n' https://app.saigon-rider.com/api/sre/ready
  ```
  → 감사 시점엔 둘 다 **404** 였습니다
- [ ] **CORS 가 임의 Origin 을 반사하지 않음**
  ```bash
  curl -si -X OPTIONS https://app.saigon-rider.com/api/bff/health \
    -H 'Origin: https://evil.example' \
    -H 'Access-Control-Request-Method: GET' | grep -i 'access-control-allow'
  ```
  → `Allow-Origin: https://evil.example` 가 **나오면 실패**. 아무것도 안 나오거나 허용 Origin 만 나와야 합니다
- [ ] **보안 헤더 존재**
  ```bash
  curl -sI https://app.saigon-rider.com/ | grep -iE 'strict-transport|content-security|x-content-type|referrer-policy'
  ```
- [ ] **운영 endpoint 비공개**
  ```bash
  for p in api/bff/openapi.json api/bff/docs api/sre/openapi.json api/sre/metrics; do
    printf "%-28s " "$p"; curl -s -o /dev/null -w '%{http_code}\n' "https://app.saigon-rider.com/$p"
  done
  ```
  → 전부 **404/403** 이어야 합니다
- [ ] **`/api/sre/*` allowlist 동작**
  ```bash
  curl -s -o /dev/null -w '%{http_code}\n' https://app.saigon-rider.com/api/sre/gacha/pull      # 404 기대
  curl -s -o /dev/null -w '%{http_code}\n' -X POST https://app.saigon-rider.com/api/sre/sreMessage  # 401 기대(도달)
  ```

**증적**: 위 명령들의 **출력 전문**. 한 번에 돌려 붙여주시면 됩니다.

**⚠️ 배포 자체가 고위험 이벤트입니다** — 운영이 2026-06-04 스냅샷이라 migration 순서 누락 위험이 있습니다. 게이트 5(복제본 검증)를 **먼저** 끝내십시오.

---

## 게이트 7 — Native·외부 연동 (실기기)

**서명된 빌드**로, **실기기**에서 해야 합니다. 에뮬레이터는 GPS 백그라운드·푸시 동작이 달라 증적으로 부족합니다.

각 항목: **화면녹화(권장) 또는 스크린샷 + 로그**

### 7-1. 위치 권한
- [ ] 권한 **허용** → 지도·주변 조회 정상
- [ ] 권한 **거부** → 앱이 죽지 않고 홈이 정상 동작(ADR: GPS 를 첫 화면에 요구하지 않음)
- [ ] 거부 후 **재요청** 플로우
- [ ] **백그라운드 GPS + 장시간 이동** — 최소 10분 이상 실제 이동. 라이드 궤적이 끊기지 않는지

### 7-2. FCM
- [ ] **최초 토큰 등록** — 서버에 등록됐는지 확인
- [ ] **토큰 회전** 후 서버 재등록 (감사가 "재등록 흐름의 호출 증거 부족"으로 지적한 지점)
- [ ] **알림 탭 → 딥링크** 가 올바른 화면으로 이동

### 7-3. OAuth 3종 (Google / Apple / Zalo)
각각에 대해:
- [ ] **성공** → 앱 복귀 후 로그인 상태 유지
- [ ] **사용자 취소** → 앱이 깨지지 않고 로그인 화면으로 복귀
- [ ] **오류**(네트워크 차단 등) → 에러 안내 표시
- [ ] ⚠️ **Zalo 는 앱이 `Chưa kích hoạt`(미활성) 상태**입니다. 활성화 후 테스트해야 실사용자 기준 검증이 됩니다

### 7-4. 강제 업데이트 (⚠️ 현재 실기기에서 작동하지 않습니다)
`@capacitor/app` 이 native 서브모듈에 cap sync 되지 않아 `appVersion` 이 `'unknown'` 으로 남고, 안전망에 걸려 **강제 업데이트가 절대 발동하지 않습니다.**
- [ ] `npx cap sync` 등으로 플러그인 등록
- [ ] **강제 업데이트가 아닐 때 차단되지 않음** 확인 ← 이게 먼저입니다(잘못되면 전원 입장 불가)
- [ ] **강제 업데이트일 때 차단 화면 표시** 확인
- [ ] 앱스토어 URL 확정 시 "스토어로 이동" 버튼 추가(제가 처리)

### 7-5. 오프라인·외부 provider 장애
- [ ] 기내모드에서 앱 진입 → 오류/빈상태가 구분돼 보이는지
- [ ] 네트워크 복구 후 재시도 동작

---

## 게이트 9 — 운영 복구

**스크립트 존재는 증적이 아닙니다.** 실제 실행·복원·측정 결과가 필요합니다.

### 9-1. 백업 실행
- [ ] `tools/backup_db.sh` 를 **운영에서** 실행한 출력
- [ ] 생성된 덤프의 크기·타임스탬프 (`ls -lh`)
- [ ] **오프사이트 저장** — 서버 밖(S3·다른 리전 등)에 올라간 증적. **암호화 여부** 명시
- [ ] **스케줄 등록** — cron/systemd timer 설정 내용

### 9-2. restore drill (가장 중요)
- [ ] **백업본을 별도 인스턴스에 실제 복원**한 로그
- [ ] 복원 후 데이터 정합성 확인 — 예: 주요 테이블 건수 대조
  ```bash
  psql -c "select 'users', count(*) from users union all
           select 'listings', count(*) from marketplace_listings union all
           select 'biz', count(*) from business_profile"
  ```
- [ ] **RPO** — 마지막 백업 시점과 장애 시점의 최대 간격 (백업 주기로 결정)
- [ ] **RTO** — 복원 시작부터 서비스 가능까지 **실측 소요 시간**

### 9-3. 경보
- [ ] `OPS_ALERT_WEBHOOK_URL` 설정 (`.env`, 값 노출 금지 — 설정 여부만)
- [ ] **의도적으로 5xx 를 유발**해 웹훅이 실제로 울리는지 → 수신 스크린샷
- [ ] **신고 접수 알림** 실제 수신 확인
- [ ] 감사가 요구한 경보 항목: BFF 5xx·latency·readiness, worker heartbeat, DLQ/outbox lag, 디스크·백업·인증서 만료

### 9-4. 온콜
- [ ] **장애 시 담당자**와 연락 수단 명시
- [ ] 기능별 **중단·복구 기준**(무엇을 끄고 무엇을 살릴지)
- [ ] **롤백 책임자**와 **공개 출시 승인자** 지정 (감사 §8 재판정 완료 정의 요구사항)

---

## 게이트 1 — Engine 신뢰 경계 (운영분)

allowlist 로 특권 경로는 막았지만, `sreMessage` 는 여전히 전역 키 단일 비교입니다.

- [ ] `ENGINE_SERVICE_KEY` **회전** — 완료 여부(값 노출 금지)
- [ ] BFF·worker 전용 identity 를 모바일 패키지에서 분리
- [ ] **신규 앱 빌드 배포** (구 키가 박힌 앱이 남아 있으면 회전 효과가 없습니다)
- [ ] 회전 후 GPS ingest 정상 동작 확인

**⚠️ 근본 해소는 사용자·기기·만료에 묶인 단기 토큰 재설계입니다.** 그건 코드 작업이라 대표님이 지시하시면 제가 합니다.

---

## 게이트 외 — 출시 전 반드시 확인

- [ ] **운영 `.env` 의 `SMS_PROVIDER_API_KEY`** — 미설정이면 `RuntimeError` → 502 로 **가입·판매 전면 차단**됩니다. 값 유무만 알려주십시오
- [ ] **실제 업체 데이터 입력** — 지금 승인 업체 7건이 전부 dev 시드입니다. 동네지도를 출시 범위에 넣으시려면 어드민에서 실제 업체를 등록해야 합니다. **몇 건 목표인지**도 알려주시면 좋습니다
- [ ] **Zalo 앱 활성화** (`Chưa kích hoạt` → 활성)

---

## 제가 대신 할 수 없는 것 (대체 불가)

| 항목 | 왜 |
|---|---|
| 실기기 동작 | SDK·기기·서명키가 개발서버에 없습니다 |
| 운영서버 상태 | 접근 권한이 없습니다 |
| 외부 콘솔(Zalo·Google Cloud·앱스토어) | 계정 자격이 필요합니다 |
| 법무 판단 | 법률 문장을 지어내면 그게 더 큰 사고입니다 |
| restore drill 실측 | 운영 백업과 별도 인스턴스가 필요합니다 |

이 항목들은 **증적을 주셔야만** 게이트가 닫힙니다. 증적 없이 "했다"만으로는 감사 문서의 재판정 정의를 만족하지 못합니다.

---

## 진행 현황

| 게이트 | 상태 | 증적 접수 |
|---|---|---|
| 1 Engine 신뢰경계 | 부분(코드 완료) | 미접수 |
| 2 Secret | 부분(이력 제거 완료) | 미접수 |
| 3 안전정보 | **PASS** | — |
| 4 개인정보 계약 | 부분(구현 완료) | 미접수 |
| 5 DB upgrade | 부분(dev 완료) | 미접수 |
| 6 정확한 배포 | FAIL | 미접수 |
| 7 Native 연동 | FAIL | 미접수 |
| 8 자동 회귀 | **PASS** (CI·E2E 도입 완료) | — |
| 9 운영 복구 | FAIL | 미접수 |

**현재 판정: NO-GO.** 증적이 들어오는 대로 이 표를 갱신하고, 전부 닫히면 재감사 문서를 작성합니다.
