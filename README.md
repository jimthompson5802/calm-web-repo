# CALM Artifact Access Testbed

Repository for serving public FINOS CALM JSON content with Nginx, plus Python and TypeScript application scaffolds for future API and UI work.

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
- `infra/nginx/` holds the Nginx config.

`/api` is reserved for future reverse proxying. Do not use that path for static assets.

## Prerequisites

- Docker and `docker-compose`
- Python 3.12+
- `uv`
- Node.js (LTS recommended)
- npm

## Commands

- `make bootstrap` shows dependency install commands.
- `make start-web-server` starts Nginx on `http://localhost:8080` in detached mode.
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

Static content is intentionally anonymous and public at this stage.

Sample public URLs after `make start-web-server`:

- `http://localhost:8080/architectures/calm-1.json`
- `http://localhost:8080/patterns/company-base-pattern.json`
- `http://localhost:8080/standards/company-node-standard.json`
- `http://localhost:8080/controls/security/schemas/tls-encryption.json`

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

Run the static server:

```sh
make start-web-server
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
