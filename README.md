# calm-web-repo

Minimal scaffold for serving public FINOS CALM JSON content with Nginx while keeping Python and TypeScript application work ready to start.

## Findings
- [`docs/usage-notes.md`](docs/usage-notes.md) summarizes findings of using `calm cli` with resources from web vs local files.

## Layout

- `static/architectures/` holds CALM architecture JSON files.
- `static/patterns/` holds CALM pattern JSON files.
- `static/standards/` holds CALM standard JSON files.
- `apps/api/` holds the Python service scaffold.
- `apps/web/` holds the TypeScript web scaffold.
- `infra/nginx/` holds the Nginx config.

`/api` is reserved for future reverse proxying. Do not use that path for static assets.

## Prerequisites

- Docker and `docker-compose`
- Python 3.12+
- `uv`
- Node.js 26+
- npm

## Commands

- `make bootstrap` shows dependency install commands.
- `make start-web-server` starts Nginx on `http://localhost:8080` in detached mode.
- `make stop-web-server` stops the Nginx service and removes the Compose resources.
- `make test-api` runs the Python API tests.
- `make typecheck-web` runs the TypeScript typecheck.

## Static Content

Static content is intentionally anonymous and public at this stage.

Sample public URLs after `make start-web-server`:

- `http://localhost:8080/architectures/sample-architecture.json`
- `http://localhost:8080/patterns/sample-pattern.json`
- `http://localhost:8080/standards/sample-standard.json`

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