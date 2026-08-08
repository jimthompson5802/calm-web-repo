# calm-web-repo

Minimal scaffold for serving public FINOS CALM JSON content with Nginx while keeping Python and TypeScript application work ready to start.

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
- `make serve-static` starts Nginx on `http://localhost:8080`.
- `make test-api` runs the Python API tests.
- `make typecheck-web` runs the TypeScript typecheck.

## Static Content

Static content is intentionally anonymous and public at this stage.

Sample public URLs after `make serve-static`:

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
make serve-static
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