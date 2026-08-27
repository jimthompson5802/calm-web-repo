# Custom IDP Direct URL Auth v3

This sample direct URL auth module follows the current Calm header-only contract.

The plugin exports a class that implements:

```ts
getAuthHeaders(url: string, requestBody: unknown): Promise<Record<string, string>>
```

It gets an OAuth client-credentials token and returns it as an `Authorization` header. The OAuth client secret is read from HashiCorp Vault instead of being stored inline in the auth JSON.

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

`configPath` is required when Calm loads the plugin.

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
