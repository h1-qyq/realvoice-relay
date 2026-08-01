import importlib.util
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "realvoice-relay" / "scripts" / "check_activation.py"


def load_module():
    spec = importlib.util.spec_from_file_location("check_activation", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


class ActivationClientTests(unittest.TestCase):
    def test_missing_receipt_is_inactive_without_endpoint(self):
        result = load_module().check_activation(
            agent_id="agent-1", receipt=None, endpoint=None
        )
        self.assertFalse(result.active)
        self.assertEqual(result.reason, "receipt_missing")

    def test_verify_endpoint_can_confirm_active_receipt(self):
        module = load_module()
        response = module.ActivationResult(True, "active", {"skill": "realvoice-relay"})
        with patch.object(module, "_verify_remote", return_value=response):
            result = module.check_activation(
                agent_id="agent-1",
                receipt="payload.signature",
                endpoint="https://license.example",
            )
        self.assertTrue(result.active)

    def test_unreachable_endpoint_is_not_reported_as_unpaid(self):
        module = load_module()
        with patch.object(
            module, "_verify_remote", side_effect=OSError("network unavailable")
        ):
            result = module.check_activation(
                agent_id="agent-1",
                receipt="payload.signature",
                endpoint="https://license.example",
            )
        self.assertFalse(result.active)
        self.assertEqual(result.reason, "verification_unreachable")

    def test_cli_reads_receipt_file(self):
        module = load_module()
        with tempfile.TemporaryDirectory() as temp_dir:
            receipt_path = Path(temp_dir) / "receipt.txt"
            receipt_path.write_text("payload.signature", encoding="utf-8")
            with patch.object(
                module,
                "check_activation",
                return_value=module.ActivationResult(True, "active", {}),
            ):
                exit_code = module.main(
                    ["--agent-id", "agent-1", "--receipt-file", str(receipt_path)]
                )
        self.assertEqual(exit_code, 0)


if __name__ == "__main__":
    unittest.main()

