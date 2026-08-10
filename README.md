# CALM Artifact Access Testbed

Repository for serving FINOS CALM JSON content with Nginx, plus Python and TypeScript application scaffolds for future API and UI work. Local development now supports both anonymous HTTP access for CLI validation workflows and authenticated HTTPS access backed by Keycloak.

## Testbed CALM Architecture
[CALM Architecture JSON](docs/architecture/web-repo-architecture.json)

![](docs/images/index-1.png)

## Documentation
- [`docs/usage-notes.md`](docs/usage-notes.md) captures CALM CLI behavior notes for local-file vs HTTP-loaded resources.
- [`docs/validate-architecture-script.md`](docs/validate-architecture-script.md) describes the scripted CALM architecture validation checks.
- [`docs/control-validation-test-explanation.md`](docs/control-validation-test-explanation.md) explains node-level control validation results for `control-test-architecture.json`.

## Layout

- `static/architectures/` holds CALM architecture JSON files.
- `static/patterns/` holds CALM pattern JSON files.
- `static/standards/` holds CALM standard JSON files.
- `static/controls/` holds CALM control requirement schemas and control configuration JSON files.
- `apps/api/` holds the Python service scaffold (FUTURE WORK).
- `apps/web/` holds the TypeScript web scaffold (FUTURE WORK).
- `infra/nginx/` holds the Nginx config and local TLS assets.
- `infra/keycloak/` holds the local Keycloak realm template used to generate the dev import.

`/api` is reserved for future reverse proxying. Do not use that path for static assets.

## Prerequisites

- Docker and `docker-compose`
- Python 3.12+
- `uv`
- Node.js (LTS recommended)
- npm

## Commands

- `make bootstrap` shows dependency install commands.
- `make start-web-server` generates local TLS/auth assets and starts the full web auth stack in detached mode.
- `make stop-web-server` stops the Nginx service and removes the Compose resources.
- `make test-api` runs the Python API tests.
- `make typecheck-web` runs the TypeScript typecheck.

## Validation

- `docker-compose config` validates Compose configuration.
- `make test-api` validates Python API behavior.
- `make typecheck-web` validates TypeScript types.
- `./scripts/validate-architecture.sh` runs CALM validation checks for detailed architecture references.

## Control Authoring Note

- In `static/architectures/ecommerce-platform.json`, control `requirement-url` values point to assets served from `http://localhost:8080/controls/...`.
- Control configuration is intentionally inlined with `config` for architecture requirements in this repo.
- Keep control configs in `static/controls/**/configs/*.json` as reusable source artifacts, but copy values inline when updating architecture control requirements. At present there appears to be a false-positive error when the config-url is used.

## Static Content

Static content remains anonymously available on the HTTP endpoint for CALM CLI validation and backward-compatible local workflows.

Sample anonymous URLs after `make start-web-server`:

- `http://localhost:8080/architectures/calm-1.json`
- `http://localhost:8080/patterns/company-base-pattern.json`
- `http://localhost:8080/standards/company-node-standard.json`
- `http://localhost:8080/controls/security/schemas/tls-encryption.json`

The primary browser-facing endpoint is authenticated HTTPS:

- `https://localhost:8443/`
- `https://localhost:8443/architectures/calm-1.json`

Local Keycloak admin access is published on:

- `http://localhost:8081/admin/`

## Install

Python (FUTURE WORK):

```sh
cd apps/api
uv sync
```

TypeScript (FUTURE WORK):

```sh
cd apps/web
npm install
```

## Web Server

### Start

1. Copy `.env.example` to `.env`.
2. Set local-only values for:
   - `KC_BOOTSTRAP_ADMIN_PASSWORD`
   - `OAUTH2_PROXY_CLIENT_SECRET`
   - `OAUTH2_PROXY_COOKIE_SECRET`
   - `KEYCLOAK_TEST_USER_PASSWORD`
3. Start the full local stack:

```sh
make start-web-server
```

`make start-web-server` will:

- create a local self-signed certificate under `infra/nginx/certs/` if one is missing
- render a local Keycloak realm import into `infra/keycloak/import/`
- start `keycloak`, `oauth2-proxy`, and `nginx`

If you need a cookie secret, generate one with:

```sh
openssl rand -hex 16
```

### Stop

Stop the static server and remove the Compose resources:

```sh
make stop-web-server
```

## API Access
Run the API directly (FUTURE WORK):

```sh
cd apps/api
uv run uvicorn calm_api.main:app --reload
```

Run the web app directly (FUTURE WORK):

```sh
cd apps/web
npm run dev
```

## Secret Handling

- Real secrets stay in local `.env`, `infra/nginx/certs/`, and the generated `infra/keycloak/import/` directory.
- `.env.example` is safe to commit because it contains placeholders only.
- `.gitignore` excludes `.env`, local certificates, and generated Keycloak import artifacts so they do not get committed to the public repository.
- The tracked Keycloak file is a template; the real client secret and test-user password are rendered locally before startup.
