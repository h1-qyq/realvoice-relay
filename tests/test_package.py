from pathlib import Path
import unittest
import zipfile


ROOT = Path(__file__).resolve().parents[1]
PACKAGE = ROOT / "realvoice-relay-skill.zip"


class InstallablePackageTests(unittest.TestCase):
    def test_ui_metadata_is_valid_utf8_and_human_readable(self):
        metadata = (ROOT / "realvoice-relay" / "agents" / "openai.yaml").read_text(
            encoding="utf-8"
        )
        self.assertIn('display_name: "RealVoice Relay · 真声直达"', metadata)
        self.assertIn("把真实用户意见转成", metadata)
        for mojibake_marker in ("Õæ", "����", "¡¤"):
            self.assertNotIn(mojibake_marker, metadata)

    def test_package_contains_required_skill_files(self):
        with zipfile.ZipFile(PACKAGE) as archive:
            names = set(archive.namelist())
        required = {
            "realvoice-relay/SKILL.md",
            "realvoice-relay/agents/openai.yaml",
            "realvoice-relay/scripts/build_feedback_packet.py",
            "realvoice-relay/scripts/check_activation.py",
            "realvoice-relay/scripts/activate_with_wallet.mjs",
            "realvoice-relay/package.json",
            "realvoice-relay/package-lock.json",
        }
        self.assertTrue(required.issubset(names))

    def test_package_contains_no_python_runtime_cache(self):
        with zipfile.ZipFile(PACKAGE) as archive:
            names = archive.namelist()
        self.assertFalse(
            any(
                "__pycache__" in name
                or name.endswith(".pyc")
                or "/node_modules/" in name
                for name in names
            )
        )

    def test_package_matches_current_skill_source(self):
        with zipfile.ZipFile(PACKAGE) as archive:
            for relative in (
                Path("agents/openai.yaml"),
                Path("references/activation.md"),
                Path("SKILL.md"),
            ):
                archived = archive.read(
                    (Path("realvoice-relay") / relative).as_posix()
                )
                source = (ROOT / "realvoice-relay" / relative).read_bytes()
                self.assertEqual(archived, source, f"stale archive member: {relative}")

    def test_package_is_scoped_to_one_skill_directory(self):
        with zipfile.ZipFile(PACKAGE) as archive:
            names = archive.namelist()
        self.assertTrue(names)
        self.assertTrue(all(name.startswith("realvoice-relay/") for name in names))


if __name__ == "__main__":
    unittest.main()
