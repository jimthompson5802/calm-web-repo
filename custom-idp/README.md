# Direct URL Auth Examples

This directory contains two minimal TypeScript examples of a `directUrlAuth.module`:

- [`v1/`](./v1/) builds the `direct-url-auth-v1` example
- [`v2/`](./v2/) builds the `direct-url-auth-v2` example

For the local `setup-keycloak-web` stack, `v2` is the supported module. It obtains a Keycloak access token with the OAuth 2.0 client-credentials grant and is wired to the generated local config written by `make start-webserver-authonly` or `make start-webserver-authcerts`.

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

For this stack, point `~/.calm.json` at the built `v2` JavaScript file and the generated local config:

```json
{
  "directUrlAuth": {
    "module": "/absolute/path/to/setup-keycloak-web/custom-idp/v2/dist/direct-url-auth.js",
    "configPath": "/absolute/path/to/setup-keycloak-web/custom-idp/v2/generated/direct-url-auth.json"
  }
}
```

The generated config contains the local token endpoint, `clientId` (`calm-direct-url`), the machine-client secret from your local `.env`, and the local CA certificate path used to trust the self-signed HTTPS token endpoint.

## Contract

The module:

- default-exports a class
- accepts `configPath?: string` in the constructor
- implements `getAuthHeaders(url, requestBody)`
- may optionally implement `getTlsConfig()` to provide TLS trust material for the protected direct-URL fetch itself
