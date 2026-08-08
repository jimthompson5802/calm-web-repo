# Agent Guidance

## Scope

- Nginx is static-only for now.
- Static content is intentionally anonymous and public.
- `/api` is reserved for future reverse proxying.
- CALM model files live under `static/` and are served over HTTP by the static server.

## Layout

- Put CALM architecture JSON files in `static/architectures/`.
- Put CALM pattern JSON files in `static/patterns/`.
- Put CALM standard JSON files in `static/standards/`.
- Put CALM control requirement schemas in `static/controls/**/schemas/`.
- Put CALM control configs in `static/controls/**/configs/`.
- Keep Python service work under `apps/api/`.
- Keep TypeScript web work under `apps/web/`.
- Keep Nginx config under `infra/nginx/`.
- Keep repo guidance and usage notes in `docs/`.
- Keep helper scripts in `scripts/`.

## Commands

- `make start-web-server`
- `make stop-web-server`
- `make bootstrap`
- `make test-api`
- `make typecheck-web`
- `./scripts/validate-architecture.sh`

## Validation

- Validate Compose changes with `docker-compose config`.
- Validate Python changes with `make test-api`.
- Validate TypeScript changes with `make typecheck-web`.
- Validate CALM architecture changes with `./scripts/validate-architecture.sh` after the static server is running.
