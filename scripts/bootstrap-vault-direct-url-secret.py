#!/usr/bin/env python3

from __future__ import annotations

import json
import time
from pathlib import Path
from urllib import error, request


REQUIRED_KEYS = [
    "KEYCLOAK_DIRECT_URL_CLIENT_SECRET",
]

VAULT_BASE_URL = "http://127.0.0.1:8200"
VAULT_DEV_ROOT_TOKEN = "calm-local-vault-root-token"
VAULT_SECRET_PATH = "secret/data/calm/direct-url"


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


def wait_for_vault() -> None:
    health_url = f"{VAULT_BASE_URL}/v1/sys/health"
    last_error: Exception | None = None
    for _ in range(30):
        try:
            with request.urlopen(health_url, timeout=2) as response:
                if response.status in (200, 429, 472, 473):
                    return
        except Exception as err:  # noqa: BLE001
            last_error = err
            time.sleep(1)
            continue
        time.sleep(1)

    raise SystemExit(f"Vault did not become ready at {health_url}: {last_error}")


def write_secret(client_secret: str) -> None:
    payload = json.dumps({"data": {"clientSecret": client_secret}}).encode("utf-8")
    secret_url = f"{VAULT_BASE_URL}/v1/{VAULT_SECRET_PATH}"
    req = request.Request(
        secret_url,
        data=payload,
        method="POST",
        headers={
            "content-type": "application/json",
            "x-vault-token": VAULT_DEV_ROOT_TOKEN,
        },
    )
    try:
        with request.urlopen(req, timeout=5) as response:
            if response.status < 200 or response.status >= 300:
                raise SystemExit(
                    f"Vault secret bootstrap failed for {secret_url}: {response.status}"
                )
    except error.HTTPError as err:
        raise SystemExit(
            f"Vault secret bootstrap failed for {secret_url}: {err.code} {err.reason}"
        ) from err
    except error.URLError as err:
        raise SystemExit(
            f"Vault secret bootstrap failed for {secret_url}: {err.reason}"
        ) from err


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    env_path = repo_root / ".env"

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

    wait_for_vault()
    write_secret(env["KEYCLOAK_DIRECT_URL_CLIENT_SECRET"])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
