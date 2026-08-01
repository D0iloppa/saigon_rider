import os
import unittest
from unittest.mock import AsyncMock, patch

from fastapi.testclient import TestClient

from app.main import app
from app.services.cors import get_allowed_origins


class CorsConfigurationTests(unittest.TestCase):
    def test_configured_origins_are_trimmed(self):
        with patch.dict(os.environ, {"CORS_ALLOWED_ORIGINS": "https://app.example, capacitor://localhost "}):
            self.assertEqual(get_allowed_origins(), ["https://app.example", "capacitor://localhost"])

    def test_wildcard_origin_is_rejected(self):
        with patch.dict(os.environ, {"CORS_ALLOWED_ORIGINS": "*"}), self.assertRaises(RuntimeError):
            get_allowed_origins()

    def test_preflight_only_allows_whitelisted_origin(self):
        client = TestClient(app)
        headers = {"Access-Control-Request-Method": "GET"}

        allowed = client.options("/api/health", headers={**headers, "Origin": "http://localhost:5174"})
        rejected = client.options("/api/health", headers={**headers, "Origin": "https://evil.example"})

        self.assertEqual(allowed.headers.get("access-control-allow-origin"), "http://localhost:5174")
        self.assertNotIn("access-control-allow-origin", rejected.headers)


class SystemHealthTests(unittest.TestCase):
    def test_health_is_liveness(self):
        response = TestClient(app).get("/api/health")

        self.assertEqual(response.status_code, 200)
        self.assertEqual(response.json(), {"status": "ok"})

    def test_ready_reports_dependency_failure(self):
        with patch("app.readiness.check_readiness", new=AsyncMock(side_effect=RuntimeError("db unavailable"))):
            response = TestClient(app).get("/api/ready")

        self.assertEqual(response.status_code, 503)
        self.assertEqual(response.json(), {"status": "not_ready"})
