# Agent Guidance

## Scope

- Nginx is static-only for now.
- Static content is intentionally anonymous and public.
- `/api` is reserved for future reverse proxying.

## Layout

- Put CALM architecture JSON files in `static/architectures/`.
- Put CALM pattern JSON files in `static/patterns/`.
- Put CALM standard JSON files in `static/standards/`.
- Keep Python service work under `apps/api/`.
- Keep TypeScript web work under `apps/web/`.

## Commands

- `make serve-static`
- `make test-api`
- `make typecheck-web`

## Validation

- Validate Compose changes with `docker-compose config`.
- Validate Python changes with `make test-api`.
- Validate TypeScript changes with `make typecheck-web`.
