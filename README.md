# calm-web-repo

Repository for serving public FINOS CALM JSON content with Nginx, plus Python and TypeScript application scaffolds for future API and UI work.

## Documentation
- `docs/usage-notes.md` captures CALM CLI behavior notes for local-file vs HTTP-loaded resources.

## Layout

- `static/architectures/` holds CALM architecture JSON files.
- `static/patterns/` holds CALM pattern JSON files.
- `static/standards/` holds CALM standard JSON files.
- `static/controls/` holds CALM control requirement schemas and control configuration JSON files.
- `apps/api/` holds the Python service scaffold.
- `apps/web/` holds the TypeScript web scaffold.
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

## Static Content

Static content is intentionally anonymous and public at this stage.

Sample public URLs after `make start-web-server`:

- `http://localhost:8080/architectures/calm-1.json`
- `http://localhost:8080/patterns/company-base-pattern.json`
- `http://localhost:8080/standards/company-node-standard.json`
- `http://localhost:8080/controls/security/schemas/tls-encryption.json`

## Install

Python:

```sh
cd apps/api
uv sync
```

TypeScript:

```sh
cd apps/web
npm install
```

## Start

Run the static server:

```sh
make start-web-server
```

## Stop

Stop the static server and remove the Compose resources:

```sh
make stop-web-server
```

Run the API directly:

```sh
cd apps/api
uv run uvicorn calm_api.main:app --reload
```

Run the web app directly:

```sh
cd apps/web
npm run dev
```
```