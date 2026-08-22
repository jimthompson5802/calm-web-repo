#!/usr/bin/env python3

from __future__ import annotations

import json
from pathlib import Path

from detect_public_host import detect_public_host


REQUIRED_KEYS = [
    "KEYCLOAK_DIRECT_URL_CLIENT_SECRET",
]


def load_env(env_path: Path) -> dict[str, str]:
    env: dict[str, str] = {}
    for raw_line in env_path.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        key, sep, value = line.partition("=")
        if not sep:
            continue
        env[key.strip()] = value.strip()
    return env


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    env_path = repo_root / ".env"
    output_dir = repo_root / "custom-idp" / "v2" / "generated"
    output_path = output_dir / "direct-url-auth.json"
    cert_path = repo_root / "infra" / "nginx" / "certs" / "localhost.crt"

    if not env_path.exists():
        raise SystemExit(
            "Missing .env. Copy .env.example to .env and set local-only secrets before starting the stack."
        )

    env = load_env(env_path)
    missing = [key for key in REQUIRED_KEYS if not env.get(key)]
    if missing:
        raise SystemExit(
            "Missing required .env values: " + ", ".join(missing)
        )

    public_host = detect_public_host()
    token_url = (
        f"https://{public_host}:8443/keycloak/realms/calm-local/protocol/openid-connect/token"
    )

    output_dir.mkdir(parents=True, exist_ok=True)
    output_path.write_text(
        json.dumps(
            {
                "tokenUrl": token_url,
                "clientId": "calm-direct-url",
                "clientSecret": env["KEYCLOAK_DIRECT_URL_CLIENT_SECRET"],
                "caCertPath": str(cert_path),
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
