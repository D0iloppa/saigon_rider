"""admin JSON API — 고객용 메일함 읽기 전용 조회 (외부 Dovecot IMAP).

partner@/support@ 메일함을 운영자 콘솔에서 본다. 답장·발송·삭제·읽음처리는 범위 밖.
그룹웨어가 같은 메일함을 쓰므로 EXAMINE(readonly select) + BODY.PEEK 로 \\Seen 등 플래그를 절대 바꾸지 않는다.

설정은 env 로만 — ADMIN_MAILBOX_IMAP_HOST / ADMIN_MAILBOX_IMAP_PORT(기본 993) /
ADMIN_MAILBOXES(`주소:비밀번호,주소:비밀번호`, 첫 `:` 기준 분리). 요청마다 연결·로그아웃(커넥션 풀 없음).
"""

import asyncio
import contextlib
import email
import imaplib
import os
import re
from datetime import datetime
from email import policy
from email.message import EmailMessage
from urllib.parse import quote

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_admin_api
from ...database import get_db
from ._audit import audit

router = APIRouter(prefix="/mailboxes")

_UID_RE = re.compile(rb"UID (\d+)")
_FLAGS_RE = re.compile(rb"FLAGS \(([^)]*)\)")
_SIZE_RE = re.compile(rb"RFC822\.SIZE (\d+)")
_LIST_FETCH = "(UID FLAGS RFC822.SIZE BODYSTRUCTURE BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])"


class MailboxOut(BaseModel):
    address: str


class MessageRow(BaseModel):
    uid: int
    from_name: str
    from_addr: str
    subject: str
    date: datetime | None
    seen: bool
    has_attachments: bool
    size: int


class MessagePage(BaseModel):
    total: int
    items: list[MessageRow]


class AttachmentOut(BaseModel):
    index: int
    filename: str
    content_type: str
    size: int


class MessageDetail(BaseModel):
    uid: int
    from_: str = Field(serialization_alias="from")
    to: str
    cc: str
    subject: str
    date: datetime | None
    text: str | None
    html: str | None
    attachments: list[AttachmentOut]


def _mailboxes() -> dict[str, str]:
    out: dict[str, str] = {}
    for entry in os.getenv("ADMIN_MAILBOXES", "").split(","):
        entry = entry.strip()
        if ":" not in entry:
            continue
        address, password = entry.split(":", 1)
        out[address.strip()] = password
    return out


async def _with_mailbox(address: str, fn):
    """주소 검증 → 스레드에서 IMAP 접속(EXAMINE INBOX) → fn(conn) → 로그아웃."""
    password = _mailboxes().get(address)
    if password is None:
        raise HTTPException(status_code=404, detail="mailbox not found")
    host = os.getenv("ADMIN_MAILBOX_IMAP_HOST")
    if not host:
        raise HTTPException(status_code=503, detail="메일함 IMAP 호스트가 설정되지 않았습니다.")
    port = int(os.getenv("ADMIN_MAILBOX_IMAP_PORT") or 993)

    def run():
        try:
            conn = imaplib.IMAP4_SSL(host, port, timeout=20)
        except OSError as e:
            raise HTTPException(status_code=502, detail=f"메일서버 연결 실패: {e}") from e
        try:
            conn.login(address, password)
            # readonly=True → EXAMINE: 서버가 \Seen 을 포함한 어떤 플래그도 바꾸지 못한다.
            conn.select("INBOX", readonly=True)
            return fn(conn)
        except imaplib.IMAP4.error as e:
            raise HTTPException(status_code=502, detail=f"메일서버 오류: {e}") from e
        finally:
            with contextlib.suppress(imaplib.IMAP4.error, OSError):
                conn.logout()

    return await asyncio.to_thread(run)


def _group_fetch(data: list) -> list[tuple[bytes, bytes]]:
    """imaplib FETCH 응답을 메시지 단위 (메타, 리터럴) 로 묶는다. 각 메시지 응답은 `)` 로 끝난다."""
    groups: list[tuple[bytes, bytes]] = []
    meta, literal = b"", b""
    for item in data:
        if isinstance(item, tuple):
            meta += item[0]
            literal += item[1]
        else:
            meta += item
            if item.endswith(b")"):
                groups.append((meta, literal))
                meta, literal = b"", b""
    return groups


def _parse(raw: bytes) -> EmailMessage:
    return email.message_from_bytes(raw, policy=policy.default)


def _header_str(msg: EmailMessage, name: str) -> str:
    value = msg[name]
    return "" if value is None else str(value)


def _date(msg: EmailMessage) -> datetime | None:
    value = msg["Date"]
    return getattr(value, "datetime", None) if value is not None else None


def _from_parts(msg: EmailMessage) -> tuple[str, str]:
    value = msg["From"]
    addresses = getattr(value, "addresses", ()) if value is not None else ()
    if addresses:
        return addresses[0].display_name, addresses[0].addr_spec
    return _header_str(msg, "From"), ""


def _part_text(part: EmailMessage) -> str:
    try:
        return part.get_content()
    except (LookupError, UnicodeDecodeError):  # 알 수 없는 charset (스팸 등)
        return (part.get_payload(decode=True) or b"").decode("utf-8", errors="replace")


def _attachment_bytes(part: EmailMessage) -> bytes:
    raw = part.get_payload(decode=True)
    if raw is None:  # message/rfc822 (전달 메일) — 내부 메시지를 .eml 로
        raw = part.get_payload(0).as_bytes()
    return raw


def _fetch_message(conn: imaplib.IMAP4_SSL, uid: int) -> EmailMessage:
    _typ, data = conn.uid("FETCH", str(uid), "(BODY.PEEK[])")
    groups = _group_fetch(data)
    if not groups or not groups[0][1]:
        raise HTTPException(status_code=404, detail="message not found")
    return _parse(groups[0][1])


@router.get("", response_model=list[MailboxOut])
async def list_mailboxes(_session: AdminSession = Depends(verify_admin_api)):
    return [MailboxOut(address=a) for a in _mailboxes()]


@router.get("/{address}/messages", response_model=MessagePage)
async def list_messages(
    address: str,
    page: int = Query(1, ge=1),
    size: int = Query(30, ge=1, le=100),
    _session: AdminSession = Depends(verify_admin_api),
):
    def run(conn: imaplib.IMAP4_SSL) -> MessagePage:
        _typ, data = conn.uid("SEARCH", None, "ALL")
        uids = [int(u) for u in data[0].split()]
        page_uids = uids[::-1][(page - 1) * size : page * size]
        if not page_uids:
            return MessagePage(total=len(uids), items=[])

        _typ, data = conn.uid("FETCH", ",".join(map(str, page_uids)), _LIST_FETCH)
        items = []
        for meta, headers in _group_fetch(data):
            uid_m = _UID_RE.search(meta)
            if uid_m is None:
                continue
            msg = _parse(headers)
            from_name, from_addr = _from_parts(msg)
            flags_m = _FLAGS_RE.search(meta)
            size_m = _SIZE_RE.search(meta)
            items.append(
                MessageRow(
                    uid=int(uid_m.group(1)),
                    from_name=from_name,
                    from_addr=from_addr,
                    subject=_header_str(msg, "Subject"),
                    date=_date(msg),
                    seen=b"\\Seen" in (flags_m.group(1) if flags_m else b""),
                    # BODYSTRUCTURE 의 disposition 토큰만 본다 — 파싱 없이 가볍게.
                    has_attachments=b'"attachment"' in meta.lower(),
                    size=int(size_m.group(1)) if size_m else 0,
                )
            )
        items.sort(key=lambda r: r.uid, reverse=True)
        return MessagePage(total=len(uids), items=items)

    return await _with_mailbox(address, run)


@router.get("/{address}/messages/{uid}", response_model=MessageDetail)
async def get_message(
    address: str,
    uid: int,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    def run(conn: imaplib.IMAP4_SSL) -> MessageDetail:
        msg = _fetch_message(conn, uid)
        text_part = msg.get_body(preferencelist=("plain",))
        html_part = msg.get_body(preferencelist=("html",))
        return MessageDetail(
            uid=uid,
            from_=_header_str(msg, "From"),
            to=_header_str(msg, "To"),
            cc=_header_str(msg, "Cc"),
            subject=_header_str(msg, "Subject"),
            date=_date(msg),
            text=_part_text(text_part) if text_part is not None else None,
            html=_part_text(html_part) if html_part is not None else None,
            attachments=[
                AttachmentOut(
                    index=i,
                    filename=part.get_filename() or f"attachment-{i}",
                    content_type=part.get_content_type(),
                    size=len(_attachment_bytes(part)),
                )
                for i, part in enumerate(msg.iter_attachments())
            ],
        )

    detail = await _with_mailbox(address, run)
    await audit(db, session, request, "MAILBOX_READ", "mailbox", address, {"uid": uid})
    await db.commit()
    return detail


@router.get("/{address}/messages/{uid}/attachments/{index}")
async def download_attachment(
    address: str,
    uid: int,
    index: int,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    def run(conn: imaplib.IMAP4_SSL) -> tuple[str, bytes]:
        msg = _fetch_message(conn, uid)
        parts = list(msg.iter_attachments())
        if index < 0 or index >= len(parts):
            raise HTTPException(status_code=404, detail="attachment not found")
        part = parts[index]
        return part.get_filename() or f"attachment-{index}", _attachment_bytes(part)

    filename, raw = await _with_mailbox(address, run)
    await audit(db, session, request, "MAILBOX_ATTACHMENT", "mailbox", address, {"uid": uid, "index": index})
    await db.commit()
    # octet-stream 고정 — HTML 첨부가 admin origin 에서 렌더되는 것을 막는다.
    return Response(
        content=raw,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )
