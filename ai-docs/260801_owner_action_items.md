# 대표님 조치 목록 — 2026-08-01 아침

> **2026-08-02 갱신**: 운영 배포 완료, `main_deprecated` 삭제 완료, push 완료, A-3 진단 정정, C-4 사실 정정, C-8 #2 해소를 반영했다.

> 작성: 2026-07-31 새벽 (권도일 세션) · **이 문서에 있는 것만 대표님이 하시면 됩니다.**
> 나머지는 전부 처리했습니다 — [`260731_remediation_final_report.md`](./260731_remediation_final_report.md) 참조
> 원장(검증 상세 전문): [`260731_remediation_ledger.md`](./260731_remediation_ledger.md)
> **증적 체크리스트**: [`260802_launch_evidence_checklist.md`](./260802_launch_evidence_checklist.md) — 이 문서가 "무엇을 해야 하는지"라면, 그 문서는 **하고 나서 무엇을 남겨야 게이트가 닫히는지**다(명령어까지 포함)
>
> **분류 기준**: 개발자 권한으로 할 수 없는 것만 담았습니다 — 외부 콘솔 자격, 운영서버 접근, 법무 판단, 제품 결정, 실기기.

---

## ✅ A-1 / A-2 — 종결, 지금 할 일 아님 (2026-08-02 대표 결정)

- **레포 private 전환** — 대표 판단으로 **나중에** 한다. 지금 처리할 사안이 아니다
- **`main_deprecated` 백업 브랜치** — ✅ **2026-08-02 삭제 완료**(대표 지시, 로컬·원격 모두 삭제)
- **Zalo secret 재발급** — Zalo 가 셀프 재발급을 제공하지 않고(콘솔 2화면·공식 문서 확인), 실사용자 0명 + 콜백 URL 정리로 계정 탈취 경로가 없어 **차단 항목에서 제외**. 앱 재생성은 검증된 도메인·콜백을 잃어 비용이 위험보다 크다
- **점검 대상은 `main` 에 시크릿이 없는지 하나뿐** → 2026-08-02 실측: 추적파일 **2,151개 전수 검색 0건**. pre-commit `committed-secrets` 훅이 재유입 차단

> 경위: orphan `main` + 백업 브랜치 유지 + private 나중은 2026-08-01 에 대표와 함께 정한 방침인데, 증적 체크리스트 초판에서 감사 문서를 그대로 옮기며 다시 차단 항목으로 올렸다 — 일관성 오류를 정정했다.

---

## 🔴 A-3. Google Translate 403 복구 — **번역이 3주째 완전 정지**

**증상**: 모든 번역 호출이 `403 User Rate Limit Exceeded`. `translations` 테이블 **마지막 적재 2026-07-08**, 이후 신규 번역 **0건**. 매물 title 203건 중 79건만 번역돼 있습니다(61% 미번역). "번역이 잘 안 되는 것 같다"는 체감의 정체입니다.

**실측한 에러 payload** (감독이 실제 API 호출로 확인):
```json
{"error":{"code":403,"message":"User Rate Limit Exceeded",
  "errors":[{"domain":"usageLimits","reason":"userRateLimitExceeded"}]}}
```

**해석**: `domain: usageLimits` 는 **쿼터가 0에 가깝게 잠긴 상태**입니다. 순간 과다호출이 아닙니다(3주째, 재시도 3회 모두 동일). API 자체가 비활성이면 `accessNotConfigured` 가 떴을 텐데 그건 아니므로 **API 는 켜져 있고 한도만 막힌 상태**입니다.

**🔎 2026-08-02 진단 정정** — 대표가 결제 문제를 해결했는데도 **36분간 12회 재시도 전부 동일 실패**해 범위를 좁혔습니다. 실측 결과:
- `GET /language/translate/v2/languages?key=…` → **200 정상**(언어 목록 반환)
- `POST /language/translate/v2` → 여전히 `403 userRateLimitExceeded`

→ **키는 유효하고 Cloud Translation API 도 활성화돼 있습니다.** API 키 제한(`API_KEY_SERVICE_BLOCKED`)도 아닙니다. 아래 기존 확인순서 1·2·4번(billing 연결·API enabled·키 restriction)은 이번 실측으로 **배제됐습니다**. 남은 원인은 **프로젝트 할당량(quota) 하나**로 좁혀졌습니다.

**확인할 곳(좁혀진 것)**:
1. **IAM & Admin → Quotas → Cloud Translation API** → 한도값이 0인지 확인. (결제 활성화 직후 할당량 반영이 지연되는 경우가 있으니, 값이 정상인데도 실패하면 **24시간 경과 후 재확인**)

**비용**: 복구 시 추정 ~$40/월. 다만 **현재 구조는 검색할 때마다 번역 API 를 때리므로, 아래 검색 개편이 적용되면 오히려 지금보다 저렴해집니다**(검색당 과금 → 등록당 과금). 기존 데이터 소급 번역 백필은 ~24K자 ≈ **$0.5** 입니다.

**대안**: `app_config` 의 `provider` 값으로 번역 제공자를 바꿀 수 있습니다. Google 복구가 번거로우면 다른 provider 교체도 선택지입니다.

**지금 상태**: 이게 막혀 있어도 **검색 개선 작업은 진행 중**입니다 — 원문 기준 검색·인덱스는 API 없이도 동작하게 만들고 있습니다. 다만 **"자전거"로 베트남어 매물을 찾는 교차언어 검색은 이 403 이 풀려야 완성**됩니다.

---

## 🟠 B. 아침에 확인만 (5분)

### B-1. 운영 `.env` 의 `SMS_PROVIDER_API_KEY` 값 유무 — ✅ 2026-08-02 확인 완료

**값 있음.** 값을 출력하지 않고 유무만 확인했습니다(`awk` 로 길이 판정). **종결.**

### B-5. 운영 `.env` 누락 키 4건 채우기 (2026-08-02 신설) — **대표님 손이 필요**
<!-- B-4 는 D 절의 "운영 배포" 항목 번호로 이미 쓰이고 있어 B-5 로 부여했다 -->


운영 배포 중 운영 `.env` 와 `.env.example` 의 **키 이름만** 대조한 결과, 운영에 9개 키가 없었습니다. 코드로 영향도를 확인한 결과는 아래와 같습니다.

| 키 | 운영 영향 | 근거 |
|---|---|---|
| `ZALO_API_PROXY` | 🔴 **Zalo 로그인 실패** — 프록시 없이 한국 IP 에서 직접 호출 → Zalo 가 `error -501` 로 차단 | `backend/app/services/oauth.py:214` |
| `GOOGLE_MAPS_API_KEY` | 🟠 지도 연계 기능이 "준비 중" 폴백 | `backend/app/routers/info_route.py:37` |
| `CORS_ALLOWED_ORIGINS` | 🟡 미설정 시 localhost 기본값 폴백 → `app.saigon-rider.com` 이 허용 목록에 없음. **와일드카드는 아니라 보안 구멍은 아님** | `backend/app/services/cors.py:14` |
| `OPS_ALERT_WEBHOOK_URL` | 🟡 운영 알림 무음(설계상 로그만) | `backend/app/services/ops_alerts.py` |
| `TRANSLATE_API_KEY` · `TRANSLATE_PROVIDER` | ⚪ 무해 — 시크릿 SoT 가 DB `app_config` 라 `.env` 불필요 | ADR `시크릿 위치` |
| `OTP_DEV_BYPASS` | ⚪ 없는 게 안전(운영 게이트) | — |
| `BIZ_LANDING_PORT` · `DEV_HOST` | ⚪ 경미 | — |

**2026-08-02 진행 상태**: 누락 키 9개를 운영 `.env` 에 **전부 만들어 뒀습니다**(백업 `.env.bak_260802`). 키셋은 이제 `.env.example` 과 양방향 완전 일치합니다. 비밀이 아닌 `CORS_ALLOWED_ORIGINS`·`BIZ_LANDING_PORT` 는 제가 채웠고, 나머지는 빈 값입니다 — **빈 값 = 기존 동작과 동일**이라 지금 상태로 깨지는 곳은 없습니다.

**대표님이 값을 채우실 곳은 2개뿐입니다** (`ZALO_API_PROXY` 는 Zalo 로그인 복구에 필수):

```bash
# dev 값 확인 (개발 머신에서)
grep -E '^(GOOGLE_MAPS_API_KEY|ZALO_API_PROXY)=' /mnt/c/DEV/saigon_rider/.env

# 운영에 반영
ssh saigon-prod
cd /app/SaigonRider
vi .env          # GOOGLE_MAPS_API_KEY= 와 ZALO_API_PROXY= 뒤에 값 입력
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env --profile backend up -d bff
```

재기동하면 제가 채워둔 `CORS_ALLOWED_ORIGINS` 도 함께 적용됩니다(그전까지는 localhost 기본값 폴백).

> 보안 규약(CLAUDE.md)상 `.env` 와 `.env.example` 은 항상 같은 키셋이어야 하는데, 그 규약이 **운영 `.env` 에는 적용된 적이 없었습니다.** 이번이 첫 대조입니다.

### B-2. `app.saigon-rider.com` 공개 도메인을 닫을지

지금 **공개 응답 중**입니다(감사가 그 도메인에서 readiness 404·임의 Origin 반사 CORS·OpenAPI/metrics 노출을 관측). 실사용자는 없지만, 방치된 구버전 빌드가 인터넷에 떠 있는 상태입니다. verdict §1.1 은 그 DB 를 **dev 덤프 복원본**으로 추정합니다.

선택지: ① 출시 전까지 내려두기 ② 인증 게이트(BasicAuth 등) ③ 그대로 두기
→ **①/② 를 권합니다.** 지금 배포하는 것보다 싸고 안전합니다.

### B-3. push 여부 — ✅ 2026-08-02 완료

`origin/main` 에 `76f4931` push 완료. **종결.**

---

## 🟡 C. 판단이 필요한 것 (개발이 정할 수 없음)

### C-1. 약관·개인정보 문안 (법무) — **게이트 4 를 막고 있음**

30일 파기 배치를 만들었지만 `users` 행·거래·리뷰·DM·신고·CS 는 **보존**합니다(타인 권리·법정 보존 의무). 그런데 공표 문구가 **"30일 내 영구삭제"** 라서 **실제보다 과합니다** → 소비자 기만 소지.
→ 문구를 실제 보존 범위에 맞게 조정할지 결정 필요. **코드로는 닫히지 않습니다.**

### C-1-b. 개인정보처리방침 §5 "권리" 절도 함께 봐야 합니다 (2026-08-02 추가)

§4(보유·파기)를 실제 동작에 맞게 개정하면서 "삭제"의 의미가 달라졌는데, **§5 "권리" 절에 여전히 "계정 및 모든 관련 데이터 삭제" 문구가 남아 있습니다.** 이번 범위(§4) 밖이라 손대지 않았습니다 — 법무 검토 시 §4·§5 를 함께 보셔야 합니다.

개정된 §4 의 "법령·계약상 보존이 필요한 정보" 표현에 **근거 조문·보존기간이 비어 있습니다**(제가 판단할 수 없어 일반론으로만 쓰고 "[법무 검토 전 초안]" 표시를 남겼습니다). 전자상거래법·개인정보보호법 등 근거를 법무가 채워야 합니다.

### C-2. 탈퇴 시 삭제 보류 4종 — ✅ 2026-08-02 결정·구현 완료

대표 결정: **피드글·댓글만 삭제**, 제재이력·CS 문의·보상 지급 원장은 **보존**.
부수효과로 발견된 "신고 기록 CASCADE 삭제"도 대표 결정에 따라 **detach 보존**(FK `ON DELETE SET NULL`) 처리했습니다. 덤으로 관리자 모더레이션 삭제·작성자 자진 삭제에서도 신고가 보존됩니다 — **이전에는 그 두 경로에서도 신고가 조용히 사라지고 있었습니다.**

<details><summary>원래 보류 항목 (기록용)</summary>



파기 배치에서 판단이 갈려 **의도적으로 손대지 않은** 항목입니다. 지울지 남길지:

| 테이블 | 보류 이유 |
|---|---|
| `feed_posts` / `post_comments` | 본인 콘텐츠지만 타인 댓글·좋아요가 얽혀 있어 삭제 시 타인 참여 흔적도 사라짐 |
| `user_sanctions` | 제재 이력 — 상습 위반자 추적용 운영 감사기록일 수 있음 |
| `support_tickets` | CS 이력 — 컴플라이언스 보존 필요 여부 불명 |
| `internal_reward_grants` | 내부 보상 지급 원장 — 회계 대사 대상일 수 있음 |

</details>

### C-3. 침수 예측 잔여 (F-11) — ✅ 2026-08-02 결정·구현 완료

대표 결정: **마지막 성공시각 영속화**. `flood_prediction_status` 신설로 '정상적 저위험'과 '확인 불가'를 구분해 렌더합니다.

<details><summary>원래 항목 (기록용)</summary>


**한 번도 성공한 적 없는** 구역은 "정상적 저위험"과 "확인 불가"가 구별되지 않습니다(보존할 이전 snapshot 이 없어서).
선택지: ① 마지막 성공 실행 시각을 영속화(schema 변경) ② 감사 문서의 대안대로 **예측 위험도 노출 비활성화**

</details>

### C-4. 앱스토어 업데이트 URL — 2026-08-02 사실 정정 + 대표 결정

**정정**: 기존 서술("스토어로 이동 버튼을 못 넣었다")은 부정확했습니다. 실제 `frontend/src/App.tsx:384-394` 의 강제 업데이트 화면에는 **버튼 자체가 없고 안내 문구만** 있습니다. 즉 URL 이 없어서 무언가 깨지는 곳은 없습니다.
**대표 결정**: 아직 스토어 등록 전이라 **보류**. 등록 후 버튼 추가는 후속.

### C-5. 제품·경영 결정 6건 (B-9)

서비스 경계 14.4×14.5km 유지 vs HCMC 전역 / 행정구역 삼중체계 통일 기준 / 업체 시딩 방식(어드민 생성 vs 영업 유치) / RP sink 개설 vs 재화·라이딩 감추기 / 광고 노출 시점·결제(PG vs 수동 정산) / 약관 문안(C-1)

### C-6. ADR 의 "대표 결정" 항목 확정 (읽고 확인만)

밤 동안 **ADR 초판을 작성**했습니다 → [`ai-docs/context/adr.md`](./context/adr.md) (파일이 SoT — MCP 저장은 자동 재색인에 날아가는 것을 실측 확인해 파일로 옮겼습니다). N-5 사고의 근본 원인이 **대표님 결정이 서술형 문서 본문에만 묻혀 있고 ADR 이 비어 있던 것**이라, 다음 세션이 같은 실수를 반복하지 않게 결정 사항을 한곳에 모았습니다.

`### 대표 결정 — 건드리면 회귀` 섹션에 5건을 적었습니다 — **제가 기록으로부터 추출한 것이니 사실이 맞는지만 봐주십시오**:
1. 동네지도 리스트 지역선택은 **화면 로컬 유지**(2026-07-27, 정보화면 침습 방지)
2. 지도 탭 **지역선택 비활성**(2026-07-25, GPS 근처로 대체 — `handleRegionSelect` 는 죽은 코드)
3. **광고 노출 OFF 유지**(`ADS_ENABLED=false`)
4. **게이미피케이션 진입점 차단 유지**(가챠·상점·인벤토리·시즌·쿠폰·차고)
5. **OTP dev 우회 운영 3중 게이트**

조회: `ai-docs/context/adr.md` 의 `### 대표 결정 — 건드리면 회귀` 절. 틀린 게 있으면 알려주시면 정정합니다.

### C-7. 알고만 계셔야 하는 것 (조치 불필요)

- **기존 계정 전원이 다음 로그인 시 동의 화면을 1회 거칩니다.** 소급 기록은 하지 않았습니다(증빙 없는 동의 위조 방지). 배포 후 CS 문의 증가 가능
- **N-5** — 감사가 결함으로 적은 게 대표님이 2026-07-27 에 내리신 "현행 유지" 결정이었습니다. 제가 뒤집었다가 되돌렸고 현재 결정 상태입니다
- **F-19 강제업데이트**는 `@capacitor/app` 이 native 서브모듈에 cap sync 되지 않아 **실기기에서 발동하지 않습니다**(웹 로직·안전망은 완성)

---

### C-8. 어드민 업체 등록 관련 후속 3건 (2026-08-02 신설)

업체 직접 등록 기능을 만들었습니다(S-2 해소). 판단이 필요한 게 둘 남았습니다(2번은 2026-08-02 해소):
1. **소유자 연결 수단** — 나중에 실제 사업자가 앱 계정을 만들었을 때 이 프로필을 어떻게 연결할지(신청·승인 플로우 vs 관리자 수동 배정). 지금은 `user_id`가 NULL인 채로 둡니다
2. **관리자 폼의 사진 업로드** — ✅ 2026-08-02 해소. `POST /admin/api/biz/upload`(owner_type=system, `_sniff_mime` 매직넘버 검증 재사용)와 `admin-frontend` `apiUpload()` 로 구현 완료. "사진 없이 생성됩니다" 서술은 정정합니다. 실제 업체 대량 입력은 `backend/scripts/import_business_csv.py`(기본 dry-run, `--commit` 필수)
3. **관리자 생성 업체도 사업자등록증 검증을 강제할지** — 현재 `verification_status=pending` 별도 축으로 두고 강제하지 않습니다

⚠️ **기능은 만들었지만 실제 업체 데이터는 아직 없습니다.** 지금 승인 업체 7건이 전부 dev 시드라, 동네지도를 출시 범위에 넣으려면 **영업으로 확보한 업체를 실제로 입력**해야 합니다.

## ⚫ D. 출시 전 체크리스트 (지금 급하지 않음 — 운영 미공개 확인됨)

대표님 지적대로 운영서버가 아직 실서비스가 아니므로 **긴급도를 내렸습니다.**

- **운영 배포**(B-4) — ✅ **2026-08-02 배포 완료.** `ssh saigon-prod`(218.234.18.148, `/app/SaigonRider`)에서 구 이력 `main@1012afd`(orphan 재작성 전, 새 `origin/main` 과 공통 조상 없음)를 백업(`/home/wellconn/saigon_prod_backup_260802/`: git bundle 445MB·미커밋 패치·미추적 자산 tgz 4.2MB·DB 덤프 326KB) 후 `git reset --hard origin/main`, 운영에만 있던 미커밋 랜딩 개편 3파일(히어로 영상·파비콘·스토어 배지 제거)은 운영 버전으로 복원해 보존. 대표 승인 하에 운영 DB 를 DROP/CREATE 재생성(재생성 전 업체·POI·신고·광고통계 등 263컬럼이 통째로 없었고 실데이터 42행뿐 — 사용자·매물 0) → `database/init/*.sql` 전건 적용 ERROR 0건 → `bff_migrate` 재실행 → **866→1258컬럼으로 dev 라이브와 파리티 확인**(초과 392컬럼은 dev 와 동일하게 Engine/Alembic 소유), `schema_migrations` 31건 백필. 재빌드 후 컨테이너 9종 healthy, `GET /api/bff/ready` **200** `{"status":"ready",...}`, bff 로그 ERROR **0건**, 공개 경로 200·인증 경로 419(정상)·`/admin/` 200 확인.
  ⚠️ **남은 것**: 운영은 loopback 바인딩이라 **외부(app.saigon-rider.com)에서의 재검증**(strict CORS·보안헤더·OpenAPI/metrics 비공개)은 아직 하지 않았습니다. B-2(공개 도메인 처리) 결정과 묶여 있습니다.
- **실기기 E2E**(B-1) — 서명 빌드로 GPS 권한·백그라운드 이동·FCM 등록/회전/딥링크·OAuth 3종 복귀·오프라인. 여기서 F-19 cap sync 도 함께
- **백업·복구**(B-5) — `tools/backup_db.sh` 는 작성·dev 실행 확인 완료. 남은 것은 스케줄링·오프사이트 암호화 저장·restore drill·RPO/RTO 측정·경보·온콜
- **Engine 키 회전 + identity 분리**(B-3) — allowlist 로 특권 경로는 막았지만 `sreMessage` 는 여전히 전역 키 단일 비교라, 앱에서 키가 추출되면 GPS/이벤트 주입이 가능합니다. 회전 + 사용자·기기·만료 결속 단기 토큰으로 재설계 후 신규 앱 배포
- **운영 DB migration 상태 확인**(B-8) — ✅ 2026-08-02 배포 시 해소. 운영 DB 재생성 후 `database/init` 전건 적용 + `bff_migrate` 로 dev 라이브와 컬럼 파리티 확인(위 운영 배포 항목 참조)
- **Zalo 운영 로그인** — ✅ **2026-08-02 동작 확인(대표 실기)**. 세 가지가 함께 맞아야 했다: ① `app_config` 에 Zalo 시크릿 주입(재생성 전 운영 DB 에도 `CHANGE_ME` 였다 — 즉 운영 Zalo 로그인은 원래부터 불가) ② `.env` `ZALO_API_PROXY` 값 입력(없으면 한국 IP 직접 호출 → `error -501`) ③ **`BFF_PUBLIC_URL` 정정** — 운영이 옛 도메인 `letantonsheriff.com` 을 콜백으로 보내 Zalo 가 `-14003 Invalid redirect uri` 로 거부했다. `https://app.saigon-rider.com/api/bff` 로 교체 후 콘솔에 콜백 등록.
- **OAuth 콜백 도메인 SoT** — `BFF_PUBLIC_URL` 하나가 **Zalo·Google·Apple 콜백 전부**를 만든다(`auth.py:546 _bff_base_url()`). 이 값을 바꾸면 세 콘솔을 함께 갱신해야 한다. 운영 콜백 주소:
  `https://app.saigon-rider.com/api/bff/auth/oauth/{zalo|google|apple}/callback`
- **Google 운영 로그인** — 🔴 **미동작**. 콘솔 확인 결과 운영 도메인이 리디렉션 URI 에 **없었다**(등록된 것은 dev `saigon.doil.me` 와 오타가 있는 `www.saigon-rider.com/api/bff/auth/google/callback` — `oauth/` 누락, 게다가 `www` 는 랜딩 정적 서빙이라 API 가 없다). 즉 **운영 Google 로그인은 원래부터 안 되고 있었다**(2026-08-02 도메인 변경 때문이 아니다).
  → 추가할 것: 리디렉션 URI `https://app.saigon-rider.com/api/bff/auth/oauth/google/callback`, JavaScript 원본 `https://app.saigon-rider.com`. 반영에 5분~수 시간.
  ⚠️ 콘솔에 클라이언트 시크릿이 2개인데 `****awhl` 은 **사용 중지**, `****BFn` 만 활성이다. 운영 DB 값은 DB 재생성 전 덤프에서 복원한 것이라 **둘 중 어느 것인지 확인 불가** — URI 등록 후에도 실패하면 활성 시크릿을 알려주면 주입한다.
- **Apple 운영 로그인** — 시크릿이 아직 `CHANGE_ME` 라 미구성. 구성 시 Services ID 의 Return URL 에 위 apple 콜백 주소 등록 필요.

---

## 요약 — 대표님이 하실 것 (2026-08-02 갱신 — 남은 것만)

1. **A-3** Google Cloud 콘솔 **IAM & Admin → Quotas → Cloud Translation API** 에서 한도값이 0인지 확인 — 키·API 활성화는 이미 확인됐고 원인은 quota 하나로 좁혀짐. 정상인데도 실패하면 24시간 후 재확인
2. **Google 콘솔** — 리디렉션 URI `https://app.saigon-rider.com/api/bff/auth/oauth/google/callback` 와 JavaScript 원본 `https://app.saigon-rider.com` 추가. **지금 운영 Google 로그인은 동작하지 않습니다**(원래부터). Zalo 는 2026-08-02 동작 확인 완료
3. ~~공개 도메인 닫을지 결정~~ — ✅ **출시 전까지 열어두기로 결정(2026-08-02)**. 외부 재검증도 완료해 게이트 6 잔여 종결
4. **C-1 / C-1-b** 법무 문안 승인 — §4 뿐 아니라 **§5 "권리" 절도 함께**
5. **C-8** 어드민 업체 등록 후속 2건(소유자 연결 수단·검증 강제 여부). ~~실제 업체 데이터 입력~~ — **런칭 후 확보(2026-08-02 대표 결정)**, 수단(어드민 등록·CSV 임포트)은 준비 완료
6. **S3 버킷·자격증명** — `.env` 6개 키만 채우면 코드 변경 없이 오프사이트 백업이 동작합니다. `BACKUP_ENCRYPTION_KEY` 는 `.env` 와 **별도 보관**(분실 시 영구 복구 불가)
7. **`support@saigon-rider.com` 메일함 존재 여부** — 방침·약관에 공표된 개인정보 문의처입니다. 없으면 반송됩니다
8. **증적 수집** → [`260802_launch_evidence_checklist.md`](./260802_launch_evidence_checklist.md)

**출시 판정은 NO-GO** 입니다. 코드·인프라로 닫을 수 있는 것은 전부 닫혔습니다. 남은 차단은 **실기기 검증(B-1)·Engine 키 회전(B-3)·법무 문안(B-6)** 세 가지이며, 앞의 둘은 **스토어 등록과 앱 배포 경로가 선행**돼야 합니다.
