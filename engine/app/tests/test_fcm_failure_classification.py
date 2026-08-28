import httpx
import pytest

from app.services import fcm_push


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [401, 403, 429, 500, 503])
async def test_retryable_fcm_statuses(monkeypatch, status):
    monkeypatch.setattr(fcm_push, "_load_credentials", lambda: {"project_id": "test"})
    monkeypatch.setattr(fcm_push, "_get_access_token", lambda: _token())
    monkeypatch.setattr(httpx.AsyncClient, "post", _post_returning(status))
    with pytest.raises(fcm_push.RetryablePushError):
        await fcm_push._send_single(fcm_token="token", title="t", body="b", badge=1)


@pytest.mark.asyncio
async def test_apns_credential_error_is_permanent(monkeypatch):
    """401 THIRD_PARTY_AUTH_ERROR(Invalid APNs credential) 는 콘솔 설정 문제 — 재시도 대상이 아니다.
    재시도 가능으로 두면 워커가 수신자마다 5회 재호출 후 DLQ 에 쌓는다(2026-08-28 실측)."""
    monkeypatch.setattr(fcm_push, "_load_credentials", lambda: {"project_id": "test"})
    monkeypatch.setattr(fcm_push, "_get_access_token", lambda: _token())
    body = (
        '{"error":{"code":401,"message":"Invalid APNs credential.","status":"UNAUTHENTICATED",'
        '"details":[{"@type":"type.googleapis.com/google.firebase.fcm.v1.FcmError","errorCode":"THIRD_PARTY_AUTH_ERROR"}]}}'
    )
    monkeypatch.setattr(httpx.AsyncClient, "post", _post_returning(401, body))
    with pytest.raises(fcm_push.PermanentPushError):
        await fcm_push._send_single(fcm_token="token", title="t", body="b", badge=1)


@pytest.mark.asyncio
async def test_permanent_fcm_4xx(monkeypatch):
    monkeypatch.setattr(fcm_push, "_load_credentials", lambda: {"project_id": "test"})
    monkeypatch.setattr(fcm_push, "_get_access_token", lambda: _token())
    monkeypatch.setattr(httpx.AsyncClient, "post", _post_returning(400))
    with pytest.raises(fcm_push.PermanentPushError):
        await fcm_push._send_single(fcm_token="token", title="t", body="b", badge=1)


@pytest.mark.asyncio
async def test_404_is_invalid_token(monkeypatch):
    monkeypatch.setattr(fcm_push, "_load_credentials", lambda: {"project_id": "test"})
    monkeypatch.setattr(fcm_push, "_get_access_token", lambda: _token())
    monkeypatch.setattr(httpx.AsyncClient, "post", _post_returning(404))
    with pytest.raises(fcm_push.InvalidPushTokenError):
        await fcm_push._send_single(fcm_token="token", title="t", body="b", badge=1)


async def _token():
    return "access"


def _post_returning(status, text="failure"):
    async def post(self, url, **kwargs):
        return httpx.Response(status, request=httpx.Request("POST", url), text=text)
    return post
