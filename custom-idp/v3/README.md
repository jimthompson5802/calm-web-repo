# Custom IDP Direct URL Auth v3

This sample direct URL auth module follows the current Calm header-only contract.

The plugin exports a class that implements:

```ts
getAuthHeaders(url: string, requestBody: unknown): Promise<Record<string, string>>
```

It gets an OAuth client-credentials token and returns it as an `Authorization` header when CALM invokes the module. The CALM CLI determines which hosts invoke the module through `allowedRemoteHosts` or `CALM_DIRECT_URL_AUTH_AUTHENTICATED_HOSTS`; the module itself does not filter request URLs. For the local Vaulting stack, configure both `my-calm.repo` and `this-calm.repo` as authenticated hosts, while retaining `my-calm.repo` as the canonical Keycloak token endpoint. The OAuth client secret is read from HashiCorp Vault instead of being stored inline in the auth JSON.

## Config

Use `config/direct-url-auth.json` as the starting point:

```json
{
  "tokenUrl": "https://idp.example.com/oauth/token",
  "clientId": "calm-direct-url",
  "vaultUrl": "http://127.0.0.1:8200",
  "vaultToken": "replace-me-dev-token",
  "vaultSecretPath": "secret/data/calm/direct-url",
  "vaultSecretField": "clientSecret"
}
```

`configPath` is required when Calm loads this JSON-backed plugin.

## Environment configuration

`dist/direct-url-env-auth.js` is a separate plugin entry point that reads its
configuration from the process environment and does not use `configPath`.
Configure Calm to load that module, then export:

| Environment variable | Purpose |
| --- | --- |
| `DIRECT_URL_CONFIG_TOKEN_URL` | OAuth token endpoint |
| `DIRECT_URL_CONFIG_CLIENT_ID` | OAuth client ID |
| `DIRECT_URL_CONFIG_VAULT_URL` | Vault base URL |
| `DIRECT_URL_CONFIG_VAULT_TOKEN` | Vault authentication token |
| `DIRECT_URL_CONFIG_VAULT_SECRET_PATH` | Vault KV v2 secret path |
| `DIRECT_URL_CONFIG_VAULT_SECRET_FIELD` | Optional secret field; defaults to `clientSecret` |

For the local generated configuration, source
`scripts/set-env-directurl-config.sh` from the repository root before
invoking Calm. Do not configure a `configPath` for this module.

The local `start-webserver-vaulting` stack seeds the Keycloak machine-client secret into a Vault dev server at `secret/data/calm/direct-url` and generates `generated/direct-url-auth.json` with the local token endpoint and Vault lookup settings.

## Private Certificates

Keep private CA certificates out of source control.

If your IDP or direct URL endpoint uses a private CA, configure Node trust before you run Calm:

```bash
export NODE_EXTRA_CA_CERTS="$PWD/custom-idp/v3/certs/localhost.crt"
```

## Build And Test

```bash
npm test
```
