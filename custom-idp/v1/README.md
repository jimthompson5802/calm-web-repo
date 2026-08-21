# Direct URL Auth Example

This is a minimal TypeScript example of a `directUrlAuth.module`.

## Build

```bash
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

Point `~/.calm.json` at the built JavaScript file:

```json
{
  "directUrlAuth": {
    "module": "/absolute/path/to/sandbox/example/dist/direct-url-auth.js",
    "configPath": "/absolute/path/to/sandbox/example/config/direct-url-auth.json"
  }
}
```

## Contract

The module:

- default-exports a class
- accepts `configPath?: string` in the constructor
- implements `getAuthHeaders(url, requestBody)`
