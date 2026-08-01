from pathlib import Path
import unittest


ROOT = Path(__file__).resolve().parents[1]
SKILL = ROOT / "realvoice-relay" / "SKILL.md"
REFERENCES = ROOT / "realvoice-relay" / "references"


class SkillContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.text = SKILL.read_text(encoding="utf-8")

    def test_requires_verified_first_party_destination(self):
        self.assertIn("第一方", self.text)
        self.assertIn("不猜测", self.text)
        self.assertIn("渠道评分", self.text)

    def test_requires_preview_and_explicit_confirmation(self):
        self.assertIn("发送前确认", self.text)
        self.assertIn("最终目的地", self.text)
        self.assertIn("最终正文", self.text)
        self.assertIn("明确确认", self.text)

    def test_separates_claims_and_estimates(self):
        for phrase in (
            "用户亲历",
            "已核实事实",
            "待核实",
            "模型推断",
            "满意倾向估计",
            "置信度",
        ):
            self.assertIn(phrase, self.text)

    def test_protects_sensitive_information(self):
        self.assertIn("脱敏", self.text)
        self.assertIn("身份证", self.text)
        self.assertIn("助记词", self.text)
        self.assertIn("API Key", self.text)

    def test_contains_authenticity_statement_and_no_group_impersonation(self):
        self.assertIn("真实性声明", self.text)
        self.assertIn("不冒充群体", self.text)

    def test_activation_and_agent_email_are_first_class_steps(self):
        self.assertIn("0.01", self.text)
        self.assertIn("AgentMail", self.text)
        self.assertIn("agentmail.to", (REFERENCES / "agent-email.md").read_text(encoding="utf-8"))

    def test_activation_documents_idempotent_payment_binding(self):
        activation = (REFERENCES / "activation.md").read_text(encoding="utf-8")
        self.assertIn("Payment Identifier", activation)
        self.assertIn("Idempotency-Key", activation)
        self.assertIn("SHA-256", activation)
        self.assertIn("结算成功", activation)
        self.assertIn("不回传既有回执", activation)

    def test_skill_ships_wallet_injected_activation_client(self):
        client = ROOT / "realvoice-relay" / "scripts" / "activate_with_wallet.mjs"
        package = ROOT / "realvoice-relay" / "package.json"
        self.assertTrue(client.is_file())
        self.assertTrue(package.is_file())
        activation = (REFERENCES / "activation.md").read_text(encoding="utf-8")
        self.assertIn("activate_with_wallet.mjs", activation)
        self.assertIn("不接收私钥", activation)

    def test_tagged_release_workflow_publishes_skill_archive(self):
        workflow = (ROOT / ".github" / "workflows" / "release.yml").read_text(
            encoding="utf-8"
        )
        self.assertIn("tags:", workflow)
        self.assertIn("realvoice-relay-skill.zip", workflow)
        self.assertIn("SHA256SUMS.txt", workflow)

    def test_all_linked_references_exist(self):
        expected = {
            "channel-verification.md",
            "feedback-format.md",
            "privacy-and-safety.md",
            "agent-email.md",
            "activation.md",
            "enterprise-mode.md",
        }
        actual = {path.name for path in REFERENCES.glob("*.md")}
        self.assertTrue(expected.issubset(actual))


if __name__ == "__main__":
    unittest.main()

