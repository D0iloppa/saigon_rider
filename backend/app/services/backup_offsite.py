"""오프사이트 암호화 백업 업로드 — 게이트9 B-5 잔여 항목.

app/jobs/backup_db.py 가 만든 로컬 pg_dump 산출물(gzip)을 openssl 대칭키로 암호화한 뒤
S3 호환 버킷(AWS S3 / Cloudflare R2 / MinIO 등 — boto3 endpoint_url 오버라이드만 다를 뿐
코드는 동일)에 업로드한다.

BACKUP_S3_BUCKET·BACKUP_ENCRYPTION_KEY 미설정 시 완전 무동작(fail-open) — 로컬 백업은 이미
성공했으므로 이 모듈의 미설정/실패가 백업 잡 전체를 실패시키지 않는다. ZALO_API_PROXY
("비우면 프록시 없이 직접 호출")·WITHDRAWN_HASH_PEPPER 와 동일한 관례.

⚠️ BACKUP_ENCRYPTION_KEY 분실 = 그 키로 암호화된 모든 오프사이트 백업 영구 복구 불가
   (대칭키 1개로 전체 암호화). .env 외 별도 비밀관리 수단에 이중 보관할 것.

복호화 절차 (원본 dump.sql.gz 되찾기):
    openssl enc -d -aes-256-cbc -pbkdf2 -pass env:BACKUP_ENCRYPTION_KEY \
        -in backup_<ts>.sql.gz.enc -out backup_<ts>.sql.gz
    (그 다음 tools/restore_db.sh 로 통상 복원)
"""

from __future__ import annotations

import asyncio
import logging
import os
from pathlib import Path

log = logging.getLogger(__name__)


async def _encrypt(src: Path, enc_key: str) -> Path | None:
    dst = src.with_name(src.name + ".enc")
    cmd = [
        "openssl",
        "enc",
        "-aes-256-cbc",
        "-pbkdf2",
        "-salt",
        "-pass",
        "env:BACKUP_ENCRYPTION_KEY",
        "-in",
        str(src),
        "-out",
        str(dst),
    ]
    env = {**os.environ, "BACKUP_ENCRYPTION_KEY": enc_key}
    try:
        proc = await asyncio.create_subprocess_exec(
            *cmd,
            stdout=asyncio.subprocess.DEVNULL,
            stderr=asyncio.subprocess.PIPE,
            env=env,
        )
        _, stderr = await proc.communicate()
    except Exception:
        log.exception("backup_offsite: openssl 실행 예외")
        return None
    if proc.returncode != 0 or not dst.exists() or dst.stat().st_size == 0:
        log.error("backup_offsite: openssl 암호화 실패 (rc=%s): %s", proc.returncode, stderr.decode(errors="replace"))
        return None
    return dst


def _s3_put(enc_path: Path, bucket: str) -> None:
    import boto3  # 지연 임포트 — 오프사이트 미설정 환경에서는 불필요

    client = boto3.client(
        "s3",
        endpoint_url=os.getenv("BACKUP_S3_ENDPOINT_URL") or None,
        region_name=os.getenv("BACKUP_S3_REGION") or None,
        aws_access_key_id=os.getenv("BACKUP_S3_ACCESS_KEY_ID") or None,
        aws_secret_access_key=os.getenv("BACKUP_S3_SECRET_ACCESS_KEY") or None,
    )
    client.upload_file(str(enc_path), bucket, enc_path.name)


async def upload_offsite(local_path: Path) -> bool:
    """로컬 gzip 덤프(local_path)를 암호화해 오프사이트 버킷에 업로드.

    반환값: True = 업로드 성공, 또는 BACKUP_S3_BUCKET/BACKUP_ENCRYPTION_KEY 미설정으로
    건너뜀 (둘 다 정상 상태). False = 오프사이트 설정은 돼 있으나 암호화/업로드 시도가
    실패한 경우 — 호출부가 ops_alert 를 보내되, 어느 경우든 로컬 백업(이미 완료됨)은
    영향받지 않는다.
    """
    bucket = os.getenv("BACKUP_S3_BUCKET", "")
    enc_key = os.getenv("BACKUP_ENCRYPTION_KEY", "")
    if not bucket or not enc_key:
        log.info("backup_offsite: BACKUP_S3_BUCKET/BACKUP_ENCRYPTION_KEY 미설정 — 오프사이트 업로드 건너뜀")
        return True

    enc_path = await _encrypt(local_path, enc_key)
    if enc_path is None:
        return False

    try:
        await asyncio.to_thread(_s3_put, enc_path, bucket)
        log.info("backup_offsite: 업로드 완료 s3://%s/%s", bucket, enc_path.name)
        return True
    except Exception:
        log.exception("backup_offsite: S3 업로드 실패")
        return False
    finally:
        enc_path.unlink(missing_ok=True)
