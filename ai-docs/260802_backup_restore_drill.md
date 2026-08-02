# 게이트9(운영 복구) / 블로커 B-5 — 백업·복원 리허설 결과 (2026-08-02)

## 0. 배경

`tools/backup_db.sh` 는 이미 dev 에서 pg_dump 산출까지 확인돼 있었다. 닫히지 않았던 항목:
실행 스케줄 · 오프사이트 암호화 저장 · **restore drill(복원 실제 수행)** · RPO/RTO 측정 · 경보.

이 문서는 restore drill·RPO/RTO 측정·스케줄 구현·복원 스크립트를 dev 에서 실제로 수행한
결과다. 오프사이트 저장은 위치 결정이 대표 몫이라 **선택지 정리까지만** 하고 실제 자격증명/
버킷은 만들지 않았다.

## 1. Restore Drill 실측 결과

**절차**: `tools/backup_db.sh` 로 덤프 생성 → 격리된 임시 컨테이너(`saigon_db_restore_drill`,
`postgis/postgis:15-3.3`, 신규 볼륨)에 복원 → `saigon_db` 와 스키마·행수 양방향 대조 →
임시 컨테이너 제거. **`saigon_db` 컨테이너·볼륨은 전혀 건드리지 않았다** (덤프는 `docker exec`
로 stdout만 읽었고, 쓰기는 임시 컨테이너에만 했다).

| 단계 | 소요시간 | 결과 |
|---|---|---|
| 덤프 (`tools/backup_db.sh`) | 0.99s (wall) | `backup_20260802_180512.sql.gz`, 780K |
| 임시 컨테이너 기동 + healthy 대기 | ~수초 (`pg_isready` 폴링) | OK |
| 복원 (`gunzip \| docker exec psql`) | 4.07s (wall) | exit=0, **stderr ERROR 0건** |
| 스키마 대조 (`information_schema.columns`, 양쪽 조회 + diff) | 0.22s + 0.25s + diff | **컬럼 1266개, diff 0** |
| 행수 대조 (전체 139개 public 테이블, `SELECT count(*)` UNION) | 0.33s + 0.26s + diff | **테이블 139개, diff 0** |
| 임시 컨테이너 제거 | 즉시 | 완료, `docker ps -a` 로 잔존 없음 확인 |

**검증 기준 준수**: "ERROR 0건"으로 끝내지 않고 `information_schema.columns` 을 원본↔복원본
양방향으로 뽑아 diff 했다 — 과거 `users.deleted_at` 드리프트 사고 재발 방지 기준. 컬럼명·
타입·길이·nullable·default 까지 포함한 1266행이 완전히 일치했고, 139개 테이블 전체의 행수도
완전히 일치했다.

**주의 (dev 규모 한계)**: 현재 dev DB는 덤프 780K 규모다. 이 수치는 **dev 데이터 볼륨 기준**이며,
운영 규모(더 큰 행수·인덱스·큰 오브젝트)에서는 pg_dump/restore 소요시간이 선형 이상으로 늘어날
수 있다 — 아래 RTO 는 이 한계를 명시하고 보수적으로 잡았다.

## 2. RPO / RTO

### RPO (Recoverable Point Objective, 최대 데이터 손실)

- 백업 주기: **일 1회** (아래 §4 스케줄, 02:30 ICT — 트래픽 낮은 새벽, `purge_deleted_accounts`
  03:10 보다 앞).
- **RPO = 최대 24시간** (직전 백업~장애 시점 사이 데이터는 손실). 하루 중 쓰기가 활발한
  시간대(라이딩·마켓 거래)를 고려하면 실질 손실 데이터량은 더 적을 수 있으나, 시간 기준
  RPO 는 백업 간격 그대로 24h 로 제시한다.
- 더 짧은 RPO 가 필요하면 백업 주기를 늘리는 것(예: 6시간마다)이 가장 단순한 개선이다 —
  WAL 아카이빙(PITR) 등은 이 저장소 규모에서 과설계로 판단해 제안하지 않는다.

### RTO (Recovery Time Objective, 복구 소요)

실측값 기반 산정:

| 구성요소 | 실측(dev) | 비고 |
|---|---|---|
| 복원(psql import) | 4.07s | dev 780K 덤프 기준 |
| 검증(schema diff + 행수 대조) | ~1.5s | 스크립트화하면 수초 내 |
| **측정 불가 요소** | — | 운영 디스크 I/O 성능·네트워크 전송(오프사이트에서 내려받는 경우)은 이 dev 환경에서 측정할 수 없다 — 오프사이트 저장소 선정(§5) 후 별도 실측 필요 |

- **dev 규모 RTO ≈ 10초 내** (다운로드 불요, 로컬 컨테이너 대 로컬 컨테이너).
- **운영 규모 RTO 는 이 수치로 외삽하지 않는다** — 데이터량·디스크 성능·(오프사이트일 경우)
  전송 시간이 dev 와 다르다. 운영 첫 실 복구 훈련 시 별도 실측이 필요하다는 것을 대표 결정
  항목(§6)에 포함한다.
- 절차상 RTO는 "덤프 다운로드(오프사이트인 경우, 미측정) + 임시/신규 컨테이너 기동 + psql
  복원 + 애플리케이션 재연결" 합이며, dev 기준 기동~복원까지는 10초 내로 확인됐다.

## 3. 복원 스크립트 — `tools/restore_db.sh`

`tools/backup_db.sh` 의 인자·스타일 관례를 따랐다. 요구사항 반영:

- **기본 dry-run** — `--commit` 없이는 무엇을 실행할지만 출력하고 아무것도 쓰지 않음
  (`backend/scripts/import_business_csv.py` 관례).
- **운영 DB 오실행 가드** — `--container` 는 기본값이 없어 항상 명시해야 하고, 값이
  `saigon_db` 이거나 `prod` 를 포함하면 스크립트가 거부한다. 복원은 항상 새로 띄운 격리
  임시 컨테이너를 대상으로만 하도록 강제한다.
- dry-run/가드 모두 실제로 실행해 확인함 (`--container saigon_db` → 거부, 격리 테스트
  컨테이너 대상 dry-run → 명령 미리보기만 출력하고 종료).

```
./tools/restore_db.sh --container <임시컨테이너이름> --dump backups/backup_<ts>.sql.gz [--commit]
```

## 4. 스케줄 — 기존 APScheduler 에 얹음

**확인**: `saigon_worker`(engine 의 Redis Streams 컨슈머)는 백업과 무관한 별도 워커다.
백업 스케줄에 맞는 기존 인프라는 `backend/app/main.py` 의 `lifespan()` 안에 이미 떠 있는
**APScheduler** 였다 (`purge_deleted_accounts`, `refresh_repair_shop_stats` 등 6개 잡이
이미 여기서 돈다) — 별도 cron 컨테이너를 새로 들이지 않고 여기 한 줄 추가로 얹었다.

- 신규 잡: `backend/app/jobs/backup_db.py::run_backup` — `tools/backup_db.sh` 와 동일 로직
  (pg_dump | gzip, `BACKUP_RETENTION_DAYS`(기본 14일) 보존정책)이지만 `docker exec` 대신
  `database` 서비스에 직접 psql 클라이언트로 접속한다 (bff 컨테이너에 호스트 docker 소켓을
  주는 것은 권한 과다라 배제).
- 스케줄: `CronTrigger(hour=2, minute=30)` — `purge_deleted_accounts`(03:10) 보다 앞선
  새벽 시간대, id `backup_db`.
- 실패 시 기존 F-18 경로(`services/ops_alerts.send_ops_alert`, `OPS_ALERT_WEBHOOK_URL` 미설정
  시 로그만) 로 경보 — pg_dump 실행 예외·rc≠0·설정 누락 3가지 케이스 모두 알림.
- 산출물 경로: 컨테이너 내부 `/app/backups` → `docker-compose.yml` 볼륨으로 호스트
  `./backups`에 마운트 (`tools/backup_db.sh` 산출물과 동일 디렉터리, 파일명에 타임스탬프가
  있어 수동/자동 백업이 섞여도 충돌 없음).
- 인프라 변경: `backend/Dockerfile` 에 `postgresql-client` 추가(pg_dump 필요),
  `docker-compose.yml` `bff` 서비스에 `PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD` 환경변수
  (`bff_migrate` 와 동일 패턴, 비밀번호는 `.env` 의 `DB_PASSWORD` 그대로 재사용 — 하드코딩
  없음) + `./backups:/app/backups` 볼륨 추가.
- 신규 선택적 env: `BACKUP_RETENTION_DAYS`(기본 14) — `.env` 미설정 시 기본값 사용이라
  `.env.example` 키셋 동기화 규칙 위반 아님(다른 `*_:-` 패턴과 동일).

## 5. 오프사이트·암호화 — 구현 완료 (2026-08-02 추가)

**대표 결정**: 저장 위치는 **S3 호환**(AWS S3 / Cloudflare R2 / MinIO 등 무엇이든 같은 코드로
붙는다 — `boto3` 의 `endpoint_url` 오버라이드만 다름). 아래는 그 이전에 정리했던 선택지
비교(참고용, 이미 S3 호환으로 결정됐으므로 GCS·외부디스크 행은 미실행 상태로 남는다).

| 선택지 | 필요 작업 | 비용(추정) | 비고 |
|---|---|---|---|
| **S3 (AWS)** | IAM 사용자/역할 발급, 버킷 생성(+수명주기 정책으로 자동 만료), `boto3` 또는 `aws s3 cp` 로 업로드 스텝을 `run_backup()` 뒤에 추가, `.env` 에 `BACKUP_S3_BUCKET`/자격증명 키 추가 | 스토리지 극소량(수백MB~수GB 규모면 월 $1 미만) + 전송료 | AWS 계정 이미 있으면 진입장벽 최소 |
| **GCS (Google Cloud Storage)** | 서비스 계정 키 발급, 버킷 생성, `gsutil` 또는 `google-cloud-storage` SDK 업로드 스텝 | S3 와 유사 | GCP 계정 이미 쓰는 경우 유리 |
| **외부 디스크/오프사이트 서버 (예: Zalo 프록시 VPS 와 별개의 저장 전용 VPS, 또는 대표 개인 NAS)** | 저장 서버/디스크 확보, `rsync`/`scp` 업로드 스텝, 접근 자격(SSH 키) 관리 | 이미 보유한 인프라면 $0, 신규면 VPS 비용(Zalo 프록시 VPS 참고 시 월 ~$6 수준) | 클라우드 계정 신규 개설을 피하고 싶을 때 |

공통으로 필요한 작업(선택 이후):
- **암호화**: 업로드 전 `gpg --symmetric` 또는 `openssl enc` 로 대칭키 암호화한 뒤 반출 —
  키는 `.env` 가 아니라 별도 시크릿 관리(예: 대표 개인 보관, 이 리포에 커밋 금지).
- **주입 지점**: `backend/app/jobs/backup_db.py::run_backup()` 이 로컬 덤프 생성까지 담당하고,
  저장 위치가 정해지면 그 뒤에 업로드 단계 함수 하나(`upload_offsite(out_file)` 같은 형태)를
  추가해 꽂는 구조로 이미 분리해뒀다 — 코드는 이 정도까지만 준비하고 실제 자격증명/버킷은
  대표 결정 후 별도 작업으로 만든다.

### 5-1. 구현 — 암호화 도구 선택 근거

**`openssl enc -aes-256-cbc -pbkdf2`** 를 선택했다 (`age`, `gpg` 대비):

- `age` 는 이 환경(dev 컨테이너 base image, `python:3.12-slim`)에 **설치돼 있지 않다**
  (`which age` → not found). 새로 apt 패키지를 추가하는 것보다 이미 있는 도구를 쓰는 게
  더 단순하다.
- `gpg` 는 있지만(`/usr/bin/gpg`), `openssl` 은 `python:3.12-slim` 베이스 이미지에 **기본
  포함**돼 있어(Debian 기반 이미지의 표준 구성요소) 추가 설치가 전혀 필요 없다. 이 저장소는
  이미 여러 곳에서 `openssl rand -hex 32` 관례(`.env.example` 의 `IMGPROXY_KEY`,
  `ENGINE_SERVICE_KEY` 등 주석)를 쓰고 있어 도구 일관성도 맞는다.
- 대칭키 1개로 전 백업을 암호화하는 요구사항(요구사항 4 — "키 분실 = 백업 전손")에는
  `openssl enc` 의 패스프레이즈 기반 대칭암호가 정확히 맞는 모델이다. `-pbkdf2` 로 키
  유도를 강제해(기본 EVP_BytesToKey 대신) 사전공격에 더 강하게 했고, `-salt` 로 매 백업마다
  다른 ciphertext 가 나오게 했다(같은 평문·같은 키라도 salt 가 랜덤).
- 패스프레이즈는 커맨드라인 인자(`-pass pass:...`)로 넘기지 않고 **`-pass env:BACKUP_ENCRYPTION_KEY`**
  로 넘긴다 — 커맨드라인 인자는 `ps aux` 로 다른 프로세스에서 노출될 수 있어 회피했다.

구현: `backend/app/services/backup_offsite.py`
- `_encrypt()`: 로컬 gzip 덤프 → `<파일명>.enc` (openssl 서브프로세스, 실패 시 None 반환).
- `_s3_put()`: `boto3.client("s3", endpoint_url=...)` 로 업로드 — `endpoint_url` 이 비어있으면
  AWS 기본 엔드포인트, 채워지면 R2/MinIO 등 어떤 S3 호환 서비스로도 동일 코드로 붙는다.
  업로드 성공/실패 여부와 무관하게 로컬 `.enc` 임시파일은 `finally` 로 항상 삭제(디스크에
  평문 옆에 암호문이 계속 쌓이는 것 방지 — 원본 gzip 덤프는 기존 보존정책대로 유지).
- `upload_offsite()`: `BACKUP_S3_BUCKET`/`BACKUP_ENCRYPTION_KEY` 둘 중 하나라도 비어있으면
  로그만 남기고 `True`(무동작 성공) 반환 — 요구사항 2 의 fail-open. 암호화·업로드 어느
  단계든 실패하면 `False` 반환하고, 호출부(`run_backup()`)는 이때만 `send_ops_alert` 를
  보내되 **백업 잡 자체는 계속 `True`(성공)를 반환** — 로컬 백업은 오프사이트 업로드와
  무관하게 이미 끝나 있기 때문이다.
- 신규 의존성: `boto3>=1.34` (`backend/requirements.txt`) — S3 호환 API 서명(SigV4)을
  직접 구현하는 대신 표준 SDK 사용(과설계·재발명 방지).

### 5-2. 검증 — 라운드트립 실증 (2026-08-02, dev 격리 환경)

실제 클라우드 자격증명 없이 검증하기 위해 **로컬 MinIO 컨테이너**(`minioverify`, `saigon-net`
네트워크, S3 API 호환)를 임시로 띄워 실증했다. 검증 후 **컨테이너·볼륨 완전 제거 확인**
(`docker ps -a` 에 잔존 없음).

| 단계 | 결과 |
|---|---|
| 1. env 미설정 상태에서 `upload_offsite()` 호출 | `True` 반환, "BACKUP_S3_BUCKET/BACKUP_ENCRYPTION_KEY 미설정 — 오프사이트 업로드 건너뜀" 로그만, 업로드 시도 없음 (요구사항 2 확인) |
| 2. env 설정(`BACKUP_S3_BUCKET=backup-verify`, `BACKUP_ENCRYPTION_KEY=test-passphrase-...`, `BACKUP_S3_ENDPOINT_URL=http://minioverify:9000` 등) 후 동일 호출 | `True` 반환, 암호화 → MinIO 업로드 성공 |
| 3. MinIO 에서 업로드된 `testdump.sql.gz.enc` 를 다시 다운로드 | 성공, 객체 1개 확인 |
| 4. 다운로드한 `.enc` 를 `openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_ENCRYPTION_KEY` 로 복호화 | 성공 |
| 5. 복호화 결과 SHA-256 vs 원본 평문 SHA-256 | **완전 일치**(`a158f750aacf46e8f3667dd2931cd6e7ab51ddd76ad3e027a313bf273356c646`) — 암호화→업로드→다운로드→복호화 라운드트립 전 과정에서 바이트 손상 없음 확인 |

이것이 이 과업에서 가장 중요한 검증 기준(요구사항 6)이며 실제로 통과했다.

### 5-3. 복호화 절차 (문서화, 필수)

오프사이트 백업을 실제로 되찾을 때:

```bash
# 1) 버킷에서 암호화된 객체를 내려받는다 (예: aws-cli 또는 boto3, 버킷·자격증명은 대표 보관)
aws s3 cp s3://<BACKUP_S3_BUCKET>/backup_<ts>.sql.gz.enc ./backup_<ts>.sql.gz.enc \
  --endpoint-url "$BACKUP_S3_ENDPOINT_URL"   # AWS 기본 엔드포인트면 --endpoint-url 생략

# 2) BACKUP_ENCRYPTION_KEY 로 복호화 (커맨드라인에 키를 직접 쓰지 않는다 — env 로 전달)
export BACKUP_ENCRYPTION_KEY='<보관해둔 패스프레이즈>'
openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_ENCRYPTION_KEY \
  -in backup_<ts>.sql.gz.enc -out backup_<ts>.sql.gz

# 3) 이후는 기존 로컬 백업과 동일 — tools/restore_db.sh 참조 (격리된 임시 컨테이너에 복원)
```

**이 절차가 실행 불가능해지는 유일한 경우는 `BACKUP_ENCRYPTION_KEY` 분실이다** — 대칭키
1개로 전체 오프사이트 백업을 암호화하므로, 키를 잃으면 그 키로 만든 모든 오프사이트 백업이
영구 복구 불가능해진다. `.env.example`/`.env` 의 주석과 `backup_offsite.py` 모듈 docstring
양쪽에 이 경고를 남겼다.

### 5-4. 보존 정책 — 로컬 vs 원격

- **로컬**: 기존 `BACKUP_RETENTION_DAYS`(기본 14일) 그대로 — 변경 없음.
- **원격(오프사이트)**: 코드로 원격 객체를 삭제하는 로직은 **추가하지 않았다** — 버킷을
  잘못 지정하거나 로직에 버그가 있으면 오프사이트 백업 전체가 조용히 삭제될 수 있는
  위험이 삭제 코드 자체보다 크다고 판단했다(과업 지시 "원격 객체를 지우는 코드는 위험하니
  신중하라"). 대신 **버킷 lifecycle 정책**(S3/R2/MinIO 모두 지원하는 기능, 예: "N일 지난
  객체 자동 만료")으로 원격 보존을 관리하는 것을 권장한다 — 애플리케이션 코드가 아니라
  스토리지 자체의 선언적 정책이라 버그로 인한 오삭제 위험이 없고, 버킷 생성 시 대표/운영이
  한 번 설정해두면 끝난다.

## 6. 대표 결정이 필요한 것

1. **오프사이트 저장 위치는 S3 호환으로 결정 완료** — 남은 것은 **실제 버킷 생성 +
   자격증명 발급**(AWS S3 / Cloudflare R2 / MinIO self-host 중 택1) 뿐이다. 발급 후
   `.env` 의 `BACKUP_S3_BUCKET`/`BACKUP_S3_ENDPOINT_URL`/`BACKUP_S3_REGION`/
   `BACKUP_S3_ACCESS_KEY_ID`/`BACKUP_S3_SECRET_ACCESS_KEY`/`BACKUP_ENCRYPTION_KEY` 6개
   키만 채우면 다음 새벽 백업부터 즉시 오프사이트 업로드가 시작된다(코드 변경 불필요).
2. **`BACKUP_ENCRYPTION_KEY` 보관** — `openssl rand -base64 32` 등으로 생성한 뒤 **`.env`
   와는 별도로**(비밀번호 관리자·대표 개인 보관 등) 이중 보관 필수. 이 키를 잃으면
   그 키로 만든 모든 오프사이트 백업이 영구 복구 불가하다(§5-3).
3. **원격 버킷 lifecycle(보존기간) 설정** — 버킷 생성 시 대표/운영이 스토리지 콘솔에서
   설정(§5-4). 코드 변경 불필요.
4. **백업 주기(RPO) 승인** — 현재 일 1회(RPO 24h)로 구현. 더 짧게 필요하면(예: 6시간)
   `CronTrigger` 인자만 바꾸면 되는 단순 변경이라 승인만 나면 즉시 반영 가능.
5. **운영 규모 실 복구 훈련** — 이 문서의 RTO 실측은 dev 소규모 데이터 기준이다. 운영
   반영 전(또는 반영 직후 트래픽 낮은 시간) 운영 규모 데이터로 최소 1회 실제 restore drill을
   별도로 수행해 RTO 를 재산정할 필요가 있다 — 이번 과업 범위(dev-only)를 벗어나 대표 승인
   후 별도 일정으로 진행.

## 7. 변경/추가 파일

- `tools/restore_db.sh` (신규) — 복원 스크립트, dry-run 기본 + 운영 DB 가드.
- `backend/app/jobs/backup_db.py` (신규, 이후 오프사이트 업로드 호출 추가) — 정기백업 잡
  (pg_dump, 보존정책, ops_alert 경보, `upload_offsite()` 호출).
- `backend/app/services/backup_offsite.py` (신규, 2026-08-02) — 오프사이트 암호화 업로드
  (openssl 암호화 + boto3 S3 호환 업로드, fail-open).
- `backend/app/main.py` — APScheduler 에 `backup_db` 잡 등록 (02:30 ICT).
- `backend/Dockerfile` — `postgresql-client` 추가.
- `backend/requirements.txt` — `boto3>=1.34` 추가 (2026-08-02).
- `docker-compose.yml` — `bff` 서비스에 `PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD/BACKUP_RETENTION_DAYS`
  env + `./backups:/app/backups` 볼륨, (2026-08-02) 오프사이트 6개 env 추가.
- `.env` / `.env.example` (2026-08-02) — 오프사이트 백업 6개 키 추가(둘 다 빈 값, 키셋 동기화).
- `ai-docs/260802_backup_restore_drill.md` (이 문서, §5 이하 2026-08-02 갱신).

커밋은 하지 않았다(작업 지시에 따름) — 작업 트리에만 존재.
