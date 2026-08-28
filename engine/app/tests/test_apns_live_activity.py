"""APNs Live Activity 전송 — 오류 분류 계약 (ai-docs/task/active/260829_live_activity_task.md Phase 3).
410/BadDeviceToken → 토큰 무효(호출부 삭제), 429/5xx → 재시도, 그 외 → 영구 실패. 미설정이면 영구 실패."""

import httpx
import pytest

from app.services import apns_push
from app.services.fcm_push import InvalidPushTokenError, PermanentPushError, RetryablePushError

STATE = {"statusText": "약속 확정", "statusKind": "accepted", "placeName": "", "appointmentAtMs": 0, "peerDistanceText": ""}


def _configure(monkeypatch):
    monkeypatch.setattr(apns_push.settings, "apns_key_id", "KEYID12345")
    monkeypatch.setattr(apns_push.settings, "apns_team_id", "TEAMID1234")
    monkeypatch.setattr(apns_push, "_provider_token", lambda: "jwt")


def _post_returning(status, body=""):
    captured = {}

    async def post(self, url, **kwargs):
        captured["url"] = url
        captured["headers"] = kwargs.get("headers", {})
        captured["json"] = kwargs.get("json")
        return httpx.Response(status, request=httpx.Request("POST", url), text=body)

    return post, captured


@pytest.mark.asyncio
async def test_unconfigured_is_permanent(monkeypatch):
    monkeypatch.setattr(apns_push.settings, "apns_key_id", "")
    with pytest.raises(PermanentPushError):
        await apns_push.send_live_activity(push_token="t", event="update", content_state=STATE)


@pytest.mark.asyncio
async def test_success_sends_liveactivity_headers_and_aps(monkeypatch):
    _configure(monkeypatch)
    post, captured = _post_returning(200)
    monkeypatch.setattr(httpx.AsyncClient, "post", post)
    await apns_push.send_live_activity(
        push_token="abc", event="end", content_state=STATE, dismissal_date=123, stale_date=456
    )
    assert captured["url"].endswith("/3/device/abc")
    assert captured["headers"]["apns-push-type"] == "liveactivity"
    assert captured["headers"]["apns-topic"].endswith(".push-type.liveactivity")
    aps = captured["json"]["aps"]
    assert aps["event"] == "end" and aps["content-state"] == STATE
    assert aps["dismissal-date"] == 123 and aps["stale-date"] == 456 and "timestamp" in aps


@pytest.mark.asyncio
@pytest.mark.parametrize("status,body", [(410, '{"reason":"Unregistered"}'), (400, '{"reason":"BadDeviceToken"}')])
async def test_invalid_token(monkeypatch, status, body):
    _configure(monkeypatch)
    monkeypatch.setattr(httpx.AsyncClient, "post", _post_returning(status, body)[0])
    with pytest.raises(InvalidPushTokenError):
        await apns_push.send_live_activity(push_token="t", event="update", content_state=STATE)


@pytest.mark.asyncio
@pytest.mark.parametrize("status", [429, 500, 503])
async def test_retryable(monkeypatch, status):
    _configure(monkeypatch)
    monkeypatch.setattr(httpx.AsyncClient, "post", _post_returning(status)[0])
    with pytest.raises(RetryablePushError):
        await apns_push.send_live_activity(push_token="t", event="update", content_state=STATE)


@pytest.mark.asyncio
async def test_invalid_event_is_permanent(monkeypatch):
    _configure(monkeypatch)
    with pytest.raises(PermanentPushError):
        await apns_push.send_live_activity(push_token="t", event="start", content_state=STATE)
