"""admin JSON API — 고객용 메일함 (외부 Dovecot IMAP 조회 + SMTP submission 발송).

partner@/support@ 메일함을 운영자 콘솔에서 읽고 답한다. 그룹웨어가 같은 메일함을 쓰므로 폴더명(INBOX/Sent/Trash)·
휴지통 방식(MOVE)·보낸메일 사본(Sent 에 \\Seen APPEND)을 그룹웨어(mailClient.js)와 동일하게 맞춰 양쪽에서 같은 상태로 보인다.

- 목록은 BODY.PEEK(플래그 불변). 상세 열람은 \\Seen 을 붙인다(그룹웨어와 공유되는 읽음 상태).
- 삭제 = Trash 로 MOVE. 복구 = Trash → INBOX. 영구삭제·비우기는 Trash 에서만. 스팸 폴더는 다루지 않는다.
- 발송 = SMTP submission(STARTTLS, 메일함 계정 인증 — 서버 milter 가 DKIM 서명) → Sent 에 \\Seen 사본 APPEND →
  답장이면 원문에 \\Answered. 본문은 평문 입력을 HTML 로 변환(+text/plain 대체본), 원문 인용은 서버가 붙인다.
- 수신확인(그룹웨어 DESIGN-MAIL-read-receipt.md R2·R3·R5~R9, D1~D3): To/Cc 수신자별 토큰 픽셀을 넣어 별도 SMTP
  트랜잭션으로 보내고(R8), Sent 사본에는 배너만(R7). 열람은 공개 라우터(routers/mail_receipt.py)가 기록. 항상 켬(R1 UI 없음).

설정은 env 로만 — ADMIN_MAILBOX_IMAP_HOST / ADMIN_MAILBOX_IMAP_PORT(기본 993) / ADMIN_MAILBOX_SMTP_HOST /
ADMIN_MAILBOX_SMTP_PORT(기본 587) / ADMIN_MAILBOX_FROM_NAME / ADMIN_MAILBOXES(`주소:비밀번호,…`, 첫 `:` 기준 분리).
요청마다 연결·로그아웃(커넥션 풀 없음).
"""

import asyncio
import contextlib
import email
import html as html_lib
import imaplib
import os
import re
import smtplib
import ssl
import time
import uuid
from datetime import UTC, datetime
from email import policy
from email.headerregistry import Address
from email.message import EmailMessage
from email.utils import format_datetime, getaddresses
from typing import Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.responses import Response
from pydantic import BaseModel, Field
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from ...admin_auth import AdminSession, verify_admin_api
from ...database import get_db
from ...models import AdminMailReadReceipt
from ...utils import BFF_PUBLIC_URL
from ._audit import audit

router = APIRouter(prefix="/mailboxes")

FolderKey = Literal["inbox", "sent", "trash"]
# 그룹웨어 mailClient.js 의 SENT_MAILBOX/TRASH_MAILBOX 와 같은 이름 — 바꾸면 양쪽 상태가 갈라진다.
_FOLDERS: dict[str, str] = {"inbox": "INBOX", "sent": "Sent", "trash": "Trash"}

_UID_RE = re.compile(rb"UID (\d+)")
_FLAGS_RE = re.compile(rb"FLAGS \(([^)]*)\)")
_SIZE_RE = re.compile(rb"RFC822\.SIZE (\d+)")
_MESSAGES_RE = re.compile(rb"MESSAGES (\d+)")
_UNSEEN_RE = re.compile(rb"UNSEEN (\d+)")
_LIST_FETCH = "(UID FLAGS RFC822.SIZE BODYSTRUCTURE BODY.PEEK[HEADER.FIELDS (FROM TO SUBJECT DATE)])"

# D1 고지 배너 — 그룹웨어와 맞춰 비워 둔다(대표 결정 2026-10-15). 다시 켜려면 여기에 HTML 한 줄.
_RECEIPT_BANNER = ""
_QUOTE_STYLE = "margin:0 0 0 .8ex;border-left:1px solid #ccc;padding-left:1ex"
# 인용 원문에서 제거할 활성 콘텐츠 — 스크립트·프레임·폼·문서 래퍼·이벤트 핸들러·javascript: URL. (서버측 sanitize)
_ACTIVE_HTML = [
    re.compile(r"(?is)<(script|iframe|object|embed|form|head|title)\b[^>]*>.*?</\1\s*>"),
    re.compile(r"(?is)<(script|iframe|object|embed|form|meta|link|base)\b[^>]*/?>"),
    re.compile(r"(?is)</?(html|body)\b[^>]*>|<!doctype\b[^>]*>"),
    re.compile(r"""(?is)\s+on\w+\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)"""),
    re.compile(r"""(?is)(href|src)\s*=\s*(["']?)\s*javascript:[^"'>\s]*\2"""),
]


class MailboxOut(BaseModel):
    address: str


class FolderStatus(BaseModel):
    key: FolderKey
    total: int
    unseen: int


class MessageRow(BaseModel):
    uid: int
    from_name: str
    from_addr: str
    to: str
    subject: str
    date: datetime | None
    seen: bool
    answered: bool
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
    message_id: str
    # 답장 수신자 계산용("이름 <주소>" 형식). reply_to 는 Reply-To 가 있으면 그것, 없으면 From.
    reply_to: list[str]
    to_addrs: list[str]
    cc_addrs: list[str]
    text: str | None
    html: str | None
    attachments: list[AttachmentOut]


class UidsIn(BaseModel):
    folder: FolderKey = "inbox"
    uids: list[int] = Field(min_length=1, max_length=500)


class FlagsIn(UidsIn):
    seen: bool


class PurgeOut(BaseModel):
    purged: int


class SendOut(BaseModel):
    message_id: str


class ReadReceiptOut(BaseModel):
    id: int
    message_id: str
    recipient_email: str
    subject: str | None
    sent_at: datetime
    first_opened_at: datetime | None
    open_count: int


def _mailboxes() -> dict[str, str]:
    out: dict[str, str] = {}
    for entry in os.getenv("ADMIN_MAILBOXES", "").split(","):
        entry = entry.strip()
        if ":" not in entry:
            continue
        address, password = entry.split(":", 1)
        out[address.strip()] = password
    return out


def _password(address: str) -> str:
    password = _mailboxes().get(address)
    if password is None:
        raise HTTPException(status_code=404, detail="mailbox not found")
    return password


def _select(conn: imaplib.IMAP4_SSL, name: str, readonly: bool) -> int:
    """폴더 SELECT/EXAMINE. Sent/Trash 가 아직 없으면 만든다(그룹웨어 ensureMailbox 와 동일). 반환: 메시지 수."""
    typ, data = conn.select(name, readonly=readonly)
    if typ != "OK" and name != "INBOX":
        conn.create(name)
        typ, data = conn.select(name, readonly=readonly)
    if typ != "OK":
        raise HTTPException(status_code=502, detail=f"메일함 폴더를 열 수 없습니다: {name}")
    return int(data[0] or 0)


async def _with_mailbox(address: str, fn, folder: str | None = "inbox", readonly: bool = True):
    """주소 검증 → 스레드에서 IMAP 접속(폴더 선택, readonly=True 면 EXAMINE) → fn(conn) → 로그아웃."""
    password = _password(address)
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
            if folder is not None:
                _select(conn, _FOLDERS[folder], readonly)
            return fn(conn)
        except imaplib.IMAP4.error as e:
            raise HTTPException(status_code=502, detail=f"메일서버 오류: {e}") from e
        finally:
            with contextlib.suppress(imaplib.IMAP4.error, OSError):
                conn.logout()

    return await asyncio.to_thread(run)


def _uidset(uids: list[int]) -> str:
    return ",".join(str(u) for u in sorted(set(uids)))


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


def _addr_list(msg: EmailMessage, name: str) -> list[str]:
    value = msg[name]
    return [str(a) for a in getattr(value, "addresses", ())] if value is not None else []


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


def _body_parts(msg: EmailMessage) -> tuple[str | None, str | None]:
    text_part = msg.get_body(preferencelist=("plain",))
    html_part = msg.get_body(preferencelist=("html",))
    return (
        _part_text(text_part) if text_part is not None else None,
        _part_text(html_part) if html_part is not None else None,
    )


@router.get("", response_model=list[MailboxOut])
async def list_mailboxes(_session: AdminSession = Depends(verify_admin_api)):
    return [MailboxOut(address=a) for a in _mailboxes()]


@router.get("/{address}/folders", response_model=list[FolderStatus])
async def folder_status(address: str, _session: AdminSession = Depends(verify_admin_api)):
    """폴더별 통수·안읽음 수 (사이드바 배지). STATUS 는 폴더를 열지 않는 가벼운 명령 — 없는 폴더는 0."""

    def run(conn: imaplib.IMAP4_SSL) -> list[FolderStatus]:
        out = []
        for key, name in _FOLDERS.items():
            typ, data = conn.status(name, "(MESSAGES UNSEEN)")
            raw = data[0] if typ == "OK" and data and isinstance(data[0], bytes) else b""
            messages_m, unseen_m = _MESSAGES_RE.search(raw), _UNSEEN_RE.search(raw)
            out.append(
                FolderStatus(
                    key=key,
                    total=int(messages_m.group(1)) if messages_m else 0,
                    unseen=int(unseen_m.group(1)) if unseen_m else 0,
                )
            )
        return out

    return await _with_mailbox(address, run, folder=None)


@router.get("/{address}/messages", response_model=MessagePage)
async def list_messages(
    address: str,
    folder: FolderKey = Query("inbox"),
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
            flags = flags_m.group(1) if flags_m else b""
            size_m = _SIZE_RE.search(meta)
            items.append(
                MessageRow(
                    uid=int(uid_m.group(1)),
                    from_name=from_name,
                    from_addr=from_addr,
                    to=_header_str(msg, "To"),
                    subject=_header_str(msg, "Subject"),
                    date=_date(msg),
                    seen=b"\\Seen" in flags,
                    answered=b"\\Answered" in flags,
                    # BODYSTRUCTURE 의 disposition 토큰만 본다 — 파싱 없이 가볍게.
                    has_attachments=b'"attachment"' in meta.lower(),
                    size=int(size_m.group(1)) if size_m else 0,
                )
            )
        items.sort(key=lambda r: r.uid, reverse=True)
        return MessagePage(total=len(uids), items=items)

    return await _with_mailbox(address, run, folder=folder)


@router.get("/{address}/messages/{uid}", response_model=MessageDetail)
async def get_message(
    address: str,
    uid: int,
    request: Request,
    folder: FolderKey = Query("inbox"),
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    """상세 열람 — 콘솔에서 대응하므로 열면 \\Seen 을 붙인다(그룹웨어와 공유되는 읽음 상태)."""

    def run(conn: imaplib.IMAP4_SSL) -> MessageDetail:
        msg = _fetch_message(conn, uid)
        conn.uid("STORE", str(uid), "+FLAGS.SILENT", "(\\Seen)")
        text, html = _body_parts(msg)
        return MessageDetail(
            uid=uid,
            from_=_header_str(msg, "From"),
            to=_header_str(msg, "To"),
            cc=_header_str(msg, "Cc"),
            subject=_header_str(msg, "Subject"),
            date=_date(msg),
            message_id=_header_str(msg, "Message-ID"),
            reply_to=_addr_list(msg, "Reply-To") or _addr_list(msg, "From"),
            to_addrs=_addr_list(msg, "To"),
            cc_addrs=_addr_list(msg, "Cc"),
            text=text,
            html=html,
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

    detail = await _with_mailbox(address, run, folder=folder, readonly=False)
    await audit(db, session, request, "MAILBOX_READ", "mailbox", address, {"uid": uid, "folder": folder})
    await db.commit()
    return detail


@router.get("/{address}/messages/{uid}/attachments/{index}")
async def download_attachment(
    address: str,
    uid: int,
    index: int,
    request: Request,
    folder: FolderKey = Query("inbox"),
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

    filename, raw = await _with_mailbox(address, run, folder=folder)
    await audit(
        db, session, request, "MAILBOX_ATTACHMENT", "mailbox", address, {"uid": uid, "index": index, "folder": folder}
    )
    await db.commit()
    # octet-stream 고정 — HTML 첨부가 admin origin 에서 렌더되는 것을 막는다.
    return Response(
        content=raw,
        media_type="application/octet-stream",
        headers={"Content-Disposition": f"attachment; filename*=UTF-8''{quote(filename)}"},
    )


# ── 플래그 / 휴지통 ───────────────────────────────────────────────


@router.post("/{address}/messages/flags", status_code=204)
async def set_flags(address: str, body: FlagsIn, _session: AdminSession = Depends(verify_admin_api)):
    """읽음/안읽음 일괄 처리 (\\Seen 만 — 다른 플래그는 이 경로로 못 바꾼다)."""

    def run(conn: imaplib.IMAP4_SSL) -> None:
        conn.uid("STORE", _uidset(body.uids), "+FLAGS.SILENT" if body.seen else "-FLAGS.SILENT", "(\\Seen)")

    await _with_mailbox(address, run, folder=body.folder, readonly=False)


def _move(conn: imaplib.IMAP4_SSL, uids: list[int], to: str) -> None:
    with contextlib.suppress(imaplib.IMAP4.error):
        conn.create(to)  # 이미 있으면 NO — 무시
    typ, data = conn.uid("MOVE", _uidset(uids), to)
    if typ != "OK":
        raise HTTPException(status_code=502, detail=f"메일 이동 실패: {data[0]!r}")


@router.post("/{address}/messages/trash", status_code=204)
async def move_to_trash(
    address: str,
    body: UidsIn,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    """삭제 = Trash 로 MOVE (그룹웨어 방식). 휴지통 안에서는 영구삭제 API 를 쓴다."""
    if body.folder == "trash":
        raise HTTPException(status_code=400, detail="휴지통의 메일은 영구 삭제로 처리합니다.")
    await _with_mailbox(address, lambda c: _move(c, body.uids, _FOLDERS["trash"]), folder=body.folder, readonly=False)
    await audit(db, session, request, "MAILBOX_DELETE", "mailbox", address, {"folder": body.folder, "uids": body.uids})
    await db.commit()


@router.post("/{address}/messages/restore", status_code=204)
async def restore_from_trash(
    address: str,
    body: UidsIn,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    """휴지통 → INBOX. IMAP 은 원래 폴더를 기억하지 않는다 — 그룹웨어도 기록이 없으면 INBOX 로 복구한다."""
    await _with_mailbox(address, lambda c: _move(c, body.uids, _FOLDERS["inbox"]), folder="trash", readonly=False)
    await audit(db, session, request, "MAILBOX_RESTORE", "mailbox", address, {"uids": body.uids})
    await db.commit()


@router.post("/{address}/messages/purge", response_model=PurgeOut)
async def purge_messages(
    address: str,
    body: UidsIn,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    """휴지통 안의 선택 메일 영구 삭제 (\\Deleted + UID EXPUNGE). 되돌릴 수 없다 — 화면에서 확인을 받는다."""

    def run(conn: imaplib.IMAP4_SSL) -> int:
        uidset = _uidset(body.uids)
        conn.uid("STORE", uidset, "+FLAGS.SILENT", "(\\Deleted)")
        typ, _data = conn.uid("EXPUNGE", uidset)  # UIDPLUS — Dovecot 지원. 미지원이면 폴더 전체 EXPUNGE 로 대체.
        if typ != "OK":
            conn.expunge()
        return len(set(body.uids))

    purged = await _with_mailbox(address, run, folder="trash", readonly=False)
    await audit(db, session, request, "MAILBOX_PURGE", "mailbox", address, {"uids": body.uids})
    await db.commit()
    return PurgeOut(purged=purged)


@router.post("/{address}/trash/empty", response_model=PurgeOut)
async def empty_trash(
    address: str,
    request: Request,
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    def run(conn: imaplib.IMAP4_SSL) -> int:
        count = _select(conn, _FOLDERS["trash"], readonly=False)
        if count > 0:
            conn.store("1:*", "+FLAGS.SILENT", "(\\Deleted)")
            conn.expunge()
        return count

    purged = await _with_mailbox(address, run, folder=None)
    await audit(db, session, request, "MAILBOX_PURGE", "mailbox", address, {"all": True, "count": purged})
    await db.commit()
    return PurgeOut(purged=purged)


# ── 발송 ─────────────────────────────────────────────────────────


def _parse_addrs(raw: str) -> list[Address]:
    out: list[Address] = []
    for name, addr in getaddresses([raw or ""]):
        if not addr:
            continue
        if "@" not in addr:
            raise HTTPException(status_code=400, detail=f"잘못된 메일 주소: {addr}")
        try:
            out.append(Address(name, addr_spec=addr))
        except ValueError as e:
            raise HTTPException(status_code=400, detail=f"잘못된 메일 주소: {addr}") from e
    return out


def _text_to_html(text: str) -> str:
    return html_lib.escape(text).replace("\n", "<br>")


def _html_to_text(src: str) -> str:
    """원문이 HTML 뿐일 때의 인용 텍스트 — 태그 제거 수준."""
    s = re.sub(r"(?is)<(script|style)\b[^>]*>.*?</\1\s*>", "", src)
    s = re.sub(r"(?i)<br\s*/?>", "\n", s)
    s = re.sub(r"(?i)</p\s*>", "\n\n", s)
    s = re.sub(r"<[^>]+>", "", s)
    return html_lib.unescape(s).strip()


def _strip_active_html(src: str) -> str:
    for rx in _ACTIVE_HTML:
        src = rx.sub("", src)
    return src


def _quote(mode: str, orig: EmailMessage) -> tuple[str, str]:
    """답장/전달 인용 (text, html). 안내 문구는 수신자 언어를 모르므로 통상 관례인 영어."""
    orig_text, orig_html = _body_parts(orig)
    text_src = (orig_text or (_html_to_text(orig_html) if orig_html else "")).strip()
    html_src = _strip_active_html(orig_html) if orig_html else _text_to_html(text_src)
    sender = _header_str(orig, "From")
    date = _date(orig)
    date_s = date.strftime("%Y-%m-%d %H:%M %z") if date else _header_str(orig, "Date")
    if mode == "forward":
        lines = [
            "---------- Forwarded message ----------",
            f"From: {sender}",
            f"Date: {date_s}",
            f"Subject: {_header_str(orig, 'Subject')}",
            f"To: {_header_str(orig, 'To')}",
        ]
        if orig["Cc"]:
            lines.append(f"Cc: {_header_str(orig, 'Cc')}")
        head = "\n".join(lines)
        return f"\n\n{head}\n\n{text_src}", f"<br><br><div>{_text_to_html(head)}</div><br>{html_src}"
    head = f"On {date_s}, {sender} wrote:"
    quoted = "\n".join(f"> {line}" for line in text_src.splitlines())
    return (
        f"\n\n{head}\n{quoted}",
        f'<br><br><div>{html_lib.escape(head)}</div><blockquote style="{_QUOTE_STYLE}">{html_src}</blockquote>',
    )


def _with_banner(html: str) -> str:
    return _RECEIPT_BANNER + html


def _with_pixel(html: str, token: uuid.UUID) -> str:
    # 수신자별로 서로 다른 토큰 — 한 본문에 픽셀 여러 개를 넣으면 한 명이 열어도 전원이 읽음이 된다(R8).
    return (
        f'{_with_banner(html)}<img src="{BFF_PUBLIC_URL}/mail/r/{token}.gif" width="1" height="1" '
        'style="display:none" alt="">'
    )


def _build_message(
    *,
    sender: Address,
    to: list[Address],
    cc: list[Address],
    subject: str,
    text: str,
    html: str,
    message_id: str,
    in_reply_to: str,
    references: str,
    attachments: list[tuple[str, str, bytes]],
) -> EmailMessage:
    msg = EmailMessage()
    msg["From"] = sender
    msg["To"] = to
    if cc:
        msg["Cc"] = cc
    msg["Subject"] = subject
    msg["Date"] = format_datetime(datetime.now(UTC))
    msg["Message-ID"] = message_id
    if in_reply_to:
        msg["In-Reply-To"] = in_reply_to
    if references:
        msg["References"] = references
    msg.set_content(text)
    msg.add_alternative(html, subtype="html")
    for filename, content_type, data in attachments:
        maintype, _, subtype = content_type.partition("/")
        msg.add_attachment(
            data, maintype=maintype or "application", subtype=subtype or "octet-stream", filename=filename
        )
    return msg


@router.post("/{address}/send", response_model=SendOut)
async def send_message(
    address: str,
    request: Request,
    to: str = Form(""),
    cc: str = Form(""),
    subject: str = Form(""),
    body: str = Form(""),
    mode: Literal["new", "reply", "reply_all", "forward"] = Form("new"),
    orig_folder: FolderKey | None = Form(None),
    orig_uid: int | None = Form(None),
    include_original_attachments: bool = Form(False),
    files: list[UploadFile] = File(default=[]),
    session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    """새 메일 / 답장 / 전체답장 / 전달. 평문 본문 → HTML(+text 대체본), 원문 인용·헤더(In-Reply-To/References)는 서버가 붙인다."""
    password = _password(address)
    smtp_host = os.getenv("ADMIN_MAILBOX_SMTP_HOST")
    if not smtp_host:
        raise HTTPException(status_code=503, detail="메일함 SMTP 호스트가 설정되지 않았습니다.")
    smtp_port = int(os.getenv("ADMIN_MAILBOX_SMTP_PORT") or 587)

    to_list, cc_list = _parse_addrs(to), _parse_addrs(cc)
    if not to_list:
        raise HTTPException(status_code=400, detail="받는사람이 필요합니다.")
    attachments: list[tuple[str, str, bytes]] = [
        (f.filename or "attachment", f.content_type or "application/octet-stream", await f.read()) for f in files
    ]

    text, html = body, f'<div style="white-space:pre-wrap">{_text_to_html(body)}</div>'
    in_reply_to = references = ""
    if orig_uid is not None and orig_folder is not None and mode != "new":
        orig: EmailMessage = await _with_mailbox(address, lambda c: _fetch_message(c, orig_uid), folder=orig_folder)
        q_text, q_html = _quote(mode, orig)
        text, html = text + q_text, html + q_html
        if mode != "forward":
            in_reply_to = _header_str(orig, "Message-ID")
            references = f"{_header_str(orig, 'References')} {in_reply_to}".strip()
        if mode == "forward" and include_original_attachments:
            attachments += [
                (part.get_filename() or f"attachment-{i}", part.get_content_type(), _attachment_bytes(part))
                for i, part in enumerate(orig.iter_attachments())
            ]

    sender = Address(os.getenv("ADMIN_MAILBOX_FROM_NAME", ""), addr_spec=address)
    message_id = f"<{uuid.uuid4()}@{address.rsplit('@', 1)[-1]}>"
    # R8 — To/Cc 수신자별 토큰. 같은 주소가 두 번 있으면 한 번만.
    tokens: dict[str, uuid.UUID] = {}
    for a in to_list + cc_list:
        tokens.setdefault(a.addr_spec.lower(), uuid.uuid4())
    sent_at = datetime.now(UTC)
    for rcpt, token in tokens.items():
        db.add(
            AdminMailReadReceipt(
                message_id=message_id,
                mailbox=address,
                recipient_email=rcpt,
                token=token,
                subject=subject or None,
                sent_at=sent_at,
            )
        )

    def build(html_body: str) -> EmailMessage:
        return _build_message(
            sender=sender,
            to=to_list,
            cc=cc_list,
            subject=subject,
            text=text,
            html=html_body,
            message_id=message_id,
            in_reply_to=in_reply_to,
            references=references,
            attachments=attachments,
        )

    def run(conn: imaplib.IMAP4_SSL) -> None:
        try:
            with smtplib.SMTP(smtp_host, smtp_port, timeout=30) as smtp:
                smtp.starttls(context=ssl.create_default_context())
                smtp.login(address, password)
                for rcpt, token in tokens.items():
                    smtp.sendmail(address, [rcpt], build(_with_pixel(html, token)).as_bytes())
        except (smtplib.SMTPException, OSError) as e:
            raise HTTPException(status_code=502, detail=f"메일 발송 실패: {e}") from e
        # 보낸메일함 사본 — 픽셀 없이 배너만(R7 이중 방어), Message-ID 는 공유.
        with contextlib.suppress(imaplib.IMAP4.error):
            conn.create(_FOLDERS["sent"])
        typ, _data = conn.append(
            _FOLDERS["sent"], "(\\Seen)", imaplib.Time2Internaldate(time.time()), build(_with_banner(html)).as_bytes()
        )
        if typ != "OK":
            raise HTTPException(status_code=502, detail="메일은 발송됐지만 보낸메일함 사본 저장에 실패했습니다.")
        if orig_uid is not None and orig_folder is not None and mode in ("reply", "reply_all"):
            with contextlib.suppress(imaplib.IMAP4.error, HTTPException):
                _select(conn, _FOLDERS[orig_folder], readonly=False)
                conn.uid("STORE", str(orig_uid), "+FLAGS.SILENT", "(\\Answered)")

    await _with_mailbox(address, run, folder=None)
    await audit(
        db,
        session,
        request,
        "MAILBOX_SEND",
        "mailbox",
        address,
        {
            "mode": mode,
            "to": [a.addr_spec for a in to_list],
            "cc": [a.addr_spec for a in cc_list],
            "subject": subject,
            "message_id": message_id,
            "orig_folder": orig_folder,
            "orig_uid": orig_uid,
            "attachments": len(attachments),
        },
    )
    await db.commit()
    return SendOut(message_id=message_id)


# ── 수신확인 ──────────────────────────────────────────────────────


@router.get("/{address}/read-receipts", response_model=list[ReadReceiptOut])
async def list_read_receipts(
    address: str,
    message_id: str | None = Query(None),
    limit: int = Query(300, ge=1, le=1000),
    _session: AdminSession = Depends(verify_admin_api),
    db: AsyncSession = Depends(get_db),
):
    """메일함 단위 수신확인 목록(최신순). message_id 를 주면 그 발송 건(보낸메일함 상세 배지)만."""
    _password(address)
    stmt = select(AdminMailReadReceipt).where(AdminMailReadReceipt.mailbox == address)
    if message_id:
        stmt = stmt.where(AdminMailReadReceipt.message_id == message_id)
    stmt = stmt.order_by(AdminMailReadReceipt.sent_at.desc(), AdminMailReadReceipt.id.desc()).limit(limit)
    rows = (await db.execute(stmt)).scalars().all()
    return [
        ReadReceiptOut(
            id=r.id,
            message_id=r.message_id,
            recipient_email=r.recipient_email,
            subject=r.subject,
            sent_at=r.sent_at,
            first_opened_at=r.first_opened_at,
            open_count=r.open_count,
        )
        for r in rows
    ]
