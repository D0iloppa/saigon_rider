"""탈퇴회원 식별자 해시 (withdrawn_member_archive, 170) — HMAC 헬퍼 + 보관기간 상수.

대표 결정(2026-08-02): 부정이용(재가입·제재회피) 방지 추적 목적으로 탈퇴 시
전화번호·OAuth 식별자를 **해시로만** 1년 보관한다. 원본은 보관하지 않는다.

기록: routers/users.py delete_account / 조회: admin_api/users.py withdrawn-check /
복구 시 삭제: routers/auth.py restore_account / 1년 경과 파기: jobs/purge_deleted_accounts.py
"""

import hashlib
import hmac
import os
from datetime import timedelta

# 대표 결정(2026-08-02): 식별자 해시 보관 기간 1년.
WITHDRAWN_ARCHIVE_RETENTION_DAYS = 365
WITHDRAWN_ARCHIVE_RETENTION = timedelta(days=WITHDRAWN_ARCHIVE_RETENTION_DAYS)


def hash_identifier(value: str) -> str | None:
    """HMAC-SHA256(key=pepper, msg=value) hex. pepper 미설정이면 None (호출부가 fail-open 처리).

    평문 SHA256 을 쓰지 않는 이유: 전화번호는 키스페이스가 작아(VN 모바일 로컬부 9자리)
    전수 대입으로 즉시 역산된다 — 서버 비밀값(env WITHDRAWN_HASH_PEPPER)을 키로 쓰는
    HMAC 이어야 "복원 불가능한 해시"가 성립한다. pepper 는 매 호출 시점에 읽는다
    (모듈 import 시점 고정 금지 — 테스트·재기동 없이 주입된 환경 반영).
    """
    pepper = os.getenv("WITHDRAWN_HASH_PEPPER", "")
    if not pepper:
        return None
    return hmac.new(pepper.encode(), value.encode(), hashlib.sha256).hexdigest()
