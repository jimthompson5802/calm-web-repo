# Scripts

Helper scripts for the local `setup-keycloak-web` stack.

## Configure CALM CLI direct URL auth

Run this from the repository root after generating the Vault-backed v3
configuration and building its module:

```sh
make start-webserver-vaulting
(cd custom-idp/v3 && npm run build)
./scripts/calm-init-config.sh
```

The helper runs `calm init-config` to create or update `~/.calm.json` with:

- `your-calm.repo` as the allowed remote host;
- `custom-idp/v3/dist/direct-url-auth.js` as the JSON-backed direct-URL auth
  module;
- `custom-idp/v3/generated/direct-url-auth.json` as that module's
  configuration file; and
- `my-calm.repo,this-calm.repo` as the hosts that require direct-URL
  authentication.

The repository Makefile manages `~/.calm.json` as a scenario-specific
symlink. Do not run this helper when you need to preserve a Makefile-managed
configuration.

## Export the Vault-backed direct-URL config

After `make start-webserver-vaulting` generates
`custom-idp/v3/generated/direct-url-auth.json`, source the helper from any
directory:

```sh
source /path/to/setup-keycloak-web/scripts/set-env-directurl-config.sh
```

It requires `jq` and exports these fields from the generated config:

| JSON field | Environment variable |
| --- | --- |
| `tokenUrl` | `DIRECT_URL_CONFIG_TOKEN_URL` |
| `clientId` | `DIRECT_URL_CONFIG_CLIENT_ID` |
| `vaultUrl` | `DIRECT_URL_CONFIG_VAULT_URL` |
| `vaultToken` | `DIRECT_URL_CONFIG_VAULT_TOKEN` |
| `vaultSecretPath` | `DIRECT_URL_CONFIG_VAULT_SECRET_PATH` |
| `vaultSecretField` | `DIRECT_URL_CONFIG_VAULT_SECRET_FIELD` |

The Vault token is exported into the current shell's process environment; do
not expose that environment to untrusted processes. Remove the values when
finished:

```sh
source /path/to/setup-keycloak-web/scripts/unset-env-directurl-config.sh
```

## Test client-credentials with `curl`

After `make start-webserver-authcerts`, you can test the local Keycloak machine client and the protected static content without CALM CLI.

Make sure your local `.env` contains `KEYCLOAK_DIRECT_URL_CLIENT_SECRET`. For the curl examples below, set `CA_CERT_FILE_PATH` in your shell to the local certificate path used by curl to trust the self-signed HTTPS endpoint:

```sh
export CA_CERT_FILE_PATH="$(pwd)/infra/nginx/certs/localhost.crt"
export KEYCLOAK_DIRECT_URL_CLIENT_SECRET="$(awk -F= '/^KEYCLOAK_DIRECT_URL_CLIENT_SECRET=/{print $2}' .env)"
```

Then run:

```sh
TOKEN_RESPONSE="$(curl --silent --show-error \
  --request POST \
  --cacert ${CA_CERT_FILE_PATH} \
  --header 'content-type: application/x-www-form-urlencoded' \
  --data-urlencode 'grant_type=client_credentials' \
  --data-urlencode 'client_id=calm-direct-url' \
  --data-urlencode "client_secret=${KEYCLOAK_DIRECT_URL_CLIENT_SECRET}" \
  https://my-calm.repo:8443/keycloak/realms/calm-local/protocol/openid-connect/token)"

ACCESS_TOKEN="$(printf '%s' "$TOKEN_RESPONSE" | python3 -c 'import json,sys; print(json.load(sys.stdin)["access_token"])')"

curl --fail --silent --show-error \
  --cacert ${CA_CERT_FILE_PATH} \
  --header "Authorization: Bearer ${ACCESS_TOKEN}" \
  https://my-calm.repo:8443/architectures/calm-1.json
```

This flow relies on the local stack accepting the `calm-direct-url` service-account token at the proxy layer. Without a bearer token, the same file request should still be rejected.

The direct-url auth config used by the supported CLI module remains minimal:

- `tokenUrl`
- `clientId`
- `clientSecret`

For the Vault-backed example started by `make start-webserver-vaulting`, the helper scripts also:

- start a local HashiCorp Vault dev server on `http://127.0.0.1:8200`
- seed `secret/data/calm/direct-url` with the `KEYCLOAK_DIRECT_URL_CLIENT_SECRET` value from `.env`
- generate `custom-idp/v3/generated/direct-url-auth.json` with Vault lookup settings instead of inline `clientSecret`

For both auth-enabled direct URL examples, the certificate helper copies `infra/nginx/certs/localhost.crt` into the matching example cert directory:

- `make start-webserver-authcerts` -> `custom-idp/v2/certs/localhost.crt`
- `make start-webserver-vaulting` -> `custom-idp/v3/certs/localhost.crt`

TLS trust for the Node-based CLI flow is configured outside the JSON, for example with `NODE_EXTRA_CA_CERTS`. The `--cacert` flags above are curl-only trust settings for these manual checks.

You can then fetch a protected file with that bearer token:

```sh
curl --fail --silent --show-error \
  --cacert ${CA_CERT_FILE_PATH} \
  --header "Authorization: Bearer ${ACCESS_TOKEN}" \
  https://my-calm.repo:8443/architectures/calm-1.json
```

To confirm the route is protected, the same request without a token should return `401`:

```sh
curl --include --silent --show-error \
  https://my-calm.repo:8443/architectures/calm-1.json
```
