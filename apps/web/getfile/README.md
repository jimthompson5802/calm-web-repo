# getfile

Node/TypeScript CLI for fetching CALM files from the local Keycloak-protected nginx stack.

## Prerequisites

- Node.js
- npm
- The local web stack running via `make start-web-server`
- Valid Keycloak user credentials from the local realm

The protected CALM files in this repo are served from `https://localhost:8443/...`.

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

This compiles the CLI to `apps/web/getfile/dist/main.js`.

## Run

From `apps/web`:

```sh
npm run getfile -- https://localhost:8443/architectures/calm-1.json --username local-user --password 'your-password'
```

Or run the compiled file directly:

```sh
cd apps/web
node getfile/dist/main.js https://localhost:8443/architectures/calm-1.json --username local-user --password 'your-password'
```

## Usage

```text
getfile <url> --username <value> --password <value> [--insecure-localhost]
```

Only `https://` target URLs are supported.

The command:

- requests a Keycloak access token using the `calm-cli` client
- sends that token as a bearer token to the target URL
- writes the response body to stdout
- writes errors to stderr and exits non-zero on failure

## Local TLS

Use `--insecure-localhost` only for local development when the localhost TLS certificate is self-signed or not trusted by your machine.
It only applies to local HTTPS targets and does not enable plain HTTP.

Example:

```sh
npm run getfile -- https://localhost:8443/architectures/calm-1.json --username local-user --password 'your-password' --insecure-localhost
```

This flag is only accepted for `localhost`, `127.0.0.1`, or `::1`.

## Notes

- The CLI is intended for this repo's local development stack.
- Credentials are passed explicitly as command-line flags.
- `npm run test:getfile` runs the focused CLI tests.
