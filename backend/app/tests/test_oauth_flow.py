import unittest
import uuid
from unittest.mock import AsyncMock, patch

from app.routers import auth
from app.services import oauth_flow


class _FakeRedis:
    def __init__(self):
        self.values: dict[str, str] = {}
        self.set_calls: list[tuple[str, int, bool]] = []

    async def set(self, key: str, value: str, *, ex: int, nx: bool):
        self.set_calls.append((key, ex, nx))
        if nx and key in self.values:
            return False
        self.values[key] = value
        return True

    async def getdel(self, key: str):
        return self.values.pop(key, None)


class OAuthFlowStoreTest(unittest.IsolatedAsyncioTestCase):
    async def asyncSetUp(self):
        self.redis = _FakeRedis()
        self.client_patch = patch.object(oauth_flow, "get_client", AsyncMock(return_value=self.redis))
        self.client_patch.start()

    async def asyncTearDown(self):
        self.client_patch.stop()

    async def test_state_is_shared_ttl_bound_and_single_use(self):
        state = await oauth_flow.issue_oauth_state("pkce-verifier")

        self.assertEqual(self.redis.set_calls[-1][1:], (oauth_flow.STATE_TTL_SECONDS, True))
        self.assertEqual(await oauth_flow.consume_oauth_state(state), (True, "pkce-verifier"))
        self.assertEqual(await oauth_flow.consume_oauth_state(state), (False, None))

    async def test_exchange_code_is_ttl_bound_and_single_use(self):
        user_id = str(uuid.uuid4())
        code = await oauth_flow.issue_oauth_exchange(user_id, True)

        self.assertEqual(self.redis.set_calls[-1][1:], (oauth_flow.EXCHANGE_TTL_SECONDS, True))
        payload = await oauth_flow.consume_oauth_exchange(code)
        self.assertIsNotNone(payload)
        self.assertEqual(payload.user_id, user_id)
        self.assertTrue(payload.is_new)
        self.assertIsNone(await oauth_flow.consume_oauth_exchange(code))


class OAuthRedirectTest(unittest.IsolatedAsyncioTestCase):
    async def test_redirect_contains_only_one_time_code(self):
        user_id = uuid.uuid4()
        with patch.object(auth, "issue_oauth_exchange", AsyncMock(return_value="once-only")):
            response = await auth._redirect_with_exchange("com.saigonrider.user://oauth/callback", user_id, False)

        location = response.headers["location"]
        self.assertEqual(location, "com.saigonrider.user://oauth/callback?code=once-only")
        self.assertNotIn("sessionToken", location)
        self.assertNotIn(str(user_id), location)
