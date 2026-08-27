# Direct URL Auth Examples

This directory contains three minimal TypeScript examples of a `directUrlAuth.module`:

- [`v1/`](./v1/) builds the `direct-url-auth-v1` example
- [`v2/`](./v2/) builds the `direct-url-auth-v2` example
- [`v3/`](./v3/) builds the `direct-url-auth-v3` example

For the local `setup-keycloak-web` stack, `v2` is the supported module for `make start-webserver-authcerts`. It obtains a Keycloak access token with the OAuth 2.0 client-credentials grant and is wired to the generated local config written by that target. The supported config surface is intentionally limited to `tokenUrl`, `clientId`, and `clientSecret`.

`v3` is the Vault-backed variant for `make start-webserver-vaulting`. It keeps the same OAuth token flow, but it reads the client secret from a local HashiCorp Vault dev server instead of storing the secret inline in the generated auth JSON.

Each example has the same structure:

- `src/direct-url-auth.ts` implements the module
- `config/direct-url-auth.json` provides example configuration
- `package.json` and `tsconfig.json` support building the module

## Build

Build the `v2` module:

```bash
cd custom-idp/v2
npm install
npm test
```

Build the `v3` module:

```bash
cd custom-idp/v3
npm install
npm test
```

Build the `v1` module if you still want the older example:

```bash
cd custom-idp/v1
npm install
npm run build
```

## Direct URL Auth Test Commands

Run these from the repository root to execute only the direct-URL-auth-specific tests:

```bash
source "$HOME/.nvm/nvm.sh" && nvm use >/dev/null && npx vitest run cli/src/cli-config.spec.ts -t "loads directUrlAuth from config|loads direct URL auth module from absolute path and passes configPath to the constructor|loads direct URL auth module with tilde path|rejects a direct URL auth module path that does not end in \.js|rejects when the direct URL auth module file does not exist|wraps any error from the direct URL auth module import in a friendly message" --coverage.enabled=false
```

```bash
source "$HOME/.nvm/nvm.sh" && nvm use >/dev/null && npx vitest run cli/src/cli.spec.ts -t "loads direct URL auth module from config file when directUrlAuth is set|logs an error and continues when direct URL auth module loading throws" --coverage.enabled=false
```

```bash
source "$HOME/.nvm/nvm.sh" && nvm use >/dev/null && npx vitest run shared/src/document-loader/document-loader.spec.ts -t "should pass directUrlAuthPlugin to DirectUrlDocumentLoader" --coverage.enabled=false
```

```bash
source "$HOME/.nvm/nvm.sh" && nvm use >/dev/null && npx vitest run shared/src/document-loader/direct-url-document-loader.spec.ts -t "adds auth headers from the direct URL auth plugin for allowlisted hosts|treats direct URL auth plugin runtime failures as fatal|does not call the direct URL auth plugin for unsafe URLs" --coverage.enabled=false
```

## Use with CALM

For the cert-based auth stack, point `~/.calmauthcerts.json` at the built `v2` JavaScript file and the generated local config:

```json
{
  "directUrlAuth": {
    "module": "/absolute/path/to/setup-keycloak-web/custom-idp/v2/dist/direct-url-auth.js",
    "configPath": "/absolute/path/to/setup-keycloak-web/custom-idp/v2/generated/direct-url-auth.json"
  }
}
```

The generated config contains the local token endpoint, `clientId` (`calm-direct-url`), the machine-client secret from your local `.env`, and the local CA certificate path used to trust the self-signed HTTPS token endpoint.

The generated JSON has this shape:

```json
{
  "tokenUrl": "https://my-calm.repo:8443/keycloak/realms/calm-local/protocol/openid-connect/token",
  "clientId": "calm-direct-url",
  "clientSecret": "<secret>"
}
```

No other direct-URL auth parameters are supported by the local `v2` example.

`make start-webserver-authcerts` also copies the generated `localhost.crt` file into `custom-idp/v2/certs/localhost.crt`.

For the Vault-backed stack, point `~/.calmvaulting.json` at the built `v3` JavaScript file and the generated local config:

```json
{
  "directUrlAuth": {
    "module": "/absolute/path/to/setup-keycloak-web/custom-idp/v3/dist/direct-url-auth.js",
    "configPath": "/absolute/path/to/setup-keycloak-web/custom-idp/v3/generated/direct-url-auth.json"
  }
}
```

The generated `v3` config contains:

```json
{
  "tokenUrl": "https://my-calm.repo:8443/keycloak/realms/calm-local/protocol/openid-connect/token",
  "clientId": "calm-direct-url",
  "vaultUrl": "http://127.0.0.1:8200",
  "vaultToken": "calm-local-vault-root-token",
  "vaultSecretPath": "secret/data/calm/direct-url",
  "vaultSecretField": "clientSecret"
}
```

`make start-webserver-vaulting` also copies the generated `localhost.crt` file into `custom-idp/v3/certs/localhost.crt`.

If the token endpoint or protected direct URL uses a private or self-signed CA, configure Node trust outside the JSON before you run Calm, for example with `NODE_EXTRA_CA_CERTS`.

## Contract

The module:

- default-exports a class
- accepts `configPath?: string` in the constructor
- implements `getAuthHeaders(url, requestBody)`
