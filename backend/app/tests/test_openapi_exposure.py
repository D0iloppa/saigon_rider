"""운영에서 OpenAPI 스펙·Swagger UI·ReDoc 이 무인증 공개되지 않는지 (2026-08-02).

배경: 게이트 6 외부 검증에서 운영 `https://app.saigon-rider.com` 의
`/api/bff/openapi.json`·`/api/bff/docs`·`/api/bff/redoc` 이 전부 **무인증 200** 으로
전체 API 표면(엔드포인트·파라미터·모델)을 노출하고 있었다. FastAPI 기본 docs 는
껐지만(`docs_url`/`redoc_url=None`) 커스텀 라우트와 `openapi_url` 이 무조건
등록돼 있어 소용이 없었다.

판정은 **fail-safe 화이트리스트**다 — APP_ENV 미설정·오타면 닫힌다. 이 테스트는
그 방향(닫히는 쪽)이 깨지지 않는지를 지킨다.

app 은 import 시점에 라우트가 확정되므로, 환경별 판정을 보려면 모듈을 다시
import 해야 한다(`importlib.reload`).
"""

import importlib
import os
import unittest
from unittest.mock import patch

_DOC_PATHS = {"/api/openapi.json", "/api/docs", "/api/redoc"}


def _doc_routes_for(app_env: str | None) -> set[str]:
    """APP_ENV 를 주고 app 을 다시 만들었을 때 노출되는 문서 경로 집합."""
    env = {} if app_env is None else {"APP_ENV": app_env}
    with patch.dict(os.environ, env, clear=False):
        if app_env is None:
            os.environ.pop("APP_ENV", None)
        main = importlib.reload(importlib.import_module("app.main"))
        paths = {getattr(r, "path", None) for r in main.app.routes}
        if main.app.openapi_url:
            paths.add(main.app.openapi_url)
        return _DOC_PATHS & paths


class OpenApiExposureTest(unittest.TestCase):
    def test_production_hides_all_doc_surfaces(self):
        self.assertEqual(_doc_routes_for("production"), set())

    def test_unset_app_env_hides_docs(self):
        """미설정이면 닫힌다 — fail-open('production 아니면 dev')이면 여기서 열린다."""
        self.assertEqual(_doc_routes_for(None), set())

    def test_typo_app_env_hides_docs(self):
        """오타(예: 'Productoin')여도 닫힌다 — 화이트리스트 판정의 핵심."""
        self.assertEqual(_doc_routes_for("Productoin"), set())

    def test_development_still_serves_docs(self):
        """dev 에서는 그대로 제공돼야 한다(개발 편의를 죽이지 않는다)."""
        self.assertEqual(_doc_routes_for("development"), _DOC_PATHS)

    @classmethod
    def tearDownClass(cls):
        # 다른 테스트가 import 해 둔 app.main 을 현재 환경 기준으로 되돌린다.
        importlib.reload(importlib.import_module("app.main"))


if __name__ == "__main__":
    unittest.main()
