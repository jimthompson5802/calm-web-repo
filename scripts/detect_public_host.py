#!/usr/bin/env python3

from __future__ import annotations

import os
import socket


def detect_public_host() -> str:
    configured = os.environ.get("CALM_PUBLIC_HOST", "").strip()
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
