# getfile

Node/TypeScript CLI for fetching CALM files from the local Keycloak-protected nginx stack.

## Prerequisites

- Node.js
- npm
- The local web stack running via `make start-web-server`
- A browser available on the local machine

The protected CALM files in this repo are served from `https://localhost:8443/...`, and the auth flow may open a shared detected local-stack host so both the browser and Docker containers can reach the same Keycloak issuer.

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
npm run getfile -- https://localhost:8443/architectures/calm-1.json
```

If `make start-web-server` reports a detected stack host such as `192.168.x.y`, `getfile` may open the browser on that host even when the file URL you pass is still `https://localhost:8443/...`.

To target a specific browser app instead of the system default, pass `--browser`.
For example on macOS:

```sh
npm run getfile -- https://localhost:8443/architectures/calm-1.json --browser "Google Chrome"
```

Or run the compiled file directly:

```sh
cd apps/web
node getfile/dist/main.js https://localhost:8443/architectures/calm-1.json
```

When authentication is required, `getfile` opens the default browser and sends you to the local Keycloak login page. After you finish the browser login flow, the CLI exchanges the returned authorization code for a token and fetches the requested file.

## Usage

```text
getfile <url> [--browser <app>] [--insecure-localhost]
```

Only the local stack origins are supported in this version:

- `https://localhost:8443/...`
- the detected shared local-stack host written by `make start-web-server`

The command:

- opens the browser for Keycloak authentication when needed
- uses OAuth Authorization Code with PKCE
- sends the returned access token as a bearer token to the target URL
- writes the response body to stdout
- writes errors to stderr and exits non-zero on failure

## Local TLS

Use `--insecure-localhost` only for local development when the local stack certificate is self-signed or not trusted by your machine.
It applies to the supported local HTTPS origins only and does not enable plain HTTP.

Example:

```sh
npm run getfile -- https://localhost:8443/architectures/calm-1.json --insecure-localhost
```

## Notes

- This CLI is intentionally scoped to the repo's local development stack.
- Tokens are kept in memory for the current invocation only.
- Each invocation may open the browser again. If you already have an active Keycloak session, you may not need to re-enter credentials.
- `npm run test:getfile` runs the focused CLI tests.
