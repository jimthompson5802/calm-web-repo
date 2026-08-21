# Direct URL Auth Examples

This directory contains two minimal TypeScript examples of a `directUrlAuth.module`:

- [`v1/`](./v1/) builds the `direct-url-auth-v1` example
- [`v2/`](./v2/) builds the `direct-url-auth-v2` example

Each example has the same structure:

- `src/direct-url-auth.ts` implements the module
- `config/direct-url-auth.json` provides example configuration
- `package.json` and `tsconfig.json` support building the module

## Build

Build the `v1` module:

```bash
cd custom-idp/v1
npm install
npm run build
```

Build the `v2` module:

```bash
cd custom-idp/v2
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

Point `~/.calm.json` at the built JavaScript file for the version you want to use:

```json
{
  "directUrlAuth": {
    "module": "/absolute/path/to/calm-web-repo/custom-idp/v1/dist/direct-url-auth.js",
    "configPath": "/absolute/path/to/calm-web-repo/custom-idp/v1/config/direct-url-auth.json"
  }
}
```

Swap `v1` for `v2` if you want to use the second example instead.

## Contract

The module:

- default-exports a class
- accepts `configPath?: string` in the constructor
- implements `getAuthHeaders(url, requestBody)`
