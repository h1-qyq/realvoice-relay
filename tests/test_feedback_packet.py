import importlib.util
import json
from pathlib import Path
import tempfile
import unittest


ROOT = Path(__file__).resolve().parents[1]
MODULE_PATH = ROOT / "realvoice-relay" / "scripts" / "build_feedback_packet.py"


def load_module():
    spec = importlib.util.spec_from_file_location("build_feedback_packet", MODULE_PATH)
    module = importlib.util.module_from_spec(spec)
    assert spec.loader
    spec.loader.exec_module(module)
    return module


def sample_input():
    return {
        "platform": "示例出行",
        "product_area": "消息设置",
        "raw_feedback": "我账号是13800138000，司机总发推销，真的很烦。",
        "claims": [
            {
                "type": "user_experience",
                "text": "用户在订单后收到司机推销消息",
                "evidence": ["screenshot-01"],
            },
            {
                "type": "model_inference",
                "text": "可能缺少营销消息偏好设置",
                "evidence": [],
            },
        ],
        "sentiment": {"intensity": 4, "satisfaction": 2, "confidence": "medium"},
        "recommendations": [
            {
                "horizon": "now",
                "action": "增加一键屏蔽非行程消息",
                "acceptance": "用户启用后不再收到营销类消息",
            }
        ],
    }


class FeedbackPacketTests(unittest.TestCase):
    def test_packet_labels_satisfaction_as_model_estimate(self):
        packet = load_module().build_feedback_packet(sample_input())
        self.assertEqual(packet["sentiment"]["satisfaction_kind"], "model_estimate")
        self.assertEqual(packet["sentiment"]["confidence"], "medium")

    def test_packet_redacts_sensitive_values_from_excerpt(self):
        data = sample_input()
        data["raw_feedback"] += " 身份证110101199001011234，邮箱user@example.com。"
        packet = load_module().build_feedback_packet(data)
        excerpt = packet["authentic_voice_excerpt"]
        self.assertNotIn("13800138000", excerpt)
        self.assertNotIn("110101199001011234", excerpt)
        self.assertNotIn("user@example.com", excerpt)
        self.assertIn("[手机号已脱敏]", excerpt)

    def test_rejects_unknown_claim_type(self):
        data = sample_input()
        data["claims"][0]["type"] = "proven_by_ai"
        with self.assertRaises(ValueError):
            load_module().build_feedback_packet(data)

    def test_requires_platform_and_raw_feedback(self):
        data = sample_input()
        data["platform"] = " "
        with self.assertRaises(ValueError):
            load_module().build_feedback_packet(data)

    def test_cli_writes_json(self):
        module = load_module()
        with tempfile.TemporaryDirectory() as temp_dir:
            source = Path(temp_dir) / "input.json"
            target = Path(temp_dir) / "output.json"
            source.write_text(json.dumps(sample_input(), ensure_ascii=False), encoding="utf-8")
            result = module.main([str(source), "--output", str(target)])
            self.assertEqual(result, 0)
            packet = json.loads(target.read_text(encoding="utf-8"))
            self.assertEqual(packet["schema_version"], "1.0")


if __name__ == "__main__":
    unittest.main()

