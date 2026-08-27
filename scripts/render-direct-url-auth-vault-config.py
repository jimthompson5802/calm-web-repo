#!/usr/bin/env python3

from __future__ import annotations

import json
from pathlib import Path

from detect_public_host import detect_public_host


VAULT_BASE_URL = "http://127.0.0.1:8200"
VAULT_DEV_ROOT_TOKEN = "calm-local-vault-root-token"
VAULT_SECRET_PATH = "secret/data/calm/direct-url"
VAULT_SECRET_FIELD = "clientSecret"


def main() -> int:
    repo_root = Path(__file__).resolve().parents[1]
    output_dir = repo_root / "custom-idp" / "v3" / "generated"
    output_path = output_dir / "direct-url-auth.json"

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
                "vaultUrl": VAULT_BASE_URL,
                "vaultToken": VAULT_DEV_ROOT_TOKEN,
                "vaultSecretPath": VAULT_SECRET_PATH,
                "vaultSecretField": VAULT_SECRET_FIELD,
            },
            indent=2,
        )
        + "\n",
        encoding="utf-8",
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
