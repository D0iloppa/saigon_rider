"""경계 고정 테스트 (260907_toss_payment_rail_design.md §5-4/§8 P2-8).

절대 지켜야 할 두 경계를 소스 그렙으로 고정한다:
1. 토스 2키(`AD_PAYMENT_TOSS_*`)를 읽는 프로덕션 코드는 `services/ad_payments/config.py` 하나뿐
   이어야 한다 — 다른 파일에서 이 env 를 직접 읽으면 "운영 키를 받았을 때 바뀌는 파일 0개"(§5-4)
   증명이 깨진다. `app/tests/` 는 `patch.dict(os.environ, ...)` 로 값을 주입하는 정상 사용이라
   제외한다(기존 관례 — AD_PAYMENT_BANK_* 도 config.py 외 4개 테스트 파일에서 참조한다).
2. 어댑터(`rails/*.py`)·코어 checkout 모듈이 `ad.paid_until` 을 직접 대입하면 안 된다 — 쓰기
   주체는 `contracts.approve()` 단일(service-rules.md §광고노출 6 불변식). `rails/` 안에서
   `approve(` 를 호출해도 안 된다(승인은 어댑터가 아니라 checkout.py 코어가 한다, §3-6).

리포지토리 루트 파일(`.env.example`·`docker-compose.yml`)은 이 컨테이너의 바인드 마운트
(`./backend:/app`)가 리포 루트를 포함하지 않아 이 테스트에서 직접 그렙할 수 없다 — 그 두 파일의
"AD_PAYMENT_TOSS 세 파일 중 하나" 여부는 배포/리뷰 시점에 호스트에서 `grep -rn AD_PAYMENT_TOSS
backend/ .env.example docker-compose.yml` 로 수동 확인한다(완료 보고서에 실제 출력 포함).
"""

import ast
import re
import unittest
from pathlib import Path

_APP_ROOT = Path(__file__).resolve().parents[1]  # backend/app


def _iter_source_files():
    for path in _APP_ROOT.rglob("*.py"):
        if "/tests/" in path.as_posix() or "__pycache__" in path.as_posix():
            continue
        yield path


class TossEnvBoundaryTests(unittest.TestCase):
    def test_ad_payment_toss_env_read_only_in_config_py(self):
        offenders = []
        for path in _iter_source_files():
            text = path.read_text(encoding="utf-8")
            if "AD_PAYMENT_TOSS" in text:
                rel = path.relative_to(_APP_ROOT.parent)
                if rel.as_posix() != "app/services/ad_payments/config.py":
                    offenders.append(rel.as_posix())
        self.assertEqual(offenders, [], f"AD_PAYMENT_TOSS 를 config.py 밖에서 참조: {offenders}")


class PaidUntilWriteBoundaryTests(unittest.TestCase):
    _ASSIGN_RE = re.compile(r"\.paid_until\s*=[^=]")

    def test_rails_and_checkout_never_assign_paid_until(self):
        offenders = []
        rails_dir = _APP_ROOT / "services" / "ad_payments" / "rails"
        checkout_py = _APP_ROOT / "services" / "ad_payments" / "checkout.py"
        candidates = [*rails_dir.rglob("*.py"), checkout_py]
        for path in candidates:
            if "__pycache__" in path.as_posix():
                continue
            text = path.read_text(encoding="utf-8")
            if self._ASSIGN_RE.search(text):
                offenders.append(path.relative_to(_APP_ROOT.parent).as_posix())
        self.assertEqual(offenders, [], f"어댑터/코어가 paid_until 을 직접 대입: {offenders}")

    def test_rails_never_call_contracts_approve(self):
        # rails/ 안에는 "approve(" 문자열이 전혀 나오면 안 된다 — 승인은 checkout.py 코어의
        # 몫(§3-6), 어댑터는 CheckoutResult 만 돌려준다.
        rails_dir = _APP_ROOT / "services" / "ad_payments" / "rails"
        offenders = []
        for path in rails_dir.rglob("*.py"):
            if "__pycache__" in path.as_posix():
                continue
            text = path.read_text(encoding="utf-8")
            if "approve(" in text:
                offenders.append(path.relative_to(_APP_ROOT.parent).as_posix())
        self.assertEqual(offenders, [], f"rails/ 안에서 approve( 호출 흔적: {offenders}")


class MoneyPathLockBoundaryTests(unittest.TestCase):
    """머니 경로의 read-modify-write 는 로우 락 안에서만 — 락 지점을 그렙으로 고정한다.

    동시성 재현 테스트(test_ad_payment_port.py::MoneyPathLockTests)와 별개 층위다: 재현 테스트는
    "지금 결과가 맞다"를, 이 테스트는 "락 자체가 그 자리에 있다"를 지킨다.
    """

    _CORE = _APP_ROOT / "services" / "ad_payments"

    def test_ingest_deposit_locks_contract_row(self):
        text = (self._CORE / "port.py").read_text(encoding="utf-8")
        self.assertIn("with_for_update()", text, "ingest_deposit 이 계약 로우를 잠그지 않는다")

    def test_approve_wrapper_locks_ad_row(self):
        text = (self._CORE / "contracts.py").read_text(encoding="utf-8")
        self.assertIn("async def approve_with_ad_lock", text)
        self.assertIn("with_for_update()", text, "approve_with_ad_lock 이 ad 로우를 잠그지 않는다")

    def test_checkout_confirm_guard_locks_contract_row(self):
        text = (self._CORE / "checkout.py").read_text(encoding="utf-8")
        self.assertIn("async def lock_and_assert_chargeable", text)
        self.assertIn("with_for_update()", text)

    def test_production_code_never_calls_bare_approve(self):
        # 순수 전이함수 approve() 는 락이 없다 — 프로덕션은 approve_with_ad_lock 만 쓴다.
        # 문자열·주석이 아닌 "실제 호출"만 봐야 하므로 그렙이 아니라 AST 로 판정한다.
        offenders = []
        for path in _iter_source_files():
            if path.as_posix().endswith("services/ad_payments/contracts.py"):
                continue
            for node in ast.walk(ast.parse(path.read_text(encoding="utf-8"))):
                if not isinstance(node, ast.Call):
                    continue
                func = node.func
                # `<contracts 모듈 별칭>.approve(...)` 또는 from-import 한 `approve(...)` 만 본다 —
                # 무관한 동명 메서드(AdsApplication().approve)는 제외.
                is_module_call = (
                    isinstance(func, ast.Attribute)
                    and func.attr == "approve"
                    and isinstance(func.value, ast.Name)
                    and func.value.id in ("contracts", "payment_contracts", "contract_fsm")
                )
                is_bare_call = isinstance(func, ast.Name) and func.id == "approve"
                if is_module_call or is_bare_call:
                    offenders.append(f"{path.relative_to(_APP_ROOT.parent).as_posix()}:{node.lineno}")
        self.assertEqual(offenders, [], f"락 없는 approve() 직접 호출: {offenders}")


if __name__ == "__main__":
    unittest.main()
