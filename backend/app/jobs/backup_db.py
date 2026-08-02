"""PostgreSQL 정기 백업 (pg_dump) — 게이트9 B-5.

tools/backup_db.sh 를 수동/host cron 으로 돌리는 대신, 이미 bff 컨테이너에 떠 있는
APScheduler(main.py lifespan)에 얹는다 — 별도 cron 인프라를 새로 두지 않는다.
로직은 tools/backup_db.sh 와 동일(pg_dump | gzip, RETENTION_DAYS 보존정책)하되, docker exec
가 아니라 `database` 서비스에 직접 psql 클라이언트(PGHOST 등 env)로 접속한다 — 이 컨테이너는
호스트 docker 소켓에 접근할 수 없고, 접근을 주면 권한 과다이므로 두지 않는다.

산출물: /app/backups/backup_<timestamp>.sql.gz (docker-compose.yml 볼륨으로 호스트
./backups 에 마운트 — tools/backup_db.sh 산출물과 동일 디렉터리, 자동/수동 백업이 뒤섞여도
파일명에 타임스탬프가 있어 충돌하지 않는다).

로컬 백업 완료 뒤 services/backup_offsite.upload_offsite() 로 오프사이트(S3 호환) 암호화
업로드를 시도한다 — 미설정 시 건너뜀(fail-open), 실패해도 이 잡 자체는 실패시키지 않는다
(ai-docs/260802_backup_restore_drill.md §5 참조).
"""

import asyncio
import logging
import os
from datetime import datetime
from pathlib import Path

log = logging.getLogger(__name__)

BACKUP_DIR = Path(os.getenv("BACKUP_DIR", "/app/backups"))
RETENTION_DAYS = int(os.getenv("BACKUP_RETENTION_DAYS", "14"))


async def run_backup() -> bool:
    from ..services.backup_offsite import upload_offsite
    from ..services.ops_alerts import send_ops_alert

    pg_host = os.getenv("PGHOST")
    pg_db = os.getenv("PGDATABASE")
    pg_user = os.getenv("PGUSER")
    if not (pg_host and pg_db and pg_user):
        log.error("backup_db: PGHOST/PGDATABASE/PGUSER 미설정 — 건너뜀")
        await send_ops_alert("DB 백업 실패: PGHOST/PGDATABASE/PGUSER 미설정", key="backup_db_config")
        return False

    BACKUP_DIR.mkdir(parents=True, exist_ok=True)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    out_file = BACKUP_DIR / f"backup_{timestamp}.sql.gz"

    dump_cmd = f'pg_dump -h "{pg_host}" -U "{pg_user}" "{pg_db}" | gzip > "{out_file}"'
    try:
        proc = await asyncio.create_subprocess_shell(
            dump_cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
        )
        _, stderr = await proc.communicate()
        if proc.returncode != 0 or not out_file.exists() or out_file.stat().st_size == 0:
            log.error("backup_db: pg_dump 실패 (rc=%s): %s", proc.returncode, stderr.decode(errors="replace"))
            await send_ops_alert(f"DB 백업 실패: pg_dump rc={proc.returncode}", key="backup_db_failure")
            return False
    except Exception:
        log.exception("backup_db: pg_dump 실행 중 예외")
        await send_ops_alert("DB 백업 실패: pg_dump 실행 예외", key="backup_db_failure")
        return False

    log.info("backup_db: 백업 완료 %s (%d bytes)", out_file, out_file.stat().st_size)

    # 오프사이트 암호화 업로드 — 미설정 시 건너뜀, 실패해도 로컬 백업 성공은 그대로 유지
    if not await upload_offsite(out_file):
        await send_ops_alert("DB 백업 오프사이트 업로드 실패", key="backup_db_offsite_failure")

    # 보존정책: RETENTION_DAYS 초과 덤프 삭제 (tools/backup_db.sh 와 동일 정책)
    cutoff = datetime.now().timestamp() - RETENTION_DAYS * 86400
    for old_file in BACKUP_DIR.glob("backup_*.sql.gz"):
        try:
            if old_file.stat().st_mtime < cutoff:
                old_file.unlink()
                log.info("backup_db: 보존기한 초과 삭제 %s", old_file)
        except OSError:
            log.exception("backup_db: 보존정책 삭제 실패 %s", old_file)

    return True
