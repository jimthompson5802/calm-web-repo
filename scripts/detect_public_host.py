#!/usr/bin/env python3

from __future__ import annotations

import os
import socket
from pathlib import Path


def load_env_public_host() -> str:
    repo_root = Path(__file__).resolve().parents[1]
    env_path = repo_root / ".env"
    if not env_path.exists():
        return ""

    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue

        key, sep, value = line.partition("=")
        if sep and key.strip() == "CALM_PUBLIC_HOST":
            return value.strip()

    return ""


def detect_public_host() -> str:
    configured = os.environ.get("CALM_PUBLIC_HOST", "").strip()
    if configured:
        return configured

    configured = load_env_public_host()
    if configured:
        return configured

    probe = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        probe.connect(("8.8.8.8", 80))
        host = probe.getsockname()[0]
    except OSError:
        host = "localhost"
    finally:
        probe.close()

    return host or "localhost"


if __name__ == "__main__":
    print(detect_public_host())
