from pathlib import Path
import zipfile


ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "realvoice-relay"
TARGET = ROOT / "realvoice-relay-skill.zip"
SKIP_PARTS = {"node_modules", "__pycache__"}
TEXT_SUFFIXES = {".md", ".mjs", ".json", ".py", ".yaml", ".yml", ".txt"}


def build() -> None:
    files = sorted(
        (
            path for path in SOURCE.rglob("*")
            if path.is_file()
            and not SKIP_PARTS.intersection(path.relative_to(SOURCE).parts)
            and path.suffix != ".pyc"
        ),
        key=lambda path: path.relative_to(SOURCE).as_posix(),
    )
    with zipfile.ZipFile(TARGET, "w", compression=zipfile.ZIP_DEFLATED) as archive:
        for path in files:
            name = (Path(SOURCE.name) / path.relative_to(SOURCE)).as_posix()
            info = zipfile.ZipInfo(name, date_time=(2026, 1, 1, 0, 0, 0))
            info.compress_type = zipfile.ZIP_DEFLATED
            info.external_attr = (0o755 if path.suffix in {".py", ".mjs"} else 0o644) << 16
            content = path.read_bytes()
            if path.suffix.lower() in TEXT_SUFFIXES:
                content = content.replace(b"\r\n", b"\n").replace(b"\r", b"\n")
            archive.writestr(info, content)


if __name__ == "__main__":
    build()
