#!/usr/bin/env python3

from __future__ import annotations

import json
import os
from pathlib import Path


REQUIRED_KEYS = [
    "OAUTH2_PROXY_CLIENT_SECRET",
    "KEYCLOAK_TEST_USER_USERNAME",
    "KEYCLOAK_TEST_USER_EMAIL",
    "KEYCLOAK_TEST_USER_PASSWORD",
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
    template_path = repo_root / "infra" / "keycloak" / "calm-local-realm.template.json"
    output_dir = repo_root / "infra" / "keycloak" / "import"
    output_path = output_dir / "calm-local-realm.json"

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

    template = template_path.read_text(encoding="utf-8")
    replacements = {
        "__OAUTH2_PROXY_CLIENT_SECRET__": env["OAUTH2_PROXY_CLIENT_SECRET"],
        "__KEYCLOAK_TEST_USER_USERNAME__": env["KEYCLOAK_TEST_USER_USERNAME"],
        "__KEYCLOAK_TEST_USER_EMAIL__": env["KEYCLOAK_TEST_USER_EMAIL"],
        "__KEYCLOAK_TEST_USER_PASSWORD__": env["KEYCLOAK_TEST_USER_PASSWORD"],
    }

    for placeholder, value in replacements.items():
        template = template.replace(placeholder, json.dumps(value)[1:-1])

    rendered = json.loads(template)

    output_dir.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(rendered, indent=2) + "\n", encoding="utf-8")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
