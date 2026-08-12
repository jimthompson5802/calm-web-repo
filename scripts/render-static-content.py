#!/usr/bin/env python3

from __future__ import annotations

import shutil
from pathlib import Path

from detect_public_host import detect_public_host


LOCALHOST_ORIGIN = "https://localhost:8443"


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    source_dir = repo_root / "static"
    output_dir = repo_root / "infra" / "nginx" / "rendered-static"
    public_origin = f"https://{detect_public_host()}:8443"

    if output_dir.exists():
        shutil.rmtree(output_dir)

    shutil.copytree(source_dir, output_dir)

    for json_path in output_dir.rglob("*.json"):
        content = json_path.read_text(encoding="utf-8")
        rendered = content.replace(LOCALHOST_ORIGIN, public_origin)
        if rendered != content:
            json_path.write_text(rendered, encoding="utf-8")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
