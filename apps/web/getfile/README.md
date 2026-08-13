# getfile

Node/TypeScript CLI for fetching CALM files from the local Keycloak-protected nginx stack.

## Prerequisites

- Node.js
- npm
- The local web stack running via `make start-web-server`
- A browser available on the local machine

The protected CALM files in this repo are canonically served from `https://my-arch.repo:8443/...`. `localhost` remains accepted for compatibility when the local stack origin file points at a different host.

## Install

From the repo root:

```sh
cd apps/web
npm install
```

## Build

```sh
cd apps/web
npm run getfile:build
```

This compiles the CLI to `apps/web/getfile/dist/`.

## Run

From `apps/web`:

```sh
npm run getfile -- https://my-arch.repo:8443/architectures/calm-1.json
```

If you override `CALM_PUBLIC_HOST`, `getfile` uses the configured stack origin written by `make start-web-server` so both the browser and Docker containers can reach the same Keycloak issuer.

To target a specific browser app instead of the system default, pass `--browser`.
For example on macOS:

```sh
npm run getfile -- https://my-arch.repo:8443/architectures/calm-1.json --browser "Google Chrome"
```

Or run the compiled file directly:

```sh
cd apps/web
node getfile/dist/main.js https://my-arch.repo:8443/architectures/calm-1.json
```

When authentication is required, `getfile` opens the default browser and sends you to the local Keycloak login page. After you finish the browser login flow, the CLI exchanges the returned authorization code for a token, caches that session locally, and fetches the requested file.

## Usage

```text
getfile <url> [--browser <app>] [--insecure-localhost]
```

Only the local stack origins are supported in this version:

- `https://my-arch.repo:8443/...`
- `https://localhost:8443/...`
- the configured stack origin written by `make start-web-server`, such as `https://my-arch.repo:8443/...`

The command:

- opens the browser for Keycloak authentication when needed
- uses OAuth Authorization Code with PKCE
- caches tokens per stack origin in `~/.calm/getfile-token.json`
- silently refreshes the access token before it expires when a refresh token is available
- sends the active access token as a bearer token to the target URL
- writes the response body to stdout
- writes errors to stderr and exits non-zero on failure

## Local TLS

Use `--insecure-localhost` only for local development when the local stack certificate is self-signed or not trusted by your machine.
It applies to the supported local HTTPS origins only and does not enable plain HTTP.

Example:

```sh
npm run getfile -- https://my-arch.repo:8443/architectures/calm-1.json --insecure-localhost
```

## Notes

- This CLI is intentionally scoped to the repo's local development stack.
- Cached sessions are stored per exact `stackOrigin`, so `https://localhost:8443` and `https://my-arch.repo:8443` keep separate entries.
- The browser usually opens only on first login, when the cached session cannot be refreshed, or after the server rejects a cached token.
- If the refresh token is still valid, `getfile` renews the access token automatically before making the file request.
- `npm run test:getfile` runs the focused CLI tests.
